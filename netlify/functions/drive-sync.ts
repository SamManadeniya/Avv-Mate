/**
 * Netlify Serverless Function: Google Drive Hierarchy Synchronization
 * Runs on Node.js (Server-to-Server) - completely bypasses browser CORS and CSP.
 */

interface RequestBody {
  action: 'ensureVehicleFolderHierarchy' | 'testConnection' | 'syncFilesFromUrls' | 'organizeVehicleFolders' | 'uploadFile' | 'initiateResumableUpload' | 'listFiles' | 'getOrCreateMasterSpreadsheet' | 'syncMasterSpreadsheet' | 'readMasterSpreadsheet' | 'refreshAccessToken' | 'exchangeAuthCode' | 'getAppSession';
  folderNo?: string;
  parentFolderId?: string;
  folderId?: string;
  name?: string;
  mimeType?: string;
  fileSize?: number;
  base64Data?: string;
  spreadsheetId?: string;
  spreadsheetTitle?: string;
  tablesData?: {
    jobs?: any[];
    vehicles?: any[];
    workshops?: any[];
    modelReports?: any[];
    invoices?: any[];
  };
  hierarchy?: {
    docsFolder?: { id: string };
    photosFolder?: { id: string };
    videosFolder?: { id: string };
    docsFolderId?: string;
    photosFolderId?: string;
    videosFolderId?: string;
  };
  files?: Array<{
    name: string;
    url: string;
    mimeType?: string;
    targetFolderId?: string;
    category?: 'docs' | 'photos' | 'videos';
    docType?: string;
  }>;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  redirectUri?: string;
  clientId?: string;
  clientSecret?: string;
}

const cleanDriveFolderId = (input?: string): string => {
  if (!input) return '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:folders|project|file\/d)\/([a-zA-Z0-9_-]{15,})/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (queryMatch && queryMatch[1]) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return trimmed || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5';
};

const isComplianceDocServer = (name: string, docType?: string): boolean => {
  const dt = (docType || '').toUpperCase().trim();
  const complianceTypes = ['CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'RAW_DECL', 'RAW DECL', 'RECALL'];
  if (dt && complianceTypes.includes(dt)) {
    return true;
  }
  const n = (name || '').toLowerCase().trim();
  if (
    /^(cre|ec|cin|wi|dc|vi|raw_decla|raw_decl|rawdecl|recall)[_.\-\s]/i.test(n) ||
    /^(cre|ec|cin|wi|dc|vi|recall)\.[a-z0-9]+$/i.test(n) ||
    n.includes('recall') ||
    n.includes('concessional') ||
    n.includes('export_cert') ||
    n.includes('export cert') ||
    n.includes('exportcertificate') ||
    n.includes('export') ||
    n.includes('import_notice') ||
    n.includes('work_instruction') ||
    n.includes('deregist') ||
    n.includes('inspection') ||
    n.includes('declaration')
  ) {
    return true;
  }
  return false;
};

const isImageFileServer = (name: string, mime?: string) => {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  return m.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|svg)$/i.test(n);
};

const isVideoFileServer = (name: string, mime?: string) => {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  return m.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|wmv|m4v|3gp|flv)$/i.test(n);
};

const moveOrCleanMisplacedFileServer = async (
  token: string,
  fileId: string,
  fileName: string,
  fromFolderId: string,
  toFolderId: string
) => {
  try {
    // Check if a file with the same name already exists in destination
    const checkQ = `'${toFolderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`;
    const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.files && checkData.files.some((f: any) => f.id !== fileId)) {
        // Already exists in target folder; remove old reference from source folder
        const removeUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${fromFolderId}&supportsAllDrives=true`;
        await fetch(removeUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
        return true;
      }
    }

    // Move to destination
    const moveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${toFolderId}&removeParents=${fromFolderId}&supportsAllDrives=true`;
    const moveRes = await fetch(moveUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    return moveRes.ok;
  } catch (e) {
    console.warn(`[drive-sync] Failed to move/clean ${fileName}:`, e);
    return false;
  }
};

const organizeVehicleFoldersServer = async (
  token: string,
  docsFolderId: string,
  photosFolderId: string,
  videosFolderId: string
) => {
  const moved: Array<{ name: string; from: string; to: string }> = [];
  try {
    // 1. Inspect DOCS folder for misplaced photos or videos
    const docsQ = `'${docsFolderId}' in parents and trashed=false`;
    const docsUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(docsQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType)`;
    const docsRes = await fetch(docsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (docsRes.ok) {
      const docsData = await docsRes.json();
      const files = docsData.files || [];
      for (const f of files) {
        // Do NOT move compliance documents out of DOCS, even if they are .jpg, .png, etc.
        // CRE, EC, CIN, WI, DC, VI, RAW_DECLA all belong in DOCS
        if (isComplianceDocServer(f.name)) {
          continue;
        }

        if (isImageFileServer(f.name, f.mimeType)) {
          const ok = await moveOrCleanMisplacedFileServer(token, f.id, f.name, docsFolderId, photosFolderId);
          if (ok) moved.push({ name: f.name, from: 'DOCS', to: 'MEDIA/PHOTOS' });
        } else if (isVideoFileServer(f.name, f.mimeType)) {
          const ok = await moveOrCleanMisplacedFileServer(token, f.id, f.name, docsFolderId, videosFolderId);
          if (ok) moved.push({ name: f.name, from: 'DOCS', to: 'MEDIA/VIDEOS' });
        }
      }
    }
  } catch (err) {
    console.warn('[drive-sync] organizeVehicleFoldersServer error:', err);
  }
  return moved;
};

const uploadFileBufferServer = async (
  token: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBytes: ArrayBuffer | Uint8Array
) => {
  // Check if file with same name already exists in folder to avoid duplicates
  try {
    const checkQ = `'${folderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`;
    const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (checkRes.ok) {
      const existingData = await checkRes.json();
      if (existingData.files && existingData.files.length > 0) {
        return { id: existingData.files[0].id, name: fileName, alreadyExisted: true };
      }
    }
  } catch (_) {}

  // Construct multipart body
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;

  const encoder = new TextEncoder();
  const metadataBuffer = encoder.encode(metadataPart);
  const mediaHeaderBuffer = encoder.encode(mediaHeader);
  const closeBuffer = encoder.encode(closeDelimiter);

  const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
  const totalLength = metadataBuffer.byteLength + mediaHeaderBuffer.byteLength + bytes.byteLength + closeBuffer.byteLength;
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  combined.set(metadataBuffer, offset);
  offset += metadataBuffer.byteLength;
  combined.set(mediaHeaderBuffer, offset);
  offset += mediaHeaderBuffer.byteLength;
  combined.set(bytes, offset);
  offset += bytes.byteLength;
  combined.set(closeBuffer, offset);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink';
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload failed for ${fileName}: ${errText}`);
  }

  const data = await uploadRes.json();
  return { id: data.id, name: data.name, webViewLink: data.webViewLink };
};

const findOrCreateFolderServer = async (
  token: string,
  name: string,
  parentFolderId?: string
) => {
  const cleanParent = (parentFolderId || '').trim();

  // Search query
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (cleanParent && cleanParent.length >= 15) {
    q += ` and '${cleanParent}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      const f = data.files[0];
      return {
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
      };
    }
  }

  // Create folder
  const body: Record<string, any> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (cleanParent && cleanParent.length >= 15) {
    body.parents = [cleanParent];
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

  // If failed with parent (e.g. permission or parent issue), retry at root
  if (!createRes.ok && body.parents) {
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
    const err = await createRes.text();
    throw new Error(`Failed to create Drive folder "${name}": ${err}`);
  }

  const created = await createRes.json();
  return {
    id: created.id,
    name: created.name,
    webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
};

const ensureMasterSheetTabs = async (token: string, spreadsheetId: string): Promise<void> => {
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return;
    const metaData = await metaRes.json();
    const existingSheets = (metaData.sheets || []) as any[];
    const existingTitles = existingSheets.map(s => s.properties?.title);

    const requiredTabs = ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports', 'SVC', 'Invoices'];
    const missing = requiredTabs.filter(t => !existingTitles.includes(t));

    // 1. Add any missing tabs with sufficient grid columns (SVC needs 31 columns: A through AE)
    if (missing.length > 0) {
      const addRequests = missing.map(tabTitle => ({
        addSheet: {
          properties: {
            title: tabTitle,
            gridProperties: {
              columnCount: tabTitle === 'SVC' ? 36 : tabTitle === 'Compliance_Jobs' ? 35 : tabTitle === 'Invoices' ? 20 : 26,
              frozenRowCount: 1,
            },
          },
        },
      }));
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: addRequests }),
      });
    }

    // 2. Expand existing tabs if column count is too small (prevent "exceeds grid limits" on column AE)
    const expandRequests: any[] = [];
    existingSheets.forEach(s => {
      const sheetId = s.properties?.sheetId;
      const colCount = s.properties?.gridProperties?.columnCount || 26;
      if (sheetId !== undefined && colCount < 40) {
        expandRequests.push({
          appendDimension: {
            sheetId,
            dimension: 'COLUMNS',
            length: 40 - colCount,
          },
        });
      }
    });

    if (expandRequests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: expandRequests }),
      });
    }

    // 3. Ensure SVC header row (SVC!A1:AE1) is never empty
    try {
      const svcHeadRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SVC!A1:AE1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (svcHeadRes.ok) {
        const svcData = await svcHeadRes.json();
        if (!svcData.values || svcData.values.length === 0 || !svcData.values[0] || svcData.values[0].length === 0) {
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SVC!A1:AE1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              range: 'SVC!A1:AE1',
              values: [
                [
                  'Customer Request Recieved', 'Folder #', 'VIN #', 'Build Date', 'Make as per MRE',
                  'Model as per MRE', 'MRE No', 'Build date range', 'SEV No', 'Build date range (SEV)',
                  'VIA#', 'EXP CERT', 'CIN', 'WI', 'DC', 'VI', 'PHOTOS', 'RAW DECLA',
                  'Model Report Author', 'Model Report Unique ID', 'CMPL RAW', 'Recall Check',
                  'AVV Verification Date', 'AVV Submit Date', 'RAV Date of Entry', 'Approval Payment Date',
                  'VCC', 'Approval Holder', 'Tare', 'Power (kW)', 'Seats'
                ]
              ],
            }),
          });
        }
      }
    } catch (_) {}

    // 4. If "Sheet1" exists and we have other tabs, delete Sheet1
    const sheet1 = existingSheets.find(s => s.properties?.title === 'Sheet1');
    if (sheet1 && (existingTitles.length + missing.length) > 1 && sheet1.properties?.sheetId !== undefined) {
      try {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }] }),
        });
      } catch (_) {}
    }
  } catch (err) {
    console.warn('ensureMasterSheetTabs notice:', err);
  }
};

