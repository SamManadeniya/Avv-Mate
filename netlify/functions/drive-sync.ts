/**
 * Netlify Serverless Function: Google Drive Hierarchy Synchronization
 * Runs on Node.js (Server-to-Server) - completely bypasses browser CORS and CSP.
 */

interface RequestBody {
  action: 'ensureVehicleFolderHierarchy' | 'testConnection' | 'syncFilesFromUrls' | 'organizeVehicleFolders' | 'uploadFile' | 'initiateResumableUpload' | 'listFiles' | 'getOrCreateMasterSpreadsheet' | 'syncMasterSpreadsheet' | 'readMasterSpreadsheet';
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
}

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
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const token = payload.accessToken || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '');

    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Google Drive access token is required.' }),
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
            const isPhoto = f.category === 'photos' || f.docType === 'PHOTOS' || isImageFileServer(f.name, f.mimeType);
            const isVideo = f.category === 'videos' || f.docType === 'VIDEOS' || isVideoFileServer(f.name, f.mimeType);

            if (isPhoto && photosFolderId) {
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
      const uploaded = await uploadFileBufferServer(
        token,
        folderId,
        fileName,
        mimeType,
        fileBuffer
      );

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

      // 1. Search if already exists in parent folder or drive
      try {
        const searchQ = `name='${title.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink,parents)`;
        const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const existing = (searchData.files || [])[0];
          if (existing) {
            if (parentFolderId && (!existing.parents || !existing.parents.includes(parentFolderId))) {
              const moveUrl = `https://www.googleapis.com/drive/v3/files/${existing.id}?addParents=${parentFolderId}&supportsAllDrives=true`;
              await fetch(moveUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            }
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
          }
        }
      } catch (err) {
        console.warn('Error searching for master spreadsheet:', err);
      }

      // 2. Primary: Create native Google Spreadsheet via Google Drive multipart upload
      let spreadsheetId: string | null = null;
      let webViewLink: string | null = null;

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
        } else {
          const errText = await uploadRes.text();
          console.warn('Multipart spreadsheet creation notice:', errText);
        }
      } catch (err) {
        console.warn('Drive multipart creation failed, trying fallback:', err);
      }

      // Secondary fallback: Try creating via Sheets API
      if (!spreadsheetId) {
        const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
        const sheetTabs = [
          { properties: { title: 'Compliance_Jobs', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Vehicles', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'RAW_Workshops', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Model_Reports', gridProperties: { frozenRowCount: 1 } } },
        ];

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
          return {
            statusCode: createRes.status,
            headers,
            body: JSON.stringify({ error: `Failed to create Google Spreadsheet: ${errText}` }),
          };
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

      // 4. Try to add 4 tabs via Sheets API (if Sheets API is enabled, otherwise default Sheet1 exists)
      try {
        const addTabsReq = [
          { addSheet: { properties: { title: 'Compliance_Jobs' } } },
          { addSheet: { properties: { title: 'Vehicles' } } },
          { addSheet: { properties: { title: 'RAW_Workshops' } } },
          { addSheet: { properties: { title: 'Model_Reports' } } },
        ];
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: addTabsReq }),
        });
      } catch (_) {}

      // 5. Initialize Header Rows
      const headersPayload = {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Compliance_Jobs!A1:R1',
            values: [
              [
                'Folder #', 'VIN', 'RAW ID', 'RAW Workshop Name', 'MRE #',
                'Make', 'Model', 'Build Date', 'VIA #', 'Request Received',
                'AVV Verification Date', 'RAV Date of Entry', 'Status',
                'Docs Uploaded', 'Google Drive Folder', 'Inspection Videos',
                'Error Note', 'Created At'
              ]
            ]
          },
          {
            range: 'Vehicles!A1:J1',
            values: [
              [
                'VIN', 'Build Date', 'VIA #', 'RAW ID', 'RAW Workshop Name',
                'MRE #', 'Make', 'Model', 'Created At', 'Updated At'
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
            range: 'Model_Reports!A1:L1',
            values: [
              [
                'MRE #', 'Make', 'Model', 'SEV #', 'Category (VCC)',
                'Build From', 'Build To', 'Tare (kg)', 'Power (kW)', 'Seats',
                'Author', 'Created At'
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

      const updateData: Array<{ range: string; values: any[][] }> = [];

      // 1. Compliance_Jobs
      if (Array.isArray(tables.jobs)) {
        const jobRows: any[][] = [
          [
            'Folder #', 'VIN', 'RAW ID', 'RAW Workshop Name', 'MRE #',
            'Make', 'Model', 'Build Date', 'VIA #', 'Request Received',
            'AVV Verification Date', 'RAV Date of Entry', 'Status',
            'Docs Uploaded', 'Google Drive Folder', 'Inspection Videos',
            'Error Note', 'Created At'
          ]
        ];

        tables.jobs.forEach((j: any, idx: number) => {
          const rowNum = idx + 2;
          const folderUrl = j.folder_url || (j.folder_no ? `https://drive.google.com/drive/search?q=${j.folder_no}` : '');
          const driveCell = folderUrl ? `=HYPERLINK("${folderUrl}", "${j.folder_no}")` : (j.folder_no || '');
          const videosCell = j.videos_url ? `=HYPERLINK("${j.videos_url}", "Watch Videos")` : '';
          const workshopFormula = `=IFERROR(XLOOKUP(C${rowNum}, RAW_Workshops!A:A, RAW_Workshops!B:B), "${(j.raw_workshop_name || '').replace(/"/g, '""')}")`;

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
            j.rav_date_of_entry || '',
            j.status || 'in_progress',
            j.uploaded_docs_count !== undefined ? `${j.uploaded_docs_count}/8` : (j.is_documents_complete ? '8/8 Complete' : 'Pending'),
            driveCell,
            videosCell,
            j.error_note || '',
            j.created_at || new Date().toISOString()
          ]);
        });

        updateData.push({ range: 'Compliance_Jobs!A1:R', values: jobRows });
      }

      // 2. Vehicles
      if (Array.isArray(tables.vehicles)) {
        const vehicleRows: any[][] = [
          [
            'VIN', 'Build Date', 'VIA #', 'RAW ID', 'RAW Workshop Name',
            'MRE #', 'Make', 'Model', 'Created At', 'Updated At'
          ]
        ];

        tables.vehicles.forEach((v: any, idx: number) => {
          const rowNum = idx + 2;
          const workshopFormula = `=IFERROR(XLOOKUP(D${rowNum}, RAW_Workshops!A:A, RAW_Workshops!B:B), "${(v.raw_workshop_name || '').replace(/"/g, '""')}")`;
          vehicleRows.push([
            v.vin || '',
            v.build_date || '',
            v.via_no || '',
            v.raw_id || '',
            workshopFormula,
            v.mre_no || '',
            v.make || '',
            v.model || '',
            v.created_at || '',
            v.updated_at || ''
          ]);
        });

        updateData.push({ range: 'Vehicles!A1:J', values: vehicleRows });
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

        updateData.push({ range: 'RAW_Workshops!A1:G', values: workshopRows });
      }

      // 4. Model_Reports
      if (Array.isArray(tables.modelReports)) {
        const reportRows: any[][] = [
          [
            'MRE #', 'Make', 'Model', 'SEV #', 'Category (VCC)',
            'Build From', 'Build To', 'Tare (kg)', 'Power (kW)', 'Seats',
            'Author', 'Created At'
          ]
        ];

        tables.modelReports.forEach((r: any) => {
          reportRows.push([
            r.mre_no || '',
            r.make || '',
            r.model || '',
            r.sev_no || '',
            r.vcc || '',
            r.build_from || '',
            r.build_to || '',
            r.tare_kg || '',
            r.power_kw || '',
            r.seats || '',
            r.author || '',
            r.created_at || ''
          ]);
        });

        updateData.push({ range: 'Model_Reports!A1:L', values: reportRows });
      }

      if (updateData.length > 0) {
        const writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: updateData,
          }),
        });

        if (!writeRes.ok) {
          const errText = await writeRes.text();
          return { statusCode: writeRes.status, headers, body: JSON.stringify({ error: `Failed to write sheet values: ${errText}` }) };
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          syncedTabs: updateData.map(d => d.range.split('!')[0]),
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        }),
      };
    }

    if (payload.action === 'readMasterSpreadsheet') {
      const spreadsheetId = payload.spreadsheetId;
      if (!spreadsheetId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'spreadsheetId is required' }) };
      }

      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Compliance_Jobs!A1:R&ranges=Vehicles!A1:J&ranges=RAW_Workshops!A1:G&ranges=Model_Reports!A1:L`;
      const readRes = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!readRes.ok) {
        const errText = await readRes.text();
        return { statusCode: readRes.status, headers, body: JSON.stringify({ error: `Failed to read spreadsheet: ${errText}` }) };
      }

      const readData = await readRes.json();
      const ranges = readData.valueRanges || [];

      // Range 0: Compliance_Jobs
      const jobsRaw = ranges[0]?.values || [];
      const jobs = jobsRaw.slice(1).filter((r: any[]) => r[0] && r[1]).map((r: any[], i: number) => ({
        id: `job_sheet_${r[0] || i}`,
        folder_no: r[0] || '',
        vin: r[1] || '',
        raw_id: r[2] || null,
        raw_workshop_name: r[3] || null,
        mre_no: r[4] || null,
        make: r[5] || null,
        model: r[6] || null,
        build_date: r[7] || null,
        via_no: r[8] || null,
        request_received: r[9] || new Date().toISOString().slice(0, 10),
        avv_verification_date: r[10] || null,
        rav_date_of_entry: r[11] || null,
        status: (['in_progress', 'verified', 'rav_entered', 'errored'].includes(r[12]) ? r[12] : 'in_progress'),
        uploaded_docs_count: parseInt((r[13] || '').split('/')[0], 10) || 0,
        is_documents_complete: (r[13] || '').includes('8/8') || (r[13] || '').includes('Complete'),
        videos_url: (r[15] && r[15].includes('http')) ? r[15] : null,
        error_note: r[16] || null,
        created_at: r[17] || new Date().toISOString(),
      }));

      // Range 1: Vehicles
      const vehiclesRaw = ranges[1]?.values || [];
      const vehicles = vehiclesRaw.slice(1).filter((r: any[]) => r[0]).map((r: any[]) => ({
        vin: r[0] || '',
        build_date: r[1] || '',
        via_no: r[2] || null,
        raw_id: r[3] || null,
        raw_workshop_name: r[4] || null,
        mre_no: r[5] || null,
        make: r[6] || null,
        model: r[7] || null,
        created_at: r[8] || new Date().toISOString(),
        updated_at: r[9] || null,
      }));

      // Range 2: RAW_Workshops
      const workshopsRaw = ranges[2]?.values || [];
      const workshops = workshopsRaw.slice(1).filter((r: any[]) => r[0]).map((r: any[]) => ({
        raw_id: r[0] || '',
        name: r[1] || '',
        contact_email: r[2] || null,
        contact_phone: r[3] || null,
        total_vehicles: parseInt(r[4], 10) || 0,
        created_at: r[5] || new Date().toISOString(),
        updated_at: r[6] || null,
      }));

      // Range 3: Model_Reports
      const reportsRaw = ranges[3]?.values || [];
      const modelReports = reportsRaw.slice(1).filter((r: any[]) => r[0]).map((r: any[]) => ({
        mre_no: r[0] || '',
        make: r[1] || '',
        model: r[2] || '',
        sev_no: r[3] || null,
        vcc: r[4] || null,
        build_from: r[5] || null,
        build_to: r[6] || null,
        tare_kg: r[7] ? parseFloat(r[7]) : null,
        power_kw: r[8] ? parseFloat(r[8]) : null,
        seats: r[9] ? parseInt(r[9], 10) : null,
        author: r[10] || null,
        created_at: r[11] || new Date().toISOString(),
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
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

