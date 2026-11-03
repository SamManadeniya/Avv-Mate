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
   * Cleans URLs or IDs to get exact folder ID
   * E.g. https://drive.google.com/drive/folders/1AbC-D_1234?usp=sharing -> 1AbC-D_1234
   */
  public cleanFolderId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
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
    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly');
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
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
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

    // 1. Check user details & quota
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      let msg = `Google Drive API error (${res.status})`;
      try {
        const errJson = JSON.parse(errorText);
        msg = errJson.error?.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await res.json();

    let rootFolderName: string | undefined;
    if (this.config.rootFolderId) {
      const cleanRoot = this.cleanFolderId(this.config.rootFolderId);
      try {
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanRoot}?fields=id,name`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (folderRes.ok) {
          const folderData = await folderRes.json();
          rootFolderName = folderData.name;
        }
      } catch (e) {
        console.warn('Could not fetch root folder name:', e);
      }
    }

    // Update config with live user metadata
    this.saveConfig({
      userEmail: data.user?.emailAddress,
      userName: data.user?.displayName,
      rootFolderName,
    });

    return {
      user: data.user || { displayName: 'Connected User', emailAddress: '' },
      quota: data.storageQuota || {},
      rootFolderName,
    };
  }

  /**
   * Finds or creates a folder with given name inside parentFolderId
   */
  public async findOrCreateFolder(name: string, parentFolderId?: string): Promise<DriveFolderInfo> {
    const token = this.config.accessToken;
    if (!token) throw new Error('Google Drive access token is not set.');

    const cleanParent = parentFolderId ? this.cleanFolderId(parentFolderId) : '';
    
    // Query query string
    let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
    if (cleanParent) {
      q += ` and '${cleanParent}' in parents`;
    }

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`;
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

    // Create new folder if not found
    const body: Record<string, any> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (cleanParent) {
      body.parents = [cleanParent];
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

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

    const rootParentId = this.config.rootFolderId ? this.cleanFolderId(this.config.rootFolderId) : undefined;

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

    const metadata = {
      name: file.name,
      parents: [cleanParent],
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', file);

    onProgress?.(10);

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink';
    
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

