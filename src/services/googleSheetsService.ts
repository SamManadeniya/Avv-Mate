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

    // Auto-refresh token if expired
    if (googleDriveService.isConfigured() && !googleDriveService.isTokenValid() && googleDriveService.getConfig().clientId) {
      try {
        await googleDriveService.requestOAuthToken();
      } catch (authErr) {
        console.warn('OAuth refresh before master spreadsheet:', authErr);
      }
    }

    const token = googleDriveService.getConfig().accessToken;
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
        }),
      });

      if (res.ok) {
        const data = await res.json();
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
      console.warn('Serverless master spreadsheet check failed, trying direct Drive API:', err);
    }

    // Direct Google Drive API creation fallback (Immune to serverless cold starts or timeout)
    try {
      const searchQ = `name='AVV Mate Master Database' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          const existing = searchData.files[0];
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

      // Create directly in AVV Mate Drive
      const body: Record<string, any> = {
        name: 'AVV Mate Master Database',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      };
      if (parentFolderId) {
        body.parents = [parentFolderId];
      }

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (createRes.ok) {
        const created = await createRes.json();
        const info: MasterSheetInfo = {
          spreadsheetId: created.id,
          title: created.name,
          webViewLink: created.webViewLink || `https://docs.google.com/spreadsheets/d/${created.id}/edit`,
          isNew: true,
        };
        this.sheetInfoCache = info;
        localStorage.setItem(this.STORAGE_KEY_ID, info.spreadsheetId);
        localStorage.setItem(this.STORAGE_KEY_URL, info.webViewLink);
        return info;
      }
    } catch (directErr) {
      console.warn('Direct Drive API creation fallback failed:', directErr);
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
   */
  public async syncAllDataToMasterSheet(
    jobs: ComplianceJob[],
    vehicles: Vehicle[],
    workshops: RawWorkshop[],
    modelReports: ModelReport[]
  ): Promise<{ success: boolean; spreadsheetUrl: string; syncedTabs: string[] }> {
    const sheet = await this.getMasterSpreadsheet();
    const token = googleDriveService.getConfig().accessToken;

    if (!token || sheet.spreadsheetId.startsWith('demo_')) {
      return {
        success: true,
        spreadsheetUrl: sheet.webViewLink,
        syncedTabs: ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports'],
      };
    }

    const res = await fetch('/api/drive-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncMasterSpreadsheet',
        spreadsheetId: sheet.spreadsheetId,
        accessToken: token,
        tablesData: {
          jobs,
          vehicles,
          workshops,
          modelReports,
        },
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const err: any = new Error(errJson.error || `Failed to sync tables to Google Sheets (${res.status})`);
      if (errJson.enableApiUrl || errJson.apiDisabled || (err.message && err.message.includes('sheets.googleapis.com'))) {
        err.enableApiUrl = errJson.enableApiUrl || 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136';
      }
      throw err;
    }

    const data = await res.json();
    return {
      success: true,
      spreadsheetUrl: data.spreadsheetUrl || sheet.webViewLink,
      syncedTabs: data.syncedTabs || ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports'],
    };
  }

  /**
   * Reads all 4 tables directly from the Master Google Spreadsheet.
   */
  public async readAllFromMasterSheet(): Promise<MasterSheetTablesData> {
    const sheet = await this.getMasterSpreadsheet();
    const token = googleDriveService.getConfig().accessToken;

    if (!token || sheet.spreadsheetId.startsWith('demo_')) {
      return {
        jobs: [],
        vehicles: [],
        workshops: [],
        modelReports: [],
      };
    }

    const res = await fetch('/api/drive-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'readMasterSpreadsheet',
        spreadsheetId: sheet.spreadsheetId,
        accessToken: token,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const err: any = new Error(errJson.error || `Failed to read tables from Google Sheets (${res.status})`);
      if (errJson.enableApiUrl || errJson.apiDisabled || (err.message && err.message.includes('sheets.googleapis.com'))) {
        err.enableApiUrl = errJson.enableApiUrl || 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136';
      }
      throw err;
    }

    const resData = await res.json();
    return resData.data || {
      jobs: [],
      vehicles: [],
      workshops: [],
      modelReports: [],
    };
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

