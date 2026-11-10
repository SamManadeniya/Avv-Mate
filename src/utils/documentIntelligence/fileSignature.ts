/**
 * File Signature (Magic Byte) Sniffer
 * Detects true MIME type and format from raw file bytes, ignoring untrusted extensions
 */

export type DetectedFormat =
  | 'PDF'
  | 'JPEG'
  | 'PNG'
  | 'WEBP'
  | 'HEIC'
  | 'VIDEO_MP4'
  | 'VIDEO_MOV'
  | 'VIDEO_OTHER'
  | 'IMAGE_OTHER'
  | 'UNKNOWN';

export interface FileSignatureResult {
  format: DetectedFormat;
  mimeType: string;
  isPdf: boolean;
  isImage: boolean;
  isVideo: boolean;
}

export async function detectFileSignature(file: File): Promise<FileSignatureResult> {
  try {
    const slice = file.slice(0, 32);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return { format: 'PDF', mimeType: 'application/pdf', isPdf: true, isImage: false, isVideo: false };
    }

    // 2. JPEG: 0xFF 0xD8 0xFF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { format: 'JPEG', mimeType: 'image/jpeg', isPdf: false, isImage: true, isVideo: false };
    }

    // 3. PNG: 0x89 0x50 0x4E 0x47 (0x89 'P' 'N' 'G')
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { format: 'PNG', mimeType: 'image/png', isPdf: false, isImage: true, isVideo: false };
    }

    // 4. WEBP: RIFF .... WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return { format: 'WEBP', mimeType: 'image/webp', isPdf: false, isImage: true, isVideo: false };
    }

    // 5. MP4 / MOV: ....ftyp (0x66 0x74 0x79 0x70)
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (brand === 'qt  ' || brand === 'moov') {
        return { format: 'VIDEO_MOV', mimeType: 'video/quicktime', isPdf: false, isImage: false, isVideo: true };
      }
      return { format: 'VIDEO_MP4', mimeType: 'video/mp4', isPdf: false, isImage: false, isVideo: true };
    }

    // Fallback: check file.type and extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.type === 'application/pdf' || ext === 'pdf') {
      return { format: 'PDF', mimeType: 'application/pdf', isPdf: true, isImage: false, isVideo: false };
    }
    if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
      return { format: 'JPEG', mimeType: file.type || 'image/jpeg', isPdf: false, isImage: true, isVideo: false };
    }
    if (file.type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
      return { format: 'VIDEO_MP4', mimeType: file.type || 'video/mp4', isPdf: false, isImage: false, isVideo: true };
    }

    return { format: 'UNKNOWN', mimeType: file.type || 'application/octet-stream', isPdf: false, isImage: false, isVideo: false };
  } catch (_) {
    return { format: 'UNKNOWN', mimeType: file.type || 'application/octet-stream', isPdf: false, isImage: false, isVideo: false };
  }
}

