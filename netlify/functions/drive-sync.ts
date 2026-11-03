/**
 * Netlify Serverless Function: Google Drive Hierarchy Synchronization
 * Runs on Node.js (Server-to-Server) - completely bypasses browser CORS and CSP.
 */

interface RequestBody {
  action: 'ensureVehicleFolderHierarchy' | 'testConnection';
  folderNo?: string;
  parentFolderId?: string;
  accessToken?: string;
}

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
