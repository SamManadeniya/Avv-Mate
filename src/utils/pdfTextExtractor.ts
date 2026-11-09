import type { DocType } from '../types';

export interface ExtractedPdfMetadata {
  rawText: string;
  vin?: string;
  rawId?: string;
  mreNo?: string;
  make?: string;
  model?: string;
  detectedDocType?: DocType;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchReason?: string;
}

/**
 * Searches a binary Uint8Array for a sub-sequence of bytes (Buffer.indexOf equivalent for browser)
 */
function findSubarray(haystack: Uint8Array, needle: Uint8Array, startPos = 0): number {
  const nLen = needle.length;
  const hLen = haystack.length;
  if (nLen === 0 || hLen === 0 || nLen > hLen) return -1;

  for (let i = startPos; i <= hLen - nLen; i++) {
    let match = true;
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Decompress a Deflate/FlateDecode stream using browser native DecompressionStream
 */
async function decompressFlate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    // 1. Try standard zlib 'deflate'
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(bytes as any);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return new TextDecoder('latin1').decode(merged);
    } catch (_) {
      // 2. Try raw deflate (strip 2-byte zlib header if 0x78)
      try {
        const dsRaw = new DecompressionStream('deflate-raw');
        const writer = dsRaw.writable.getWriter();
        const rawSlice = bytes[0] === 0x78 ? bytes.slice(2, bytes.length - 4) : bytes;
        writer.write(rawSlice as any);
        writer.close();
        const reader = dsRaw.readable.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        return new TextDecoder('latin1').decode(merged);
      } catch (_) {
        // Fallback to plain decoding
      }
    }
  }
  return new TextDecoder('latin1').decode(bytes);
}

/**
 * Reads binary streams and metadata inside a PDF file in the browser
 */
