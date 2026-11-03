/**
 * Google Drive SaaS Integration Service for AVV Mate
 * 
 * Provides automated folder hierarchy management:
 * 📁 {FOLDER_NO} (e.g. SVC1028)
 *    ├── 📁 DOCS      (Compliance documents / PDFs)
 *    └── 📁 MEDIA
 *         ├── 📁 PHOTOS (Batch compliance photos, 30–80+ high-res images)
 *         ├── 📁 VIDEOS (Direct inspection video uploads)
 *         └── 📁 SUBMIT (Empty directory reserved for final compliance packages)
 */

export interface GoogleDriveConfig {
  enabled: boolean;
  clientId: string;
  apiKey?: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  rootFolderId?: string; // Optional parent folder ID (e.g. "Shared with me" or dedicated Drive folder)
  rootFolderName?: string;
  userEmail?: string;
  userName?: string;
  storageMode: 'google_drive' | 'supabase_only' | 'hybrid';
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink: string;
}

export interface VehicleDriveHierarchy {
  vehicleFolder: DriveFolderInfo;
  docsFolder: DriveFolderInfo;
  mediaFolder: DriveFolderInfo;
  photosFolder: DriveFolderInfo;
  videosFolder: DriveFolderInfo;
  submitFolder: DriveFolderInfo;
}

export interface DriveUploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  webViewLink: string;
  webContentLink?: string;
}

const STORAGE_KEY = 'avv_mate_gdrive_config';
const FOLDER_CACHE_KEY_PREFIX = 'avv_mate_drive_hierarchy_';

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