export const handler = async (event: any) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload: RequestBody = JSON.parse(event.body || '{}');

    // 0. Refresh OAuth Access Token via permanent Refresh Token
    if (payload.action === 'refreshAccessToken') {
      const refreshToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
      const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
      const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

      if (!refreshToken) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'refreshToken is required for token renewal' }),
        };
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return {
          statusCode: tokenRes.status,
          headers,
          body: JSON.stringify({ error: tokenData.error_description || tokenData.error || 'Failed to refresh token', details: tokenData }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          accessToken: tokenData.access_token,
          expiresIn: tokenData.expires_in,
        }),
      };
    }

    // 0.1. Exchange OAuth Authorization Code for Access Token + Permanent Refresh Token
    if (payload.action === 'exchangeAuthCode') {
      const code = payload.code;
      const redirectUri = payload.redirectUri || 'https://avvmate.netlify.app';
      const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
      const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Authorization code is required' }),
        };
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return {
          statusCode: tokenRes.status,
          headers,
          body: JSON.stringify({ error: tokenData.error_description || tokenData.error || 'Failed to exchange auth code', details: tokenData }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
        }),
      };
    }

    // 0.2. Check if server environment has central Google Drive credentials configured (for clients/outsiders)
    if (payload.action === 'getAppSession') {
      const refreshToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
      const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
      const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

      if (!refreshToken) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ hasServerAuth: false }),
        };
      }

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }).toString(),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.access_token) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                hasServerAuth: true,
                accessToken: tokenData.access_token,
                expiresIn: tokenData.expires_in,
              }),
            };
          }
        }
      } catch (_) {}

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ hasServerAuth: false }),
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    let token = payload.accessToken || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '');

    // If token is missing, attempt auto-refresh using refreshToken
    if (!token && (payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN)) {
      try {
        const refreshToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
        const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
        const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken!,
            grant_type: 'refresh_token',
          }).toString(),
        });
        if (tokenRes.ok) {
          const tData = await tokenRes.json();
          if (tData.access_token) {
            token = tData.access_token;
          }
        }
      } catch (_) {}
    }

    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Google Drive access token is required.', authExpired: true }),
      };
    }

    if (payload.action === 'testConnection') {
      const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          statusCode: res.status,
          headers,
          body: JSON.stringify({ error: `Drive test failed: ${text}` }),
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Google Drive connected successfully via server proxy.' }),
      };
    }

    if (payload.action === 'ensureVehicleFolderHierarchy') {
      const folderNo = (payload.folderNo || '').toUpperCase().trim();
      if (!folderNo) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Vehicle folder number is required.' }),
        };
      }

      const rootParent = (payload.parentFolderId || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5').trim();

      // 1. Vehicle Root Folder
      const vehicleFolder = await findOrCreateFolderServer(token, folderNo, rootParent);

      // 2. DOCS & MEDIA
      const [docsFolder, mediaFolder] = await Promise.all([
        findOrCreateFolderServer(token, 'DOCS', vehicleFolder.id),
        findOrCreateFolderServer(token, 'MEDIA', vehicleFolder.id),
      ]);

      // 3. MEDIA subfolders
      const [photosFolder, videosFolder, submitFolder] = await Promise.all([
        findOrCreateFolderServer(token, 'PHOTOS', mediaFolder.id),
        findOrCreateFolderServer(token, 'VIDEOS', mediaFolder.id),
        findOrCreateFolderServer(token, 'SUBMIT', mediaFolder.id),
      ]);

      // 4. Auto-organize: relocate any misplaced photos or videos out of DOCS into MEDIA/PHOTOS and MEDIA/VIDEOS
      const moved = await organizeVehicleFoldersServer(token, docsFolder.id, photosFolder.id, videosFolder.id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          hierarchy: {
            vehicleFolder,
            docsFolder,
            mediaFolder,
            photosFolder,
            videosFolder,
            submitFolder,
          },
          moved,
        }),
      };
    }

    if (payload.action === 'organizeVehicleFolders') {
      const docsId = payload.hierarchy?.docsFolder?.id || payload.hierarchy?.docsFolderId || payload.folderId;
      const photosId = payload.hierarchy?.photosFolder?.id || payload.hierarchy?.photosFolderId;
      const videosId = payload.hierarchy?.videosFolder?.id || payload.hierarchy?.videosFolderId;

      if (!docsId || !photosId || !videosId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'docsFolder, photosFolder, and videosFolder IDs are required.' }),
        };
      }

      const moved = await organizeVehicleFoldersServer(token, docsId, photosId, videosId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, moved, count: moved.length }),
      };
    }

    if (payload.action === 'syncFilesFromUrls') {
      const files = payload.files || [];
      const defaultFolderId = payload.folderId || payload.hierarchy?.docsFolder?.id || payload.hierarchy?.docsFolderId;

      const docsFolderId = payload.hierarchy?.docsFolder?.id || payload.hierarchy?.docsFolderId || defaultFolderId;
      const photosFolderId = payload.hierarchy?.photosFolder?.id || payload.hierarchy?.photosFolderId;
      const videosFolderId = payload.hierarchy?.videosFolder?.id || payload.hierarchy?.videosFolderId;

      if (files.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Files list is required.' }),
        };
      }

      const uploaded: any[] = [];
      for (const f of files) {
        try {
          if (!f.url) continue;

          // Route to appropriate folder based on targetFolderId, category, docType, or file type
          let targetId = f.targetFolderId;
          if (!targetId) {
            const isCompliance = isComplianceDocServer(f.name, f.docType) || f.category === 'docs';
            const isVideo = !isCompliance && (f.category === 'videos' || f.docType === 'VIDEOS' || isVideoFileServer(f.name, f.mimeType));
            const isPhoto = !isCompliance && (f.category === 'photos' || f.docType === 'PHOTOS' || isImageFileServer(f.name, f.mimeType));

            if (isCompliance) {
              targetId = docsFolderId;
            } else if (isPhoto && photosFolderId) {
              targetId = photosFolderId;
            } else if (isVideo && videosFolderId) {
              targetId = videosFolderId;
            } else {
              targetId = docsFolderId;
            }
          }

          if (!targetId) continue;

          const fileRes = await fetch(f.url);
          if (!fileRes.ok) continue;
          const bytes = await fileRes.arrayBuffer();
          const item = await uploadFileBufferServer(
            token,
            targetId,
            f.name,
            f.mimeType || 'application/octet-stream',
            bytes
          );
          uploaded.push({ ...item, targetFolderId: targetId });
        } catch (uploadErr: any) {
          console.error(`Failed uploading file ${f.name}:`, uploadErr);
        }
      }

      // Run auto-organize check after syncing
      if (docsFolderId && photosFolderId && videosFolderId) {
        await organizeVehicleFoldersServer(token, docsFolderId, photosFolderId, videosFolderId);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          uploaded,
          count: uploaded.length,
        }),
      };
    }

    if (payload.action === 'uploadFile') {
      const folderId = payload.folderId;
      const fileName = payload.name;
      const mimeType = payload.mimeType || payload.files?.[0]?.mimeType || 'image/jpeg';
      const base64 = payload.base64Data;

      if (!folderId || !fileName || !base64) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'folderId, name, and base64Data are required.' }),
        };
      }

      const fileBuffer = Buffer.from(base64, 'base64');
      let uploaded: any;
      try {
        uploaded = await uploadFileBufferServer(
          token,
          folderId,
          fileName,
          mimeType,
          fileBuffer
        );
      } catch (upErr: any) {
        // If upload fails, attempt auto-refresh of token and retry
        const rToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
        const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
        const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';
        if (rToken) {
          try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: rToken,
                grant_type: 'refresh_token',
              }).toString(),
            });
            if (tokenRes.ok) {
              const tData = await tokenRes.json();
              if (tData.access_token) {
                token = tData.access_token;
                uploaded = await uploadFileBufferServer(
                  token,
                  folderId,
                  fileName,
                  mimeType,
                  fileBuffer
                );
              }
            }
          } catch (_) {}
        }
        if (!uploaded) throw upErr;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          uploaded,
        }),
      };
    }

    if (payload.action === 'initiateResumableUpload') {
      const folderId = payload.folderId;
      const fileName = payload.name;
      const mimeType = payload.mimeType || 'video/mp4';
      const fileSize = payload.fileSize;

      if (!folderId || !fileName) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'folderId and name are required.' }),
        };
      }

      // Check if file already exists in folder to avoid duplicate uploads
      try {
        const checkQ = `'${folderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`;
        const checkUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`;
        const checkRes = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.files && checkData.files.length > 0) {
            const existing = checkData.files[0];
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                alreadyExisted: true,
                uploaded: {
                  id: existing.id,
                  name: existing.name,
                  webViewLink: existing.webViewLink || `https://drive.google.com/file/d/${existing.id}/view`,
                },
              }),
            };
          }
        }
      } catch (_) {}

      const initHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
      };
      if (fileSize) {
        initHeaders['X-Upload-Content-Length'] = fileSize.toString();
      }

      const initUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';
      const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          name: fileName,
          parents: [folderId],
        }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        return {
          statusCode: initRes.status,
          headers,
          body: JSON.stringify({ error: `Failed to initiate resumable upload: ${errText}` }),
        };
      }

      const uploadUrl = initRes.headers.get('location') || initRes.headers.get('Location');
      if (!uploadUrl) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Google Drive did not return a resumable upload location URL.' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          uploadUrl,
        }),
      };
    }

    if (payload.action === 'listFiles') {
      const folderId = payload.folderId;
      if (!folderId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'folderId is required' }),
        };
      }
      const q = `'${folderId}' in parents and trashed=false`;
      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,size,webViewLink)&orderBy=createdTime%20desc`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!listRes.ok) {
        const errText = await listRes.text();
        return {
          statusCode: listRes.status,
          headers,
          body: JSON.stringify({ error: `Failed to list files: ${errText}` }),
        };
      }
      const listData = await listRes.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          files: listData.files || [],
        }),
      };
    }

    if (payload.action === 'getOrCreateMasterSpreadsheet') {
      const parentFolderId = cleanDriveFolderId(payload.parentFolderId || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5');
      const title = payload.spreadsheetTitle || 'AVV Mate Master Database';

      // 1. Search if already exists in parent folder or drive and verify it is a valid spreadsheet
      try {
        const searchQ = `name='${title.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink,parents)`;
        const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          for (const existing of (searchData.files || [])) {
            // Verify with Sheets API that the file actually exists and is a valid spreadsheet
            try {
              const testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${existing.id}?fields=spreadsheetId`;
              const testRes = await fetch(testUrl, { headers: { Authorization: `Bearer ${token}` } });
              if (testRes.ok) {
                if (parentFolderId && (!existing.parents || !existing.parents.includes(parentFolderId))) {
                  const moveUrl = `https://www.googleapis.com/drive/v3/files/${existing.id}?addParents=${parentFolderId}&supportsAllDrives=true`;
                  await fetch(moveUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                }
                await ensureMasterSheetTabs(token, existing.id);
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    success: true,
                    created: false,
                    spreadsheetId: existing.id,
                    title: existing.name,
                    webViewLink: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
                  }),
                };
              } else {
                console.warn(`File ${existing.id} found by name is not a valid spreadsheet (HTTP ${testRes.status}), removing stub.`);
                try {
                  await fetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?supportsAllDrives=true`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                  });
                } catch (_) {}
              }
            } catch (vErr) {
              console.warn('Verification of existing spreadsheet skipped:', vErr);
            }
          }
        }
      } catch (err) {
        console.warn('Error searching for master spreadsheet:', err);
      }

      // 2. Create native Google Spreadsheet via Sheets API v4
      let spreadsheetId: string | null = null;
      let webViewLink: string | null = null;

      const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
      const sheetTabs = [
        { properties: { title: 'Compliance_Jobs', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Vehicles', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'RAW_Workshops', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Model_Reports', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'SVC', gridProperties: { frozenRowCount: 1 } } },
      ];

      try {
        const createRes = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: { title },
            sheets: sheetTabs,
          }),
        });

        if (createRes.ok) {
          const createData = await createRes.json();
          spreadsheetId = createData.spreadsheetId;
          webViewLink = createData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        } else {
          const errText = await createRes.text();
          if (errText.includes('SERVICE_DISABLED') || errText.includes('Google Sheets API has not been used') || errText.includes('sheets.googleapis.com')) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({
                error: 'Google Sheets API is disabled for Google Cloud Project 43512054136. Please enable it in Google Cloud Console.',
                enableApiUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136',
                apiDisabled: true,
              }),
            };
          }
          console.warn('Sheets API creation notice:', errText);
        }
      } catch (err) {
        console.warn('Sheets API direct creation failed, trying multipart:', err);
      }

      // Fallback: multipart upload
      if (!spreadsheetId) {
        try {
          const boundary = '-------314159265358979323846';
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelim = `\r\n--${boundary}--`;

          const metadata: Record<string, any> = {
            name: title,
            mimeType: 'application/vnd.google-apps.spreadsheet',
          };
          if (parentFolderId) {
            metadata.parents = [parentFolderId];
          }

          const initialCsv = 'Folder #,VIN,RAW ID,RAW Workshop Name,MRE #,Make,Model,Build Date,VIA #,Request Received,AVV Verification Date,RAV Date of Entry,Status,Docs Uploaded,Drive Folder Link,Inspection Videos,Error Note,Created At\r\n';

          const multipartBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/csv\r\n\r\n' +
            initialCsv +
            closeDelim;

          const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink';
          const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          });

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            spreadsheetId = uploadData.id;
            webViewLink = uploadData.webViewLink || `https://docs.google.com/spreadsheets/d/${uploadData.id}/edit`;
          }
        } catch (err) {
          console.warn('Drive multipart creation fallback failed:', err);
        }
      }

      // 3. Move spreadsheet into root AVV Mate Drive folder if not already placed
      if (parentFolderId && spreadsheetId) {
        try {
          const moveUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&supportsAllDrives=true`;
          await fetch(moveUrl, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
        } catch (moveErr) {
          console.warn('Failed moving spreadsheet to root folder:', moveErr);
        }
      }

      // 4. Ensure all 4 tabs exist and Sheet1 is cleanly removed
      await ensureMasterSheetTabs(token, spreadsheetId);

      // 5. Initialize Header Rows
      const headersPayload = {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Compliance_Jobs!A1:AE1',
            values: [
              [
                'Folder #', 'VIN', 'RAW ID', 'RAW Workshop Name', 'MRE #',
                'Make', 'Model', 'Build Date', 'VIA #', 'Request Received',
                'AVV Verification Date', 'AVV Submit Date', 'RAV Date of Entry', 'Approval Payment Date', 'Recall Check Date',
                'Status', 'CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW DECLA', 'RECALL', 'PHOTOS',
                'Docs Uploaded', 'Google Drive Folder', 'Inspection Videos',
                'Error Note', 'Created At', 'Attachments JSON'
              ]
            ]
          },
          {
            range: 'Vehicles!A1:K1',
            values: [
              [
                'VIN', 'Build Date', 'VIA #', 'RAW ID', 'RAW Workshop Name',
                'MRE #', 'Make', 'Model', 'Unique ID', 'Created At', 'Updated At'
              ]
            ]
          },
          {
            range: 'RAW_Workshops!A1:G1',
            values: [
              [
                'RAW ID', 'Name', 'Contact Email', 'Contact Phone',
                'Total Vehicles', 'Created At', 'Updated At'
              ]
            ]
          },
          {
            range: 'Model_Reports!A1:O1',
            values: [
              [
                'MRE #', 'Unique ID', 'Make', 'Model', 'SEV #', 'Build From', 'Build To',
                'SEV Build From', 'SEV Build To', 'Category (VCC)', 'Tare (kg)', 'Power (kW)', 'Seats',
                'Author', 'Created At'
              ]
            ]
          },
          {
            range: 'SVC!A1:AE1',
            values: [
              [
                'Customer Request Recieved', 'Folder #', 'VIN #', 'Build Date', 'Make as per MRE',
                'Model as per MRE', 'MRE No', 'Build date range', 'SEV No', 'Build date range (SEV)',
                'VIA#', 'EXP CERT', 'CIN', 'WI', 'DC', 'VI', 'PHOTOS', 'RAW DECLA',
                'Model Report Author', 'Model Report Unique ID', 'CMPL RAW', 'Recall Check',
                'AVV Verification Date', 'AVV Submit Date', 'RAV Date of Entry', 'Approval Payment Date',
                'VCC', 'Approval Holder', 'Tare', 'Power (kW)', 'Seats'
              ]
            ]
          }
        ]
      };

      try {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(headersPayload),
        });
      } catch (formatErr) {
        console.warn('Header populating skipped:', formatErr);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          created: true,
          spreadsheetId,
          title,
          webViewLink: webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        }),
      };
    }

    if (payload.action === 'syncMasterSpreadsheet') {
      const spreadsheetId = payload.spreadsheetId;
      const tables = payload.tablesData || {};
      if (!spreadsheetId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'spreadsheetId is required' }) };
      }

      // Ensure all 5 tabs exist before writing values into them
      await ensureMasterSheetTabs(token, spreadsheetId);

      // CRITICAL DATA PRESERVATION GUARD:
      // Count incoming records across all 4 tables. If all are 0, REFUSE to clear/wipe the spreadsheet!
      const incomingJobsCount = Array.isArray(tables.jobs) ? tables.jobs.length : 0;
      const incomingVehiclesCount = Array.isArray(tables.vehicles) ? tables.vehicles.length : 0;
      const incomingWorkshopsCount = Array.isArray(tables.workshops) ? tables.workshops.length : 0;
      const incomingReportsCount = Array.isArray(tables.modelReports) ? tables.modelReports.length : 0;
      const totalIncoming = incomingJobsCount + incomingVehiclesCount + incomingWorkshopsCount + incomingReportsCount;

      if (totalIncoming === 0 && !payload.forceClear) {
        console.warn('[drive-sync] Prevented spreadsheet wipe: all incoming tables are empty.');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            skipped: true,
            message: 'Spreadsheet sync skipped because incoming tables were empty. Existing data preserved.',
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
            syncedTabs: ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports', 'SVC'],
          }),
        };
      }

      // Write rows starting at cell A1 directly. Overwriting from A1 ensures headers
      // and rows are updated atomically without ever leaving the sheet blank.

      // Pre-fetch vehicle folders in Drive to build direct hyperlinks
      const folderMap = new Map<string, { id: string; webViewLink: string }>();
      const rootParent = cleanDriveFolderId(payload.parentFolderId || '12-jOytHtiBFRMmg7ce2s0FNEYEPXzXh5');
      try {
        const fRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${rootParent}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (fRes.ok) {
          const fData = await fRes.json();
          (fData.files || []).forEach((f: any) => {
            if (f.name) {
              folderMap.set(f.name.toUpperCase().trim(), {
                id: f.id,
                webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`
              });
            }
          });
        }
      } catch (_) {}

      const updateData: Array<{ range: string; values: any[][] }> = [];

      // 1. Compliance_Jobs
      if (Array.isArray(tables.jobs)) {
        const jobRows: any[][] = [
          [
            'Folder #', 'VIN', 'RAW ID', 'RAW Workshop Name', 'MRE #',
            'Make', 'Model', 'Build Date', 'VIA #', 'Request Received',
            'AVV Verification Date', 'AVV Submit Date', 'RAV Date of Entry', 'Approval Payment Date', 'Recall Check Date',
            'Status', 'CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW DECLA', 'RECALL', 'PHOTOS',
            'Docs Uploaded', 'Google Drive Folder', 'Inspection Videos',
            'Error Note', 'Created At', 'Attachments JSON'
          ]
        ];

        tables.jobs.forEach((j: any, idx: number) => {
          const rowNum = idx + 2;
          const cleanFolder = (j.folder_no || '').toUpperCase().trim();
          const driveFolderInfo = folderMap.get(cleanFolder);
          const folderUrl = (j.folder_url && j.folder_url.startsWith('https://drive.google.com/drive/folders/') && !j.folder_url.endsWith(rootParent))
            ? j.folder_url
            : (driveFolderInfo ? driveFolderInfo.webViewLink : (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder)}` : ''));
          const driveCell = folderUrl ? `=HYPERLINK("${folderUrl}", "${j.folder_no}")` : (j.folder_no || '');
          const videosCell = j.videos_url
            ? `=HYPERLINK("${j.videos_url}", "Watch Videos")`
            : (cleanFolder ? `=HYPERLINK("https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder + ' VIDEOS')}", "Watch Videos")` : '');
          const workshopFormula = `=IFERROR(XLOOKUP(C${rowNum}, RAW_Workshops!A:A, RAW_Workshops!B:B), "${(j.raw_workshop_name || '').replace(/"/g, '""')}")`;

          const att = j.attachments || {};
          const formatDocCell = (docType: string) => {
            const item = att[docType];
            if (!item) return '';
            const docUrl = (item.file_url && item.file_url.startsWith('https://drive.google.com') && !item.file_url.endsWith(rootParent))
              ? item.file_url
              : (folderUrl || (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder + ' ' + docType)}` : ''));
            if (!docUrl) return (item.file_name || docType).replace(/"/g, '""');
            return `=HYPERLINK("${docUrl}", "${(item.file_name || docType).replace(/"/g, '""')}")`;
          };

          const creCell = formatDocCell('CRE');
          const ecCell = formatDocCell('EC');
          const cinCell = formatDocCell('CIN');
          const wiCell = formatDocCell('WI');
          const dcCell = formatDocCell('DC');
          const viCell = formatDocCell('VI');
          const rawDeclaCell = formatDocCell('RAW_DECLA');
          const recallCell = formatDocCell('RECALL');
          const photosUrl = (att['PHOTOS']?.file_url && att['PHOTOS'].file_url.startsWith('https://drive.google.com') && !att['PHOTOS'].file_url.endsWith(rootParent))
            ? att['PHOTOS'].file_url
            : (folderUrl || (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder + ' PHOTOS')}` : ''));
          const photosCell = photosUrl
            ? `=HYPERLINK("${photosUrl}", "${(att['PHOTOS']?.file_name || 'Photos').replace(/"/g, '""')}")`
            : (j.batch_photos_count ? `${j.batch_photos_count} Photos` : '');

          // Count valid attached documents (8 docs + PHOTOS = 9 total)
          const docKeys = ['CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'RECALL', 'PHOTOS'];
          let attachedCount = 0;
          docKeys.forEach(k => {
            if (att[k]?.file_url) attachedCount++;
          });
          if (attachedCount === 0 && j.uploaded_docs_count) {
            attachedCount = j.uploaded_docs_count;
          }

          const docsSummary = `${attachedCount}/9 ${attachedCount >= 8 ? 'Complete' : 'Pending'}`;
          const attachmentsPayload = {
            ...att,
            _videos_url: j.videos_url || null,
            _folder_url: folderUrl || null,
          };
          const attachmentsJson = JSON.stringify(attachmentsPayload);

          jobRows.push([
            j.folder_no || '',
            j.vin || '',
            j.raw_id || '',
            workshopFormula,
            j.mre_no || '',
            j.make || '',
            j.model || '',
            j.build_date || '',
            j.via_no || '',
            j.request_received || '',
            j.avv_verification_date || '',
            j.avv_submit_date || '',
            j.rav_date_of_entry || '',
            j.approval_date || '',
            j.recall_check_date || '',
            j.status || 'in_progress',
            creCell,
            ecCell,
            cinCell,
            wiCell,
            dcCell,
            viCell,
            rawDeclaCell,
            recallCell,
            photosCell,
            docsSummary,
            driveCell,
            videosCell,
            j.error_note || '',
            j.created_at || new Date().toISOString(),
            attachmentsJson
          ]);
        });

        updateData.push({ range: 'Compliance_Jobs!A1', values: jobRows });
      }

      // 2. Vehicles
      if (Array.isArray(tables.vehicles)) {
        const vehicleRows: any[][] = [
          [
            'VIN', 'Build Date', 'VIA #', 'RAW ID', 'RAW Workshop Name',
            'MRE #', 'Make', 'Model', 'Unique ID', 'Created At', 'Updated At'
          ]
        ];

        tables.vehicles.forEach((v: any, idx: number) => {
          const rowNum = idx + 2;
          const workshopFormula = `=IFERROR(XLOOKUP(D${rowNum}, RAW_Workshops!A:A, RAW_Workshops!B:B), "${(v.raw_workshop_name || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}")`;
          vehicleRows.push([
            v.vin || '',
            v.build_date || '',
            v.via_no || '',
            v.raw_id || '',
            workshopFormula,
            v.mre_no || '',
            v.make || '',
            v.model || '',
            v.unique_id || '',
            v.created_at || '',
            v.updated_at || ''
          ]);
        });

        updateData.push({ range: 'Vehicles!A1', values: vehicleRows });
      }

      // 3. RAW_Workshops
      if (Array.isArray(tables.workshops)) {
        const workshopRows: any[][] = [
          [
            'RAW ID', 'Name', 'Contact Email', 'Contact Phone',
            'Total Vehicles', 'Created At', 'Updated At'
          ]
        ];

        tables.workshops.forEach((w: any, idx: number) => {
          const rowNum = idx + 2;
          const countFormula = `=COUNTIF(Vehicles!D:D, A${rowNum})`;
          workshopRows.push([
            w.raw_id || '',
            w.name || '',
            w.contact_email || '',
            w.contact_phone || '',
            countFormula,
            w.created_at || '',
            w.updated_at || ''
          ]);
        });

        updateData.push({ range: 'RAW_Workshops!A1', values: workshopRows });
      }

      // 4. Model_Reports
      if (Array.isArray(tables.modelReports)) {
        const reportRows: any[][] = [
          [
            'MRE #', 'Unique ID', 'Make', 'Model', 'SEV #', 'Build From', 'Build To',
            'SEV Build From', 'SEV Build To', 'Category (VCC)', 'Tare (kg)', 'Power (kW)', 'Seats',
            'Author', 'Created At'
          ]
        ];

        tables.modelReports.forEach((r: any) => {
          reportRows.push([
            r.mre_no || '',
            r.unique_id || '',
            r.make || '',
            r.model || '',
            r.sev_no || '',
            r.build_from || '',
            r.build_to || '',
            r.sev_build_from || '',
            r.sev_build_to || '',
            r.vcc || '',
            r.tare_kg || '',
            r.power_kw || '',
            r.seats || '',
            r.author || '',
            r.created_at || ''
          ]);
        });

        updateData.push({ range: 'Model_Reports!A1', values: reportRows });
      }

      // 5. SVC Tab (Consolidated view combining all 4 tables into requested 31 columns)
      if (Array.isArray(tables.jobs)) {
        const vehiclesMap = new Map<string, any>((tables.vehicles || []).map((v: any) => [(v.vin || '').toUpperCase().trim(), v]));
        const workshopsMap = new Map<string, any>((tables.workshops || []).map((w: any) => [(w.raw_id || '').toUpperCase().trim(), w]));
        const reportsMap = new Map<string, any>((tables.modelReports || []).map((m: any) => [(m.mre_no || '').toUpperCase().trim(), m]));

        const svcRows: any[][] = [
          [
            'Customer Request Recieved', 'Folder #', 'VIN #', 'Build Date', 'Make as per MRE',
            'Model as per MRE', 'MRE No', 'Build date range', 'SEV No', 'Build date range (SEV)',
            'VIA#', 'EXP CERT', 'CIN', 'WI', 'DC', 'VI', 'PHOTOS', 'RAW DECLA',
            'Model Report Author', 'Model Report Unique ID', 'CMPL RAW', 'Recall Check',
            'AVV Verification Date', 'AVV Submit Date', 'RAV Date of Entry', 'Approval Payment Date',
            'VCC', 'Approval Holder', 'Tare', 'Power (kW)', 'Seats'
          ]
        ];

        tables.jobs.forEach((j: any) => {
          const cleanFolder = (j.folder_no || '').toUpperCase().trim();
          const cleanVin = (j.vin || '').toUpperCase().trim();
          const cleanRawId = (j.raw_id || '').toUpperCase().trim();
          const cleanMreNo = (j.mre_no || '').toUpperCase().trim();

          const v = vehiclesMap.get(cleanVin) || {};
          const w = workshopsMap.get(cleanRawId) || {};
          const m = reportsMap.get(cleanMreNo) || {};

          const driveFolderInfo = folderMap.get(cleanFolder);
          const folderUrl = (j.folder_url && j.folder_url.startsWith('https://drive.google.com/drive/folders/') && !j.folder_url.endsWith(rootParent))
            ? j.folder_url
            : (driveFolderInfo ? driveFolderInfo.webViewLink : (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder)}` : ''));
          const folderCell = folderUrl ? `=HYPERLINK("${folderUrl}", "${j.folder_no}")` : (j.folder_no || '');

          const att = j.attachments || {};
          const formatDocCell = (docType: string) => {
            const item = att[docType];
            if (!item) return '';
            const docUrl = (item.file_url && item.file_url.startsWith('https://drive.google.com') && !item.file_url.endsWith(rootParent))
              ? item.file_url
              : (folderUrl || (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder + ' ' + docType)}` : ''));
            if (!docUrl) return (item.file_name || docType).replace(/"/g, '""');
            return `=HYPERLINK("${docUrl}", "${(item.file_name || docType).replace(/"/g, '""')}")`;
          };

          const photosUrl = (att['PHOTOS']?.file_url && att['PHOTOS'].file_url.startsWith('https://drive.google.com') && !att['PHOTOS'].file_url.endsWith(rootParent))
            ? att['PHOTOS'].file_url
            : (folderUrl || (cleanFolder ? `https://drive.google.com/drive/search?q=${encodeURIComponent(cleanFolder + ' PHOTOS')}` : ''));
          const photosCell = photosUrl
            ? `=HYPERLINK("${photosUrl}", "${(att['PHOTOS']?.file_name || 'Photos').replace(/"/g, '""')}")`
            : (j.batch_photos_count ? `${j.batch_photos_count} Photos` : '');

          const buildDateRange = (m.build_from || m.build_to)
            ? `${m.build_from || ''}${m.build_to ? ' to ' + m.build_to : ''}`
            : '';
          const sevBuildRange = (m.sev_build_from || m.sev_build_to)
            ? `${m.sev_build_from || ''}${m.sev_build_to ? ' to ' + m.sev_build_to : ''}`
            : buildDateRange;

          svcRows.push([
            j.request_received || '',
            folderCell,
            j.vin || '',
            v.build_date || j.build_date || '',
            m.make || j.make || '',
            m.model || j.model || '',
            j.mre_no || '',
            buildDateRange,
            m.sev_no || '',
            sevBuildRange,
            v.via_no || j.via_no || '',
            formatDocCell('EC'),
            formatDocCell('CIN'),
            formatDocCell('WI'),
            formatDocCell('DC'),
            formatDocCell('VI'),
            photosCell,
            formatDocCell('RAW_DECLA'),
            m.author || '',
            v.unique_id || m.unique_id || '',
            w.name || j.raw_workshop_name || j.raw_id || '',
            formatDocCell('RECALL'),
            j.avv_verification_date || '',
            j.avv_submit_date || '',
            j.rav_date_of_entry || '',
            j.approval_date || '',
            m.vcc || '',
            m.author || w.name || '',
            m.tare_kg != null ? m.tare_kg : '',
            m.power_kw != null ? m.power_kw : '',
            m.seats != null ? m.seats : '',
          ]);
        });

        updateData.push({ range: 'SVC!A1', values: svcRows });
      }

      // 6. Invoices Tab
      if (Array.isArray(tables.invoices)) {
        const invoiceRows: any[][] = [
          [
            'Invoice #', 'Customer Name', 'RAW ID', 'VIN', 'Invoice Date',
            'Due Date', 'Terms', 'Subtotal ($)', 'Tax Amount ($)', 'Total Amount ($)',
            'Amount Paid ($)', 'Balance Due ($)', 'Status', 'Notes', 'Created At'
          ]
        ];

        tables.invoices.forEach((inv: any) => {
          invoiceRows.push([
            inv.invoice_no || '',
            inv.customer_name || '',
            inv.raw_id || '',
            inv.vin || '',
            inv.invoice_date || '',
            inv.due_date || '',
            inv.terms || '',
            inv.subtotal != null ? Number(inv.subtotal).toFixed(2) : '0.00',
            inv.tax_amount != null ? Number(inv.tax_amount).toFixed(2) : '0.00',
            inv.total_amount != null ? Number(inv.total_amount).toFixed(2) : '0.00',
            inv.amount_paid != null ? Number(inv.amount_paid).toFixed(2) : '0.00',
            inv.balance_due != null ? Number(inv.balance_due).toFixed(2) : '0.00',
            inv.status ? String(inv.status).toUpperCase() : 'DRAFT',
            (inv.customer_notes || inv.notes || '').replace(/[\r\n]+/g, ' '),
            inv.created_at || ''
          ]);
        });

        updateData.push({ range: 'Invoices!A1', values: invoiceRows });
      }

      let refreshedTokenToReturn: string | null = null;
      const syncedTabs: string[] = [];

      if (updateData.length > 0) {
        let writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: updateData,
          }),
        });

        // If 401 UNAUTHENTICATED, attempt server-side token refresh via refreshToken
        if (writeRes.status === 401 && (payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN)) {
          const rToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
          const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
          const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

          try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: rToken!,
                grant_type: 'refresh_token',
              }).toString(),
            });
            if (tokenRes.ok) {
              const tData = await tokenRes.json();
              if (tData.access_token) {
                token = tData.access_token;
                refreshedTokenToReturn = token;
                // Retry write with fresh token
                writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    valueInputOption: 'USER_ENTERED',
                    data: updateData,
                  }),
                });
              }
            }
          } catch (_) {}
        }

        if (writeRes.ok) {
          updateData.forEach(d => syncedTabs.push(d.range.split('!')[0]));
        } else {
          // If combined batch update failed, try individual table writes as resilient fallback
          const errText = await writeRes.text();
          console.warn('[drive-sync] Combined batchUpdate notice, falling back to per-table write:', errText);

          for (const item of updateData) {
            try {
              const tabName = item.range.split('!')[0];
              const singleRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  valueInputOption: 'USER_ENTERED',
                  data: [item],
                }),
              });
              if (singleRes.ok) {
                syncedTabs.push(tabName);
              } else {
                console.warn(`[drive-sync] Tab ${tabName} single update notice:`, await singleRes.text());
              }
            } catch (singleErr) {
              console.warn(`[drive-sync] Tab write exception:`, singleErr);
            }
          }

          if (syncedTabs.length === 0) {
            if (errText.includes('SERVICE_DISABLED') || errText.includes('Google Sheets API has not been used') || errText.includes('sheets.googleapis.com')) {
              return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                  error: 'Google Sheets API is disabled for Google Cloud Project 43512054136. Please enable it in Google Cloud Console.',
                  enableApiUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136',
                  apiDisabled: true,
                }),
              };
            }
            if (writeRes.status === 401 || errText.includes('UNAUTHENTICATED') || errText.includes('invalid authentication credentials')) {
              return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                  error: 'Google session expired. Please reconnect your Google account.',
                  authExpired: true,
                }),
              };
            }
            return { statusCode: writeRes.status, headers, body: JSON.stringify({ error: `Failed to write sheet values: ${errText}` }) };
          }
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          syncedTabs: syncedTabs.length > 0 ? syncedTabs : ['Compliance_Jobs', 'Vehicles', 'RAW_Workshops', 'Model_Reports', 'SVC'],
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          refreshedAccessToken: refreshedTokenToReturn,
        }),
      };
    }

    if (payload.action === 'readMasterSpreadsheet') {
      const spreadsheetId = payload.spreadsheetId;
      if (!spreadsheetId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'spreadsheetId is required' }) };
      }

      let refreshedTokenToReturn: string | null = null;
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Compliance_Jobs&ranges=Vehicles&ranges=RAW_Workshops&ranges=Model_Reports&ranges=SVC`;
      let readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });

      // If 401 UNAUTHENTICATED, attempt server-side token refresh via refreshToken
      if (readRes.status === 401 && (payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN)) {
        const rToken = payload.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
        const clientId = payload.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID || '43512054136-hm8pg6tue7uajtb11i4nqmpndng6ik05.apps.googleusercontent.com';
        const clientSecret = payload.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || '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';

        try {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: rToken!,
              grant_type: 'refresh_token',
            }).toString(),
          });
          if (tokenRes.ok) {
            const tData = await tokenRes.json();
            if (tData.access_token) {
              token = tData.access_token;
              refreshedTokenToReturn = token;
              readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
            }
          }
        } catch (_) {}
      }

      if (!readRes.ok) {
        const errText = await readRes.text();
        if (errText.includes('SERVICE_DISABLED') || errText.includes('Google Sheets API has not been used') || errText.includes('sheets.googleapis.com')) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'Google Sheets API is disabled for Google Cloud Project 43512054136. Please enable it in Google Cloud Console.',
              enableApiUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=43512054136',
              apiDisabled: true,
            }),
          };
        }
        if (readRes.status === 401 || errText.includes('UNAUTHENTICATED') || errText.includes('invalid authentication credentials')) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({
              error: 'Google session expired. Please reconnect your Google account.',
              authExpired: true,
            }),
          };
        }
        return { statusCode: readRes.status, headers, body: JSON.stringify({ error: `Failed to read spreadsheet: ${errText}` }) };
      }

      const readData = await readRes.json();
      const ranges = readData.valueRanges || [];

      // Range 2: RAW_Workshops (parsed first for cross-referencing)
      const workshopsRaw = ranges[2]?.values || [];
      const workshops = workshopsRaw.slice(1).filter((r: any[]) => r[0] && String(r[0]).trim() !== '').map((r: any[]) => ({
        raw_id: String(r[0]).trim(),
        name: String(r[1] || '').trim(),
        contact_email: r[2] || null,
        contact_phone: r[3] || null,
        total_vehicles: parseInt(r[4], 10) || 0,
        created_at: r[5] || new Date().toISOString(),
        updated_at: r[6] || null,
      }));
      const workshopMap = new Map(workshops.map(w => [w.raw_id.toUpperCase(), w]));

      // Range 3: Model_Reports (parsed second for cross-referencing)
      const reportsRaw = ranges[3]?.values || [];
      const reportHeaders = (reportsRaw[0] || []).map((h: any) => String(h || '').toLowerCase().trim());

      const mreIdx = reportHeaders.findIndex(h => h === 'mre #' || h === 'mre no' || h === 'mre' || h === 'mre_no' || (h.startsWith('mre') && !h.includes('date') && !h.includes('range') && !h.includes('build') && !h.includes('author')));
      const uniqueIdx = reportHeaders.findIndex(h => h.includes('unique'));
      const makeIdx = reportHeaders.findIndex(h => h === 'make' || (h.includes('make') && !h.includes('mre')));
      const modelIdx = reportHeaders.findIndex(h => h === 'model' || (h.includes('model') && !h.includes('mre') && !h.includes('report')));
      const sevIdx = reportHeaders.findIndex(h => h === 'sev #' || h === 'sev no' || h === 'sev' || h === 'sev_no' || (h.includes('sev') && !h.includes('build') && !h.includes('range') && !h.includes('date')));
      const vccIdx = reportHeaders.findIndex(h => h.includes('vcc') || h.includes('category'));
      const buildFromIdx = reportHeaders.findIndex(h => h.includes('build from') || h === 'from');
      const buildToIdx = reportHeaders.findIndex(h => h.includes('build to') || h === 'to');
      const mreRangeIdx = reportHeaders.findIndex(h => h.includes('mre') && (h.includes('range') || h.includes('date')));
      const sevFromIdx = reportHeaders.findIndex(h => h.includes('sev') && h.includes('from'));
      const sevToIdx = reportHeaders.findIndex(h => h.includes('sev') && h.includes('to'));
      const sevRangeIdx = reportHeaders.findIndex(h => h.includes('sev') && (h.includes('range') || h.includes('date')));
      const tareIdx = reportHeaders.findIndex(h => h.includes('tare'));
      const powerIdx = reportHeaders.findIndex(h => h.includes('power'));
      const seatsIdx = reportHeaders.findIndex(h => h.includes('seats'));
      const authorIdx = reportHeaders.findIndex(h => h.includes('author') || h.includes('supplier') || h.includes('owner'));
      const createdAtIdx = reportHeaders.findIndex(h => h.includes('created'));

      const modelReports = reportsRaw.slice(1).filter((r: any[]) => r[0] && String(r[0]).trim() !== '').map((r: any[]) => {
        const uniqueFound = uniqueIdx >= 0;
        const mreNo = mreIdx >= 0 ? r[mreIdx] : r[0];
        const uniqueId = uniqueIdx >= 0 ? r[uniqueIdx] : null;
        const make = makeIdx >= 0 ? r[makeIdx] : (uniqueFound ? r[2] : r[1]);
        const model = modelIdx >= 0 ? r[modelIdx] : (uniqueFound ? r[3] : r[2]);
        const sevNo = sevIdx >= 0 ? r[sevIdx] : (uniqueFound ? r[4] : r[3]);
        const vcc = vccIdx >= 0 ? r[vccIdx] : (uniqueFound ? r[5] : r[4]);

        let buildFrom = buildFromIdx >= 0 ? r[buildFromIdx] : (uniqueFound ? r[6] : r[5]);
        let buildTo = buildToIdx >= 0 ? r[buildToIdx] : (uniqueFound ? r[7] : r[6]);
        if ((!buildFrom || !buildTo) && mreRangeIdx >= 0 && r[mreRangeIdx]) {
          const parts = String(r[mreRangeIdx]).split(/\s+to\s+|\s*-\s*/i);
          if (parts[0]) buildFrom = parts[0].trim();
          if (parts[1]) buildTo = parts[1].trim();
        }

        let sevBuildFrom = sevFromIdx >= 0 ? r[sevFromIdx] : null;
        let sevBuildTo = sevToIdx >= 0 ? r[sevToIdx] : null;
        if ((!sevBuildFrom || !sevBuildTo) && sevRangeIdx >= 0 && r[sevRangeIdx]) {
          const parts = String(r[sevRangeIdx]).split(/\s+to\s+|\s*-\s*/i);
          if (parts[0]) sevBuildFrom = parts[0].trim();
          if (parts[1]) sevBuildTo = parts[1].trim();
        }

        const tareVal = tareIdx >= 0 ? r[tareIdx] : (uniqueFound ? r[10] : r[8]);
        const powerVal = powerIdx >= 0 ? r[powerIdx] : (uniqueFound ? r[11] : r[9]);
        const seatsVal = seatsIdx >= 0 ? r[seatsIdx] : (uniqueFound ? r[12] : r[10]);
        const authorVal = authorIdx >= 0 ? r[authorIdx] : (uniqueFound ? r[13] : r[11]);
        const createdVal = createdAtIdx >= 0 ? r[createdAtIdx] : (uniqueFound ? r[14] : r[12]);

        return {
          mre_no: String(mreNo || '').trim(),
          unique_id: uniqueId ? String(uniqueId).trim() : null,
          make: String(make || '').trim(),
          model: String(model || '').trim(),
          sev_no: sevNo ? String(sevNo).trim() : null,
          vcc: vcc ? String(vcc).trim() : null,
          build_from: buildFrom ? String(buildFrom).trim() : null,
          build_to: buildTo ? String(buildTo).trim() : null,
          sev_build_from: sevBuildFrom ? String(sevBuildFrom).trim() : null,
          sev_build_to: sevBuildTo ? String(sevBuildTo).trim() : null,
          tare_kg: tareVal ? parseFloat(tareVal) : null,
          power_kw: powerVal ? parseFloat(powerVal) : null,
          seats: seatsVal ? parseInt(seatsVal, 10) : null,
          author: authorVal ? String(authorVal).trim() : null,
          created_at: createdVal || new Date().toISOString(),
        };
      });
      const reportMap = new Map(modelReports.map(m => [m.mre_no.toUpperCase(), m]));

      // Range 1: Vehicles
      const vehiclesRaw = ranges[1]?.values || [];
      const vHeader = (vehiclesRaw[0] || []).map((h: any) => String(h).trim().toLowerCase());
      const vUidIdx = vHeader.findIndex((h: string) => h.includes('unique'));
      const vCreatedIdx = vHeader.findIndex((h: string) => h.includes('created'));
      const vUpdatedIdx = vHeader.findIndex((h: string) => h.includes('updated'));

      const vehicles = vehiclesRaw.slice(1).filter((r: any[]) => r[0] && String(r[0]).trim() !== '').map((r: any[]) => {
        const vin = String(r[0]).trim();
        const rawId = r[3] ? String(r[3]).trim().toUpperCase() : null;
        const mreNo = r[5] ? String(r[5]).trim().toUpperCase() : null;
        const rawWs = rawId ? workshopMap.get(rawId) : null;
        const mr = mreNo ? reportMap.get(mreNo) : null;

        const rawWsNameVal = r[4] ? String(r[4]).trim() : '';
        const wsName = (rawWsNameVal && !rawWsNameVal.startsWith('=') && !rawWsNameVal.startsWith('#'))
          ? rawWsNameVal
          : (rawWs?.name || null);

        const makeVal = r[6] ? String(r[6]).trim() : '';
        const modelVal = r[7] ? String(r[7]).trim() : '';

        const uidVal = vUidIdx !== -1 ? r[vUidIdx] : (r.length >= 11 ? r[8] : null);
        const createdAtVal = vCreatedIdx !== -1 ? r[vCreatedIdx] : (vUidIdx !== -1 ? r[9] : r[8]);
        const updatedAtVal = vUpdatedIdx !== -1 ? r[vUpdatedIdx] : (vUidIdx !== -1 ? r[10] : r[9]);

        return {
          vin,
          unique_id: uidVal ? String(uidVal).trim() : null,
          build_date: r[1] || '',
          via_no: r[2] || null,
          raw_id: rawId,
          raw_workshop_name: wsName,
          mre_no: mreNo,
          make: makeVal || mr?.make || null,
          model: modelVal || mr?.model || null,
          created_at: createdAtVal || new Date().toISOString(),
          updated_at: updatedAtVal || null,
        };
      });

      // Range 0: Compliance_Jobs (with full attachments reconstruction and formula resolution)
      const jobsRaw = ranges[0]?.values || [];
      const headerRow = (jobsRaw[0] || []).map((h: any) => String(h).trim().toLowerCase());
      const hasSubmitDate = headerRow.some((h: string) => h.includes('submit'));

      const jobs = jobsRaw.slice(1).filter((r: any[]) => r[0] && String(r[0]).trim() !== '').map((r: any[], i: number) => {
        const folderNo = String(r[0]).trim();
        const vin = String(r[1] || '').trim();
        const rawId = r[2] ? String(r[2]).trim().toUpperCase() : null;
        const mreNo = r[4] ? String(r[4]).trim().toUpperCase() : null;
        const rawWs = rawId ? workshopMap.get(rawId) : null;
        const mr = mreNo ? reportMap.get(mreNo) : null;

        const rawWsNameVal = r[3] ? String(r[3]).trim() : '';
        const wsName = (rawWsNameVal && !rawWsNameVal.startsWith('=') && !rawWsNameVal.startsWith('#'))
          ? rawWsNameVal
          : (rawWs?.name || null);

        const makeVal = r[5] ? String(r[5]).trim() : '';
        const modelVal = r[6] ? String(r[6]).trim() : '';

        // Dates & Status
        const requestReceived = r[9] || new Date().toISOString().slice(0, 10);
        const avvVerificationDate = r[10] || null;
        let avvSubmitDate: string | null = null;
        let ravDateOfEntry = r[11] || null;
        let approvalDate: string | null = null;
        let recallCheckDate: string | null = null;
        let status = 'in_progress';
        let driveCell = '';
        let videosUrl: string | null = null;
        let errorNote: string | null = null;
        let createdAt = new Date().toISOString();
        let jsonStr = '';

        if (hasSubmitDate) {
          avvSubmitDate = r[11] || null;
          ravDateOfEntry = r[12] || null;
          approvalDate = r[13] || null;
          recallCheckDate = r[14] || null;
          status = (['in_progress', 'verified', 'rav_entered', 'errored'].includes(r[15]) ? r[15] : 'in_progress');
          driveCell = r[26] || '';
          videosUrl = (r[27] && String(r[27]).includes('http')) ? r[27] : null;
          errorNote = r[28] || null;
          createdAt = r[29] || new Date().toISOString();
          jsonStr = r[30] || '';
        } else {
          status = (['in_progress', 'verified', 'rav_entered', 'errored'].includes(r[12]) ? r[12] : 'in_progress');
          driveCell = r[22] || '';
          videosUrl = (r[23] && String(r[23]).includes('http')) ? r[23] : ((r[15] && String(r[15]).includes('http')) ? r[15] : null);
          errorNote = r[24] || r[16] || null;
          createdAt = r[25] || r[17] || new Date().toISOString();
          jsonStr = r[26] || '';
        }

        const folderUrlMatch = String(driveCell).match(/HYPERLINK\("([^"]+)"/i);
        const folderUrl = folderUrlMatch ? folderUrlMatch[1] : (String(driveCell).startsWith('http') ? String(driveCell).trim() : null);

        const attachmentsMap: Record<string, any> = {
          CRE: null, EC: null, CIN: null, WI: null,
          DC: null, VI: null, RAW_DECLA: null, RECALL: null, PHOTOS: null
        };

        // 1. Try reading attachments from Attachments JSON
        if (jsonStr && typeof jsonStr === 'string' && jsonStr.startsWith('{')) {
          try {
            const parsed = JSON.parse(jsonStr);
            ['CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'RECALL', 'PHOTOS'].forEach(k => {
              const item = parsed[k];
              const fileUrl = item?.file_url || item?.url;
              if (item && fileUrl) {
                const finalUrl = (fileUrl.startsWith('http') && !fileUrl.startsWith('blob:'))
                  ? fileUrl
                  : (folderUrl || `https://drive.google.com/drive/search?q=${folderNo}`);
                attachmentsMap[k] = {
                  id: `att_${folderNo}_${k}`,
                  job_id: `job_sheet_${folderNo}`,
                  doc_type: k,
                  file_name: item.name || item.file_name || `${k} Document`,
                  file_url: finalUrl,
                  mime_type: item.mimeType || item.mime_type || (k === 'PHOTOS' ? 'image/jpeg' : 'application/pdf'),
                  uploaded_at: item.uploaded_at || new Date().toISOString(),
                };
              }
            });
            if (parsed._videos_url && typeof parsed._videos_url === 'string') {
              videosUrl = parsed._videos_url;
            }
          } catch (_) {}
        }

        // 2. Fallback: check document columns
        const docCols: Array<{ type: string; colIdx: number }> = hasSubmitDate
          ? [
              { type: 'CRE', colIdx: 16 },
              { type: 'EC', colIdx: 17 },
              { type: 'CIN', colIdx: 18 },
              { type: 'WI', colIdx: 19 },
              { type: 'DC', colIdx: 20 },
              { type: 'VI', colIdx: 21 },
              { type: 'RAW_DECLA', colIdx: 22 },
              { type: 'RECALL', colIdx: 23 },
              { type: 'PHOTOS', colIdx: 24 },
            ]
          : [
              { type: 'CRE', colIdx: 13 },
              { type: 'EC', colIdx: 14 },
              { type: 'CIN', colIdx: 15 },
              { type: 'WI', colIdx: 16 },
              { type: 'DC', colIdx: 17 },
              { type: 'VI', colIdx: 18 },
              { type: 'RAW_DECLA', colIdx: 19 },
              { type: 'PHOTOS', colIdx: 20 },
            ];

        docCols.forEach(({ type, colIdx }) => {
          if (!attachmentsMap[type] && r[colIdx]) {
            const rawVal = String(r[colIdx]).trim();
            if (rawVal && rawVal !== 'Missing' && rawVal !== '—') {
              const urlMatch = rawVal.match(/HYPERLINK\("([^"]+)"/i);
              const linkUrl = urlMatch ? urlMatch[1] : (rawVal.startsWith('http') ? rawVal : (folderUrl || `https://drive.google.com/drive/search?q=${folderNo}`));
              attachmentsMap[type] = {
                id: `att_${folderNo}_${type}`,
                job_id: `job_sheet_${folderNo}`,
                doc_type: type,
                file_name: `${type} Document`,
                file_url: linkUrl,
                mime_type: type === 'PHOTOS' ? 'image/jpeg' : 'application/pdf',
                uploaded_at: new Date().toISOString(),
              };
            }
          }
        });

        // Count how many documents are attached
        let uploadedDocsCount = 0;
        ['CRE', 'EC', 'CIN', 'WI', 'DC', 'VI', 'RAW_DECLA', 'RECALL', 'PHOTOS'].forEach(k => {
          if (attachmentsMap[k]) uploadedDocsCount++;
        });

        const docsSummary = (hasSubmitDate ? r[25] : r[21]) || '';
        if (uploadedDocsCount === 0 && docsSummary) {
          uploadedDocsCount = parseInt(String(docsSummary).split('/')[0], 10) || 0;
        }

        const isComplete = uploadedDocsCount >= 8 || String(docsSummary).includes('Complete') || String(docsSummary).includes('9/9');

        return {
          id: `job_sheet_${folderNo || i}`,
          folder_no: folderNo,
          vin,
          raw_id: rawId,
          raw_workshop_name: wsName,
          mre_no: mreNo,
          make: makeVal || mr?.make || null,
          model: modelVal || mr?.model || null,
          build_date: r[7] || null,
          via_no: r[8] || null,
          request_received: requestReceived,
          avv_verification_date: avvVerificationDate,
          avv_submit_date: avvSubmitDate,
          rav_date_of_entry: ravDateOfEntry,
          approval_date: approvalDate,
          recall_check_date: recallCheckDate,
          status,
          attachments: attachmentsMap,
          uploaded_docs_count: uploadedDocsCount,
          is_documents_complete: isComplete,
          videos_url: videosUrl,
          folder_url: folderUrl,
          error_note: errorNote,
          created_at: createdAt,
        };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          refreshedAccessToken: refreshedTokenToReturn,
          data: {
            jobs,
            vehicles,
            workshops,
            modelReports,
          },
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unknown action: ${payload.action}` }),
    };
  } catch (err: any) {
    console.error('[drive-sync function error]:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error during Drive sync' }),
    };
  }
};