export async function extractPdfTextAndMetadata(file: File): Promise<ExtractedPdfMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const streamMarker = new TextEncoder().encode('stream');
    const endstreamMarker = new TextEncoder().encode('endstream');

    let allExtractedText = '';

    // Direct text decode of uncompressed sections (PDF headers, objects, dictionaries)
    const directAscii = new TextDecoder('latin1').decode(uint8);
    allExtractedText += ' ' + directAscii;

    // Scan binary stream ... endstream blocks
    let pos = 0;
    let streamCount = 0;
    while ((pos = findSubarray(uint8, streamMarker, pos)) !== -1) {
      let start = pos + 6;
      if (uint8[start] === 0x0d && uint8[start + 1] === 0x0a) start += 2;
      else if (uint8[start] === 0x0a || uint8[start] === 0x0d) start += 1;

      const end = findSubarray(uint8, endstreamMarker, start);
      if (end === -1) break;

      let streamEnd = end;
      if (uint8[streamEnd - 1] === 0x0a && uint8[streamEnd - 2] === 0x0d) streamEnd -= 2;
      else if (uint8[streamEnd - 1] === 0x0a || uint8[streamEnd - 1] === 0x0d) streamEnd -= 1;

      if (streamEnd > start) {
        const streamBytes = uint8.subarray(start, streamEnd);
        try {
          const decompressed = await decompressFlate(streamBytes);
          allExtractedText += ' ' + decompressed;
        } catch (_) {}
      }

      streamCount++;
      pos = end + 9;
      // Safety limit to avoid freeze on massive PDFs
      if (streamCount > 60) break;
    }

    // Extract strings inside PDF string literals ( ... )
    const parenMatches = Array.from(allExtractedText.matchAll(/\(([^)]+)\)/g), m => m[1]);
    const cleanContentText = parenMatches.join(' ') + ' ' + allExtractedText;

    // 1. Extract VIN #
    let vin: string | undefined;
    // Match: Vehicle Identification Number (VIN) 6ZZK... or VIN: 6ZZK... or VIN # 6ZZK...
    const vinPrefixMatch = cleanContentText.match(/(?:VIN|Vehicle\s+Identification\s+Number)[^A-HJ-NPR-Z0-9]*([A-HJ-NPR-Z0-9]{11,18})/i);
    if (vinPrefixMatch) {
      const candidate = vinPrefixMatch[1].toUpperCase();
      if (/[0-9]/.test(candidate) && /[A-Z]/.test(candidate)) {
        vin = candidate;
      }
    }

    if (!vin) {
      // Australian 6ZZ format or standard 17-char ISO VIN
      const isolatedVinMatch = cleanContentText.match(/\b(6ZZ[A-HJ-NPR-Z0-9]{14,15}|[A-HJ-NPR-Z0-9]{17})\b/i);
      if (isolatedVinMatch) {
        const candidate = isolatedVinMatch[0].toUpperCase();
        // Validate candidate has both digits and characters to prevent word matching
        if (/[0-9]/.test(candidate) && /[A-Z]/.test(candidate)) {
          vin = candidate;
        }
      }
    }

    // Fallback Japanese Chassis format (e.g. ZE1-060474, ANH20-0012345, MNH10-123456)
    if (!vin) {
      const chassisMatch = cleanContentText.match(/\b([A-Z0-9]{2,6}[-_][0-9]{5,8})\b/i);
      if (chassisMatch) {
        vin = chassisMatch[1].toUpperCase();
      }
    }

    // 2. Extract RAW Workshop ID
    let rawId: string | undefined;
    const rawMatch = cleanContentText.match(/\bRAW[:\-_\s]*(\d{3,6})\b/i);
    if (rawMatch) {
      const numPart = rawMatch[1].replace(/[^0-9]/g, '');
      rawId = `RAW-${numPart.padStart(6, '0')}`;
    }

    // Check approval holder business names (e.g. from RAW Declaration Row 5)
    if (!rawId) {
      const upperText = cleanContentText.toUpperCase();
      if (upperText.includes('SEAN PHAN')) {
        rawId = 'RAW-000175';
      } else if (upperText.includes('SYDNEY UNIQUE')) {
        rawId = 'RAW-000070';
      } else if (upperText.includes('NINETYNINE') || upperText.includes('NINETY NINE')) {
        rawId = 'RAW-000245';
      }
    }

    // 3. Extract Model Report MRE #
    let mreNo: string | undefined;
    // Match table row: Approved Model Report number MRE-000099 or Model Report number 000099
    const tableMreMatch = cleanContentText.match(/(?:Approved\s+Model\s+Report(?:\s+number)?|Model\s+Report(?:\s+number)?)[^A-Z0-9]*(?:MRE[:\-_\s]*)?(\d{2,6})\b/i);
    if (tableMreMatch) {
      const numPart = tableMreMatch[1].replace(/[^0-9]/g, '');
      mreNo = `MRE-${numPart.padStart(6, '0')}`;
    }

    if (!mreNo) {
      const standaloneMreMatch = cleanContentText.match(/\bMRE[:\-_\s]*(\d{2,6})\b/i);
      if (standaloneMreMatch) {
        const numPart = standaloneMreMatch[1].replace(/[^0-9]/g, '');
        mreNo = `MRE-${numPart.padStart(6, '0')}`;
      }
    }

    // Extract Vehicle Make & Model if present in table
    let make: string | undefined;
    let model: string | undefined;
    const makeMatch = cleanContentText.match(/\bMake[^A-Za-z0-9]+([A-Za-z0-9\-]+)/i);
    if (makeMatch && !/^(details|number|rav|model)/i.test(makeMatch[1])) {
      make = makeMatch[1].trim();
    }
    const modelMatch = cleanContentText.match(/\bModel[^A-Za-z0-9]+([A-Za-z0-9\-]+)/i);
    if (modelMatch && !/^(report|number|details|instruction)/i.test(modelMatch[1])) {
      model = modelMatch[1].trim();
    }

    // 4. Identify Document Type from Content Text
    const lowerContent = cleanContentText.toLowerCase();
    let detectedDocType: DocType | undefined;
    let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
    let matchReason: string | undefined;

    // Check for DC: Damage or Corrosion
    if (
      lowerContent.includes('damage or corrosion') ||
      lowerContent.includes('damage and corrosion') ||
      lowerContent.includes('damage & corrosion') ||
      lowerContent.includes('corrosion report') ||
      lowerContent.includes('damage report') ||
      lowerContent.includes('structural damage') ||
      lowerContent.includes('dc report') ||
      (lowerContent.includes('damage') && lowerContent.includes('corrosion'))
    ) {
      detectedDocType = 'DC';
      confidence = 'high';
      matchReason = 'Content contains "Damage or Corrosion Assessment"';
    } else if (
      lowerContent.includes('concessional rav entry') ||
      lowerContent.includes('concessional entry') ||
      lowerContent.includes('rav entry approval') ||
      lowerContent.includes('approval to provide') ||
      (lowerContent.includes('rover') && lowerContent.includes('concessional'))
    ) {
      detectedDocType = 'CRE';
      confidence = 'high';
      matchReason = 'Content contains "Concessional RAV Entry Approval"';
    } else if (
      lowerContent.includes('export certificate') ||
      lowerContent.includes('export cer') ||
      lowerContent.includes('certificate of export') ||
      lowerContent.includes('yushutsu') ||
      lowerContent.includes('shoumeisho') ||
      lowerContent.includes('ministry of land, infrastructure')
    ) {
      detectedDocType = 'EC';
      confidence = 'high';
      matchReason = 'Content contains "Export Certificate"';
    } else if (
      lowerContent.includes('consumer information notice') ||
      lowerContent.includes('consumer import notice') ||
      lowerContent.includes('import notice')
    ) {
      detectedDocType = 'CIN';
      confidence = 'high';
      matchReason = 'Content contains "Consumer Import Notice"';
    } else if (
      lowerContent.includes('model report modification') ||
      lowerContent.includes('work instructions') ||
      lowerContent.includes('work instruction') ||
      lowerContent.includes('model report wi')
    ) {
      detectedDocType = 'WI';
      confidence = 'high';
      matchReason = 'Content contains "Work Instructions"';
    } else if (
      lowerContent.includes('raw declaration') ||
      lowerContent.includes('workshop declaration') ||
      lowerContent.includes('declaration of compliance') ||
      lowerContent.includes('registered automotive workshop') ||
      lowerContent.includes('checks conducted by the raw') ||
      (lowerContent.includes('approval holder') && lowerContent.includes('model report details'))
    ) {
      detectedDocType = 'RAW_DECLA';
      confidence = 'high';
      matchReason = 'Content contains "RAW Workshop Declaration"';
    } else if (
      lowerContent.includes('recall clearance') ||
      lowerContent.includes('recall check') ||
      lowerContent.includes('active recalls') ||
      lowerContent.includes('recall status')
    ) {
      detectedDocType = 'RECALL';
      confidence = 'high';
      matchReason = 'Content contains "Recall Clearance / Status Check"';
    } else if (
      lowerContent.includes('vehicle inspection') ||
      lowerContent.includes('physical inspection checklist') ||
      lowerContent.includes('inspection checklist') ||
      lowerContent.includes('inspection report')
    ) {
      detectedDocType = 'VI';
      confidence = 'high';
      matchReason = 'Content contains "Vehicle Inspection Checklist"';
    }

    return {
      rawText: cleanContentText.slice(0, 5000),
      vin,
      rawId,
      mreNo,
      make,
      model,
      detectedDocType,
      confidence,
      matchReason,
    };
  } catch (err) {
    console.warn('PDF stream extraction error:', err);
    return {
      rawText: '',
      confidence: 'none',
    };
  }
}

/**
 * Standard clean document filename generator
 * e.g. SVC1013_DC_Damage_or_Corrosion.pdf
 */
export function generateStandardFileName(folderNo: string, docType: DocType, originalName: string): string {
  const cleanFolder = (folderNo || 'JOB').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '.pdf';

  const standardTitles: Record<DocType, string> = {
    CRE: 'CRE_Concessional_RAV_Entry',
    EC: 'EC_Export_Certificate',
    CIN: 'CIN_Import_Notice',
    WI: 'WI_Work_Instructions',
    DC: 'DC_Damage_or_Corrosion',
    VI: 'VI_Vehicle_Inspection',
    RAW_DECLA: 'RAW_DECLA_Workshop_Declaration',
    RECALL: 'RECALL_Recall_Check',
    PHOTOS: 'Compliance_Photos',
  };

  const title = standardTitles[docType] || docType;
  return `${cleanFolder}_${title}${ext.toLowerCase()}`;
}

/**
 * Creates a new File object with the standardized clean filename
 */
export function createRenamedFile(originalFile: File, newName: string): File {
  return new File([originalFile], newName, {
    type: originalFile.type || 'application/pdf',
    lastModified: originalFile.lastModified || Date.now(),
  });
}