class GoogleDriveService {
  private config: GoogleDriveConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  public loadConfig(): GoogleDriveConfig {
    const envClientId = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '').trim();
    const envAccessToken = (import.meta.env.VITE_GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
    const envRootFolder = (import.meta.env.VITE_GOOGLE_DRIVE_ROOT_FOLDER || '').trim();

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...parsed,
          clientId: parsed.clientId || envClientId,
          accessToken: parsed.accessToken || envAccessToken,
          rootFolderId: parsed.rootFolderId || envRootFolder,
          enabled: parsed.enabled !== undefined ? parsed.enabled : Boolean(envAccessToken || envClientId),
          storageMode: parsed.storageMode || 'google_drive',
        };
      }
    } catch (e) {
      console.warn('Failed to load Google Drive configuration:', e);
    }

    return {
      enabled: Boolean(envAccessToken || envClientId),
      clientId: envClientId,
      accessToken: envAccessToken,
      rootFolderId: envRootFolder,
      storageMode: 'google_drive',
    };
  }

  public saveConfig(newConfig: Partial<GoogleDriveConfig>): GoogleDriveConfig {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      window.dispatchEvent(new CustomEvent('avv_mate_drive_config_updated', { detail: this.config }));
    } catch (e) {
      console.error('Failed to save Google Drive configuration:', e);
    }
    return this.config;
  }

  public getConfig(): GoogleDriveConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.enabled && (this.config.accessToken || this.config.clientId));
  }

  public isTokenValid(): boolean {
    if (!this.config.accessToken) return false;
    if (this.config.tokenExpiresAt && Date.now() >= this.config.tokenExpiresAt) {
      return false;
    }
    return true;
  }

  /**
   * Cleans URLs or IDs to get exact folder ID.
   * Recognizes:
   * 1. Direct URLs: 
   *    - https://drive.google.com/drive/folders/1AbC...
   *    - https://drive.google.com/drive/project/1CabfFBbXFvuYqL5hzaXW0yLYa_01D5rV...
   *    - https://drive.google.com/file/d/1AbC...
   * 2. Direct folder IDs: 1AbC-D_1234 (alphanumeric, >= 20 characters)
   * 3. Friendly names: returns trimmed name if it is not a direct ID
   */
  public cleanFolderId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    // Matches Google Drive folder, project, or file URL patterns
    const urlMatch = trimmed.match(/(?:folders|project|file\/d)\/([a-zA-Z0-9_-]{15,})/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
    // Matches ?id=1AbC...
    const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
    if (queryMatch && queryMatch[1]) {
      return queryMatch[1];
    }
    // If it looks like a valid Google Drive ID (20+ alphanumeric chars without spaces or slashes)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
      return trimmed;
    }
    // Return friendly name
    return trimmed;
  }

  /**
   * Checks whether a string represents a valid Google Drive resource ID
   */
  public isValidDriveId(idOrName?: string): boolean {
    if (!idOrName) return false;
    return /^[a-zA-Z0-9_-]{20,}$/.test(idOrName.trim());
  }

  /**
   * Generates a direct Google OAuth Redirect URL (bypasses browser popup blockers completely)
   */
  public getDirectAuthUrl(customClientId?: string): string {
    const clientId = customClientId || this.config.clientId;
    if (!clientId) {
      throw new Error('Google OAuth Client ID is required.');
    }
    const redirectUri = typeof window !== 'undefined' ? window.location.origin : 'https://avvmate.netlify.app';
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly');
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&prompt=consent`;
  }

  /**
   * Checks if Google OAuth redirected back with #access_token in URL hash
   */
  public parseAuthCallbackFromUrl(): boolean {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
      const params = new URLSearchParams(cleanHash);
      const token = params.get('access_token');
      const expiresIn = Number(params.get('expires_in')) || 3599;

      if (token) {
        this.saveConfig({
          accessToken: token,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
          enabled: true,
        });

        // Clean the hash from the browser address bar without reload
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        // Fetch user info in background
        this.testConnection(token).catch(err => {
          console.warn('Background Drive test error:', err);
        });

        return true;
      }
    }
    return false;
  }

  /**
   * Dynamically loads Google Identity Services client script
   */
  public loadGsiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        return resolve();
      }

      const existingScript = document.getElementById('google-gsi-client');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve());
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = err => reject(new Error('Failed to load Google Identity Services: ' + err));
      document.head.appendChild(script);
    });
  }

  /**
   * Initiates Google OAuth 2.0 Web Token popup
   */
  public async requestOAuthToken(customClientId?: string): Promise<{ accessToken: string; expiresIn: number }> {
    const clientId = customClientId || this.config.clientId;
    if (!clientId) {
      throw new Error('Google OAuth Client ID is required. Please enter your Client ID.');
    }

    await this.loadGsiScript();

    return new Promise((resolve, reject) => {
      try {
        let hasResponded = false;
        const timer = setTimeout(() => {
          if (!hasResponded) {
            reject(new Error('Google authorization window was closed or blocked by Safari. Please check if your browser blocked popups.'));
          }
        }, 90000);

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
          callback: (response: any) => {
            hasResponded = true;
            clearTimeout(timer);
            if (response.error) {
              return reject(new Error(response.error_description || response.error));
            }
            if (response.access_token) {
              const expiresInSec = Number(response.expires_in) || 3599;
              const expiresAt = Date.now() + expiresInSec * 1000;

              this.saveConfig({
                accessToken: response.access_token,
                tokenExpiresAt: expiresAt,
                enabled: true,
              });

              resolve({
                accessToken: response.access_token,
                expiresIn: expiresInSec,
              });
            } else {
              reject(new Error('No access token received from Google authentication.'));
            }
          },
          error_callback: (error: any) => {
            hasResponded = true;
            clearTimeout(timer);
            reject(new Error(error?.message || 'Google authentication encountered an error.'));
          }
        });

        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to initialize Google authentication window.'));
      }
    });
  }

  /**
   * Tests connection with Google Drive API
   */
  public async testConnection(token?: string): Promise<{
    user: { displayName: string; emailAddress: string };
    quota: { limit?: string; usage?: string };
    rootFolderName?: string;
  }> {
    const activeToken = token || this.config.accessToken;
    if (!activeToken) {
      throw new Error('No access token available. Please connect your Google account or provide an access token.');
    }

    let userEmail = 'Google Drive User';
    let userName = 'Connected Account';

    // 1. Try to fetch user info via Google OAuth2 Userinfo endpoint (CORS friendly)
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userEmail = userData.email || userEmail;
        userName = userData.name || userName;
      }
    } catch (_) {}

    // 2. Validate Google Drive API access via files endpoint (supportsAllDrives for shared folders)
    try {
      const filesRes = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (!filesRes.ok) {
        let msg = `Google Drive connection failed (${filesRes.status})`;
        try {
          const errJson = await filesRes.json();
          msg = errJson.error?.message || msg;
        } catch (_) {}
        throw new Error(msg);
      }
    } catch (fetchErr: any) {
      if (fetchErr.name === 'TypeError' || fetchErr.message?.includes('fetch') || fetchErr.message?.includes('Load failed')) {
        throw new Error(
          'Google API blocked browser request (CORS/Origin issue). Please ensure https://avvmate.netlify.app is added to "Authorised JavaScript origins" in Google Cloud Console, and that "Google Drive API" is enabled in your Google Cloud project.'
        );
      }
      throw fetchErr;
    }

    let rootFolderName: string | undefined;
    if (this.config.rootFolderId) {
      const cleanRoot = this.cleanFolderId(this.config.rootFolderId);
      if (this.isValidDriveId(cleanRoot)) {
        try {
          const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanRoot}?supportsAllDrives=true&fields=id,name`, {
            headers: { Authorization: `Bearer ${activeToken}` },
          });
          if (folderRes.ok) {
            const folderData = await folderRes.json();
            rootFolderName = folderData.name;
          }
        } catch (e) {
          console.warn('Could not fetch root folder name:', e);
        }
      } else {
        // Root is a friendly name, resolve it
        const resolvedId = await this.resolveParentFolderId(cleanRoot, activeToken);
        if (resolvedId) {
          rootFolderName = cleanRoot;
        }
      }
    }

    // Update config with live user metadata
    this.saveConfig({
      userEmail,
      userName,
      rootFolderName,
    });

    return {
      user: { displayName: userName, emailAddress: userEmail },
      quota: {},
      rootFolderName,
    };
  }

  /**
   * Resolves a folder name, URL, or ID to a verified Google Drive folder ID.
   * If given a name (e.g. "AVV Mate Drive"), searches Google Drive including Shared with Me.
   */
  public async resolveParentFolderId(idOrName?: string, token?: string): Promise<string | undefined> {
    if (!idOrName || !idOrName.trim()) return undefined;
    const clean = this.cleanFolderId(idOrName);
    if (!clean) return undefined;

    // If it's already a valid Drive ID (alphanumeric >= 20 chars), use directly
    if (this.isValidDriveId(clean)) {
      return clean;
    }

    // It's a friendly folder name (e.g. "AVVMateDrive" or "AVV Mate Drive")
    const activeToken = token || this.config.accessToken;
    if (!activeToken) return undefined;

    try {
      const escaped = clean.replace(/'/g, "\\'");
      // Also try spaced version (e.g. "AVVMateDrive" -> "AVV Mate Drive")
      const spacedVariant = clean.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/'/g, "\\'");
      const q = `mimeType='application/vnd.google-apps.folder' and (name='${escaped}' or name='${spacedVariant}') and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=5&fields=files(id,name)`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          console.log(`[GoogleDrive] Resolved folder name "${clean}" to Drive ID:`, data.files[0].id);
          return data.files[0].id;
        }
      }
    } catch (e) {
      console.warn(`[GoogleDrive] Could not resolve folder name "${clean}":`, e);
    }

    return undefined;
  }

  /**
   * Finds or creates a folder with given name inside parentFolderId.
   * Fully supports shared drives and "Shared with me" folders.
   */
  public async findOrCreateFolder(name: string, parentFolderId?: string): Promise<DriveFolderInfo> {
    const token = this.config.accessToken;
    if (!token) throw new Error('Google Drive access token is not set.');

    // Only add to 'parents' query if it's a valid 20+ char ID
    const validParentId = this.isValidDriveId(parentFolderId) ? parentFolderId : undefined;
    
    // Construct query
    let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
    if (validParentId) {
      q += ` and '${validParentId}' in parents`;
    }

    try {
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          const existing = searchData.files[0];
          return {
            id: existing.id,
            name: existing.name,
            webViewLink: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
          };
        }
      }
    } catch (searchErr) {
      console.warn(`[GoogleDrive] Search error for folder "${name}":`, searchErr);
    }

    // Create new folder if not found
    const body: Record<string, any> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (validParentId) {
      body.parents = [validParentId];
    }

    const createUrl = 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink';
    let createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // If creation with parents failed (e.g. 404 or 403 on parent), fallback to root
    if (!createRes.ok && validParentId) {
      console.warn(`[GoogleDrive] Failed creating folder "${name}" in parent "${validParentId}", falling back to root Drive...`);
      delete body.parents;
      createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Drive folder "${name}": ${errText}`);
    }

    const created = await createRes.json();
    return {
      id: created.id,
      name: created.name,
      webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
    };
  }

  /**
   * Initializes or verifies the exact folder hierarchy requested by the user:
   * 📁 {FOLDER_NO} (e.g. SVC1028)
   *    ├── 📁 DOCS
   *    └── 📁 MEDIA
   *         ├── 📁 PHOTOS
   *         ├── 📁 VIDEOS
   *         └── 📁 SUBMIT
   */
  public async ensureVehicleFolderHierarchy(folderNo: string): Promise<VehicleDriveHierarchy> {
    const cleanFolder = folderNo.toUpperCase().trim();
    if (!cleanFolder) throw new Error('Vehicle folder number (e.g. SVC1028) is required.');

    // Check localStorage cache first
    const cacheKey = `${FOLDER_CACHE_KEY_PREFIX}${cleanFolder}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.vehicleFolder?.id) return parsed;
      } catch (_) {}
    }

    // Resolve parent root folder (supports name, URL, or ID)
    let rootParentId: string | undefined;
    if (this.config.rootFolderId) {
      rootParentId = await this.resolveParentFolderId(this.config.rootFolderId);
    }

    try {
      // 1. Create/find Root Vehicle Folder (e.g. SVC1028)
      const vehicleFolder = await this.findOrCreateFolder(cleanFolder, rootParentId);

      // 2. Create/find DOCS and MEDIA inside SVC1028
      const [docsFolder, mediaFolder] = await Promise.all([
        this.findOrCreateFolder('DOCS', vehicleFolder.id),
        this.findOrCreateFolder('MEDIA', vehicleFolder.id),
      ]);

      // 3. Create/find PHOTOS, VIDEOS, and SUBMIT inside MEDIA
      const [photosFolder, videosFolder, submitFolder] = await Promise.all([
        this.findOrCreateFolder('PHOTOS', mediaFolder.id),
        this.findOrCreateFolder('VIDEOS', mediaFolder.id),
        this.findOrCreateFolder('SUBMIT', mediaFolder.id),
      ]);

      const hierarchy: VehicleDriveHierarchy = {
        vehicleFolder,
        docsFolder,
        mediaFolder,
        photosFolder,
        videosFolder,
        submitFolder,
      };

      try {
        localStorage.setItem(cacheKey, JSON.stringify(hierarchy));
      } catch (_) {}

      return hierarchy;
    } catch (err: any) {
      // If network/CORS error or invalid session, check error type
      if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Load failed')) {
        throw new Error(
          'Google API blocked the connection (CORS / Origin issue). Please check your Google Cloud Console OAuth setup or switch to Demo Mode.'
        );
      }
      throw err;
    }
  }

  /**
   * Uploads a single file to a specific Drive folder via Google Drive Multipart API
   */
  public async uploadFile(
    folderId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<DriveUploadedFile> {
    const token = this.config.accessToken;
    if (!token) throw new Error('Google Drive access token is not set.');

    const cleanParent = this.cleanFolderId(folderId);

    const metadata: Record<string, any> = {
      name: file.name,
    };
    if (this.isValidDriveId(cleanParent)) {
      metadata.parents = [cleanParent];
    }

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', file);

    onProgress?.(10);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink';
    
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    onProgress?.(90);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to upload ${file.name} to Google Drive: ${errText}`);
    }

    const data = await res.json();
    onProgress?.(100);

    return {
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      size: Number(data.size) || file.size,
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
      webContentLink: data.webContentLink,
    };
  }

  /**
   * Uploads a batch of files (e.g. 30–80+ photos) with concurrency limit and live counter
   */
  public async uploadBatch(
    folderId: string,
    files: File[],
    onProgress?: (completed: number, total: number, currentFile: string) => void
  ): Promise<DriveUploadedFile[]> {
    const results: DriveUploadedFile[] = [];
    const total = files.length;
    let completed = 0;

    // Concurrency limit of 3 to prevent rate limits
    const concurrency = 3;
    let index = 0;

    const worker = async () => {
      while (index < files.length) {
        const currentIndex = index++;
        const file = files[currentIndex];
        onProgress?.(completed, total, file.name);

        try {
          const uploaded = await this.uploadFile(folderId, file);
          results.push(uploaded);
        } catch (err) {
          console.error(`Failed uploading ${file.name}:`, err);
        } finally {
          completed++;
          onProgress?.(completed, total, file.name);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Demo / Simulated Drive Hierarchy for immediate testing without live API keys
   */
  public getDemoHierarchy(folderNo: string): VehicleDriveHierarchy {
    const cleanFolder = folderNo.toUpperCase().trim() || 'SVC1001';
    const baseUrl = 'https://drive.google.com/drive/folders';
    return {
      vehicleFolder: { id: `drive_${cleanFolder}`, name: cleanFolder, webViewLink: `${baseUrl}/#${cleanFolder}` },
      docsFolder: { id: `drive_${cleanFolder}_docs`, name: 'DOCS', webViewLink: `${baseUrl}/#${cleanFolder}_DOCS` },
      mediaFolder: { id: `drive_${cleanFolder}_media`, name: 'MEDIA', webViewLink: `${baseUrl}/#${cleanFolder}_MEDIA` },
      photosFolder: { id: `drive_${cleanFolder}_photos`, name: 'PHOTOS', webViewLink: `${baseUrl}/#${cleanFolder}_PHOTOS` },
      videosFolder: { id: `drive_${cleanFolder}_videos`, name: 'VIDEOS', webViewLink: `${baseUrl}/#${cleanFolder}_VIDEOS` },
      submitFolder: { id: `drive_${cleanFolder}_submit`, name: 'SUBMIT', webViewLink: `${baseUrl}/#${cleanFolder}_SUBMIT` },
    };
  }
}

export const googleDriveService = new GoogleDriveService();

