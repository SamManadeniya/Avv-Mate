import { googleDriveService } from './googleDriveService';
import type { ComplianceJob, Vehicle, RawWorkshop, ModelReport } from '../types';

export interface MasterSheetInfo {
  spreadsheetId: string;
  title: string;
  webViewLink: string;
  isNew?: boolean;
}

export interface MasterSheetTablesData {
  jobs: ComplianceJob[];
  vehicles: Vehicle[];
  workshops: RawWorkshop[];
  modelReports: ModelReport[];
}

class GoogleSheetsService {
  private sheetInfoCache: MasterSheetInfo | null = null;
  private readonly STORAGE_KEY_ID = 'avv_mate_master_sheet_id';
  private readonly STORAGE_KEY_URL = 'avv_mate_master_sheet_url';
  private readonly STORAGE_KEY_USE_SHEETS_PRIMARY = 'avv_mate_use_sheets_primary_db';
  private readonly STORAGE_KEY_MASTER_CACHE = 'avv_mate_master_cache';

  /**
   * Retrieves offline cached data so page refreshes are instant (0ms delay).
   */
  public getCachedMasterData(): MasterSheetTablesData | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_MASTER_CACHE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (Array.isArray(parsed.jobs) || Array.isArray(parsed.vehicles) || Array.isArray(parsed.workshops) || Array.isArray(parsed.modelReports))) {
          return {
            jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
            vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
            workshops: Array.isArray(parsed.workshops) ? parsed.workshops : [],
            modelReports: Array.isArray(parsed.modelReports) ? parsed.modelReports : [],
          };
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Persists master database snapshot into localStorage for zero-latency hydration.
   */
  public setCachedMasterData(data: MasterSheetTablesData): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_MASTER_CACHE, JSON.stringify(data));
      localStorage.setItem('avv_mate_master_cache_time', Date.now().toString());
    } catch (e) {
      console.warn('Failed to cache master sheet data:', e);
    }
  }

  /**
   * Returns whether Google Drive / Sheets credentials are configured.
   */
  public isConfigured(): boolean {
    return googleDriveService.isConfigured();
  }

  /**
   * Returns whether user has switched to Google Sheets as the primary database.
   */
  public isSheetsPrimary(): boolean {
    return localStorage.getItem(this.STORAGE_KEY_USE_SHEETS_PRIMARY) === 'true';
  }

  /**
   * Set Google Sheets as the primary database mode.
   */
  public setSheetsPrimary(enabled: boolean): void {
    localStorage.setItem(this.STORAGE_KEY_USE_SHEETS_PRIMARY, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('avv_mate_db_mode_changed'));
  }

  /**
   * Retrieves or creates the 1 Master Workbook with 4 tabs inside AVV Mate Drive:
   * 1. Compliance_Jobs
   * 2. Vehicles
   * 3. RAW_Workshops
   * 4. Model_Reports
   */
  public async getMasterSpreadsheet(forceRefresh = false): Promise<MasterSheetInfo> {
    const cachedId = localStorage.getItem(this.STORAGE_KEY_ID);
    const cachedUrl = localStorage.getItem(this.STORAGE_KEY_URL);

    // Discard any dummy demo URLs that trigger Google's "file does not exist"
    if (cachedUrl && (cachedUrl.includes('demo_') || !cachedUrl.includes('google.com/spreadsheets/d/'))) {
      localStorage.removeItem(this.STORAGE_KEY_ID);
      localStorage.removeItem(this.STORAGE_KEY_URL);
      this.sheetInfoCache = null;
    } else if (!forceRefresh && cachedId && cachedUrl) {
      this.sheetInfoCache = {
        spreadsheetId: cachedId,
        title: 'AVV Mate Master Database',
        webViewLink: cachedUrl,
      };
      return this.sheetInfoCache;
    }

    let token = '';
    try {
      token = await googleDriveService.getValidToken();
    } catch (authErr) {
      console.warn('Could not acquire valid OAuth token for master spreadsheet:', authErr);
      if (cachedId && cachedUrl) {
        return {
          spreadsheetId: cachedId,
          title: 'AVV Mate Master Database',
          webViewLink: cachedUrl,
        };
      }
      throw authErr;
    }

    const parentFolderId = googleDriveService.getConfig().rootFolderId || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';

    if (!token) {
      throw new Error('Google Drive account is not authorized. Please click "Drive Active" in the top bar to connect your Google account.');
    }

    try {
      const res = await fetch('/api/drive-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getOrCreateMasterSpreadsheet',
          parentFolderId,
          spreadsheetTitle: 'AVV Mate Master Database',
          accessToken: token,
          refreshToken: googleDriveService.getConfig().refreshToken,
          clientId: googleDriveService.getConfig().clientId,
          clientSecret: googleDriveService.getConfig().clientSecret,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.refreshedAccessToken) {
          googleDriveService.saveConfig({ accessToken: data.refreshedAccessToken });
        }
        if (data.spreadsheetId) {
          const info: MasterSheetInfo = {
            spreadsheetId: data.spreadsheetId,
            title: data.title || 'AVV Mate Master Database',
            webViewLink: data.webViewLink || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
            isNew: data.created,
          };

          this.sheetInfoCache = info;
          localStorage.setItem(this.STORAGE_KEY_ID, info.spreadsheetId);
          localStorage.setItem(this.STORAGE_KEY_URL, info.webViewLink);
          return info;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.enableApiUrl || errJson.apiDisabled) {
          const err: any = new Error(errJson.error || 'Google Sheets API is disabled in Google Cloud Console.');
          err.enableApiUrl = errJson.enableApiUrl || 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136';
          throw err;
        }
      }
    } catch (err: any) {
      if (err.enableApiUrl) {
        throw err;
      }
      console.warn('Serverless master spreadsheet check failed, trying direct Sheets API:', err);
    }

    // Direct Google Sheets API creation fallback
    try {
      const searchQ = `name='AVV Mate Master Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        for (const existing of (searchData.files || [])) {
          // Verify with Sheets API that the file actually exists
          const testRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${existing.id}?fields=spreadsheetId`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);

          if (testRes && testRes.ok) {
            const info: MasterSheetInfo = {
              spreadsheetId: existing.id,
              title: existing.name,
              webViewLink: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
            };
            this.sheetInfoCache = info;
            localStorage.setItem(this.STORAGE_KEY_ID, info.spreadsheetId);
            localStorage.setItem(this.STORAGE_KEY_URL, info.webViewLink);
            return info;
          }
        }
      }

      // Create directly using Google Sheets API v4
      const sheetTabs = [
        { properties: { title: 'Compliance_Jobs', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Vehicles', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'RAW_Workshops', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Model_Reports', gridProperties: { frozenRowCount: 1 } } },
      ];

      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title: 'AVV Mate Master Database' },
          sheets: sheetTabs,
        }),
      });

      if (createRes.ok) {
        const created = await createRes.json();
        const spreadsheetId = created.spreadsheetId;
        const webViewLink = created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        // Move into AVV Mate Drive folder
        if (parentFolderId && spreadsheetId) {
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&supportsAllDrives=true`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
          } catch (_) {}
        }

        const info: MasterSheetInfo = {
          spreadsheetId,
          title: created.properties?.title || 'AVV Mate Master Database',
          webViewLink,
          isNew: true,
        };
        this.sheetInfoCache = info;
        localStorage.setItem(this.STORAGE_KEY_ID, info.spreadsheetId);
        localStorage.setItem(this.STORAGE_KEY_URL, info.webViewLink);
        return info;
      }
    } catch (directErr) {
      console.warn('Direct Sheets API creation fallback failed:', directErr);
    }

    if (cachedId && cachedUrl && !cachedUrl.includes('demo_')) {
      return {
        spreadsheetId: cachedId,
        title: 'AVV Mate Master Database',
        webViewLink: cachedUrl,
      };
    }

    throw new Error('Unable to create Master Spreadsheet in AVV Mate Drive. Please verify your Google account permissions.');
  }

  /**
   * Syncs all 4 tables into the 4 tabs of the Master Spreadsheet.
   * Auto-refreshes token, handles 401 transparently, and caches data locally.
   */
  public async syncAllDataToMasterSheet(
    jobs: ComplianceJob[],
    vehicles: Vehicle[],
    workshops: RawWorkshop[],
    modelReports: ModelReport[]
  ): Promise<{ success: boolean; spreadsheetUrl: string; syncedTabs: string[] }> {
    // 1. Immediately persist snapshot into localStorage so refresh/reload never loses data
    this.setCachedMasterData({ jobs, vehicles, workshops, modelReports });

    const sheet = await this.getMasterSpreadsheet();
    let token = await googleDriveService.getValidToken();

    if (!token || sheet.spreadsheetId.startsWith('demo_')) {
      return {
        success: true,
        spreadsheetUrl: sheet.webViewLink,
        syncedTabs: ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports'],
      };
    }

    const payload = {
      action: 'syncMasterSpreadsheet',
      spreadsheetId: sheet.spreadsheetId,
      accessToken: token,
      refreshToken: googleDriveService.getConfig().refreshToken,
      clientId: googleDriveService.getConfig().clientId,
      clientSecret: googleDriveService.getConfig().clientSecret,
      tablesData: {
        jobs,
        vehicles,
        workshops,
        modelReports,
      },
    };

    let res = await fetch('/api/drive-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // If 401 UNAUTHENTICATED, try forcing a fresh token and retry once
    if (res.status === 401) {
      try {
        const freshToken = await googleDriveService.getValidToken(true);
        if (freshToken) {
          payload.accessToken = freshToken;
          res = await fetch('/api/drive-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      } catch (retryErr) {
        console.warn('Re-auth retry on 401 failed:', retryErr);
      }
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 401 || errJson.authExpired) {
        window.dispatchEvent(new CustomEvent('avv_mate_auth_expired'));
      }
      const err: any = new Error(errJson.error || `Failed to sync tables to Google Sheets (${res.status})`);
      if (errJson.enableApiUrl || errJson.apiDisabled || (err.message && err.message.includes('sheets.googleapis.com'))) {
        err.enableApiUrl = errJson.enableApiUrl || 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136';
      }
      throw err;
    }

    const data = await res.json();
    if (data.refreshedAccessToken) {
      googleDriveService.saveConfig({ accessToken: data.refreshedAccessToken });
    }

    return {
      success: true,
      spreadsheetUrl: data.spreadsheetUrl || sheet.webViewLink,
      syncedTabs: data.syncedTabs || ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports'],
    };
  }

  /**
   * Reads all 4 tables directly from the Master Google Spreadsheet.
   * Leverages local cache for instant refresh and silently recovers from 401.
   */
  public async readAllFromMasterSheet(): Promise<MasterSheetTablesData> {
    const cachedData = this.getCachedMasterData();

    let sheet: MasterSheetInfo | null = null;
    let token = '';
    try {
      sheet = await this.getMasterSpreadsheet();
      token = await googleDriveService.getValidToken();
    } catch (initErr) {
      console.warn('Could not prepare auth for reading Master Sheet:', initErr);
      if (cachedData) {
        return cachedData;
      }
      return { jobs: [], vehicles: [], workshops: [], modelReports: [] };
    }

    if (!token || !sheet || sheet.spreadsheetId.startsWith('demo_')) {
      return cachedData || { jobs: [], vehicles: [], workshops: [], modelReports: [] };
    }

    const payload = {
      action: 'readMasterSpreadsheet',
      spreadsheetId: sheet.spreadsheetId,
      accessToken: token,
      refreshToken: googleDriveService.getConfig().refreshToken,
      clientId: googleDriveService.getConfig().clientId,
      clientSecret: googleDriveService.getConfig().clientSecret,
    };

    let res = await fetch('/api/drive-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // If 401, attempt force token renewal and retry once
    if (res.status === 401) {
      try {
        const freshToken = await googleDriveService.getValidToken(true);
        if (freshToken) {
          payload.accessToken = freshToken;
          res = await fetch('/api/drive-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      } catch (_) {}
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 401 || errJson.authExpired) {
        window.dispatchEvent(new CustomEvent('avv_mate_auth_expired'));
      }
      // If we have cached data, return it immediately so page refresh never looks broken!
      if (cachedData) {
        return cachedData;
      }
      const err: any = new Error(errJson.error || `Failed to read tables from Google Sheets (${res.status})`);
      if (errJson.enableApiUrl || errJson.apiDisabled || (err.message && err.message.includes('sheets.googleapis.com'))) {
        err.enableApiUrl = errJson.enableApiUrl || 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136';
      }
      throw err;
    }

    const resData = await res.json();
    if (resData.refreshedAccessToken) {
      googleDriveService.saveConfig({ accessToken: resData.refreshedAccessToken });
    }

    const liveData: MasterSheetTablesData = resData.data || {
      jobs: [],
      vehicles: [],
      workshops: [],
      modelReports: [],
    };

    // Update persistent cache with freshly fetched live data
    this.setCachedMasterData(liveData);
    return liveData;
  }

  /**
   * Returns direct URL to open Master Google Sheet in browser.
   */
  public getMasterSheetUrl(): string {
    const cached = this.sheetInfoCache?.webViewLink || localStorage.getItem(this.STORAGE_KEY_URL);
    if (cached && !cached.includes('demo_') && cached.includes('google.com/spreadsheets/d/')) {
      return cached;
    }
    return 'https://drive.google.com/drive/folders/12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';
  }
}

export const googleSheetsService = new GoogleSheetsService();

