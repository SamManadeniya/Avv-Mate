/**
 * Netlify Serverless Function: Google Drive Hierarchy Synchronization
 * Runs on Node.js (Server-to-Server) - completely bypasses browser CORS and CSP.
 */

interface RequestBody {
  action: 'ensureVehicleFolderHierarchy' | 'testConnection' | 'syncFilesFromUrls' | 'organizeVehicleFolders' | 'uploadFile';
  folderNo?: string;
  parentFolderId?: string;
  folderId?: string;
  name?: string;
  mimeType?: string;
  base64Data?: string;
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

