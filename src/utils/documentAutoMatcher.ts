import type { DocType } from '../types';
import { extractPdfTextAndMetadata } from './pdfTextExtractor';

export type AutoMatchTarget = DocType | 'VIDEOS' | 'IGNORE';

export interface AutoMatchFile {
  id: string;
  file: File;
  target: AutoMatchTarget;
  confidence: 'high' | 'medium' | 'manual';
  matchReason: string;
  score: number;
}

export interface AutoMatchResult {
  matches: AutoMatchFile[];
  matchedDocCount: number;
  photoCount: number;
  videoCount: number;
  unmatchedCount: number;
  totalFiles: number;
  extractedVin?: string;
  extractedRawId?: string;
  extractedMreNo?: string;
}

// 8 Core Compliance Documents (excluding PHOTOS which is batch media)
export const CORE_DOC_SLOTS: Array<{ type: DocType; label: string; name: string }> = [
  { type: 'CRE', label: 'CRE', name: 'Concessional RAV Entry' },
  { type: 'EC', label: 'EC', name: 'Export Certificate' },
  { type: 'CIN', label: 'CIN', name: 'Import Notice' },
  { type: 'WI', label: 'WI', name: 'Work Instructions' },
  { type: 'DC', label: 'DC', name: 'Damage or Corrosion' },
  { type: 'VI', label: 'VI', name: 'Vehicle Inspection' },
  { type: 'RAW_DECLA', label: 'RAW DECLA', name: 'RAW Declaration' },
  { type: 'RECALL', label: 'RECALL', name: 'Recall Check' },
];

/**
 * Score a single file against a specific Document Slot
 */
function scoreDocSlot(baseName: string, words: string[], type: DocType): { score: number; reason: string } {
  const text = baseName.toLowerCase();

  switch (type) {
    case 'CRE': {
      if (words.includes('cre')) return { score: 100, reason: 'Matched abbreviation "CRE"' };
      if (text.includes('concessional rav entry') || text.includes('concessional entry')) {
        return { score: 98, reason: 'Matched "Concessional RAV Entry"' };
      }
      if (text.includes('rav entry') || text.includes('rav_entry')) {
        return { score: 95, reason: 'Matched "RAV Entry"' };
      }
      if (text.includes('import approval') || text.includes('concessional approval')) {
        return { score: 90, reason: 'Matched "Import Approval"' };
      }
      if (words.includes('concessional')) return { score: 85, reason: 'Matched "Concessional"' };
      if (/^(0?1)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #1' };
      break;
    }

    case 'EC': {
      if (text.includes('export cert') || text.includes('export_cert') || text.includes('export certificate')) {
        return { score: 100, reason: 'Matched "Export Certificate"' };
      }
      if (words.includes('export') && !words.includes('import')) {
        return { score: 85, reason: 'Matched "Export"' };
      }
      if (words.includes('ec') && !words.includes('check') && !words.includes('decl') && !words.includes('tech')) {
        return { score: 80, reason: 'Matched abbreviation "EC"' };
      }
      if (/^(0?2)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #2' };
      break;
    }

    case 'CIN': {
      if (words.includes('cin')) return { score: 100, reason: 'Matched abbreviation "CIN"' };
      if (text.includes('import notice') || text.includes('import_notice')) {
        return { score: 98, reason: 'Matched "Import Notice"' };
      }
      if (text.includes('consumer import') || text.includes('consumer information notice')) {
        return { score: 95, reason: 'Matched "Consumer Import Notice"' };
      }
      if (words.includes('consumer') && words.includes('notice')) {
        return { score: 90, reason: 'Matched "Consumer Notice"' };
      }
      if (/^(0?3)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #3' };
      break;
    }

    case 'WI': {
      if (text.includes('work instruction') || text.includes('work_instruction') || text.includes('workinstruction')) {
        return { score: 100, reason: 'Matched "Work Instructions"' };
      }
      if (text.includes('model report wi') || text.includes('modification guide') || text.includes('inspection guide')) {
        return { score: 90, reason: 'Matched "Model Report WI"' };
      }
      if (words.includes('wi')) return { score: 85, reason: 'Matched abbreviation "WI"' };
      if (/^(0?4)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #4' };
      break;
    }

    case 'DC': {
      if (text.includes('damage or corrosion') || text.includes('damage and corrosion') || text.includes('damage & corrosion')) {
        return { score: 100, reason: 'Matched "Damage or Corrosion"' };
      }
      if (text.includes('corrosion report') || text.includes('damage report') || text.includes('structural damage') || text.includes('dc report')) {
        return { score: 98, reason: 'Matched "Damage & Corrosion Report"' };
      }
      if (text.includes('corrosion inspection') || text.includes('damage assessment') || text.includes('rust inspection')) {
        return { score: 95, reason: 'Matched "Damage / Corrosion Assessment"' };
      }
      if (words.includes('corrosion') || words.includes('rust')) {
        return { score: 90, reason: 'Matched "Corrosion"' };
      }
      if (words.includes('damage') && !words.includes('wi')) {
        return { score: 85, reason: 'Matched "Damage"' };
      }
      if (words.includes('dc')) return { score: 80, reason: 'Matched abbreviation "DC"' };
      // Fallback historical matching for older dereg certificates
      if (text.includes('deregistration cert') || text.includes('deregistration certificate') || text.includes('dereg cert')) {
        return { score: 75, reason: 'Matched "Deregistration / DC Cert"' };
      }
      if (words.includes('deregistration') || words.includes('dereg')) {
        return { score: 70, reason: 'Matched "Deregistration"' };
      }
      if (/^(0?5)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #5' };
      break;
    }

    case 'VI': {
      if (text.includes('vehicle inspection') || text.includes('vehicle_inspection') || text.includes('physical inspection')) {
        return { score: 100, reason: 'Matched "Vehicle Inspection"' };
      }
      if (text.includes('inspection checklist') || text.includes('inspection sheet') || text.includes('physical check')) {
        return { score: 95, reason: 'Matched "Inspection Checklist"' };
      }
      if (words.includes('vi') && !words.includes('vin')) return { score: 85, reason: 'Matched abbreviation "VI"' };
      if (words.includes('inspection') && !words.includes('recall') && !words.includes('guide')) {
        return { score: 75, reason: 'Matched "Inspection"' };
      }
      if (words.includes('checklist')) return { score: 70, reason: 'Matched "Checklist"' };
      if (/^(0?6)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #6' };
      break;
    }

    case 'RAW_DECLA': {
      if (text.includes('raw declaration') || text.includes('raw_declaration') || text.includes('raw decla') || text.includes('raw_decla') || text.includes('raw decl')) {
        return { score: 100, reason: 'Matched "RAW Declaration"' };
      }
      if (text.includes('workshop declaration') || text.includes('compliance declaration')) {
        return { score: 95, reason: 'Matched "Workshop Compliance Declaration"' };
      }
      if (words.includes('declaration') || words.includes('decla')) return { score: 85, reason: 'Matched "Declaration"' };
      if (words.includes('raw') && words.includes('decl')) return { score: 85, reason: 'Matched "RAW Decl"' };
      if (/^(0?7)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #7' };
      break;
    }

    case 'RECALL': {
      if (text.includes('recall check') || text.includes('recall_check') || text.includes('recall clearance') || text.includes('recall status')) {
        return { score: 100, reason: 'Matched "Recall Check / Clearance"' };
      }
      if (words.includes('recall')) return { score: 90, reason: 'Matched "Recall"' };
      if (/^(0?8)[_\-\s\.]/.test(baseName)) return { score: 45, reason: 'Matched numeric prefix #8' };
      break;
    }

    default:
      break;
  }

  return { score: 0, reason: '' };
}

/**
 * Automatically sorts and matches an arbitrary list of selected files to AVV Compliance slots.
 */
export function autoMatchFiles(files: File[]): AutoMatchResult {
  const candidates: Array<{
    id: string;
    file: File;
    bestTarget: AutoMatchTarget;
    score: number;
    reason: string;
    isMedia: boolean;
  }> = [];

  // Track occupied compliance slots to avoid duplicate high-confidence collisions
  const slotClaimed: Partial<Record<DocType, { id: string; score: number }>> = {};

  files.forEach((file, index) => {
    const id = `match_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();
    const baseName = lowerName.replace(/\.[^/.]+$/, '');
    const cleanText = baseName.replace(/[\s_\-\.\+\(\)\[\]]+/g, ' ');
    const words = cleanText.split(/\s+/).filter(Boolean);

    const isVideoFile = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName);
    const isImageFile = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(fileName);

    // 1. Check for Videos
    if (isVideoFile || words.includes('video') || words.includes('videos') || words.includes('clip')) {
      candidates.push({
        id,
        file,
        bestTarget: 'VIDEOS',
        score: 100,
        reason: 'Detected video format or keyword (Inspection Video)',
        isMedia: true,
      });
      return;
    }

    // 2. Score against all 8 Core Compliance Documents
    let topDocType: DocType | null = null;
    let highestScore = 0;
    let bestReason = '';

    CORE_DOC_SLOTS.forEach(({ type }) => {
      const { score, reason } = scoreDocSlot(baseName, words, type);
      if (score > highestScore) {
        highestScore = score;
        topDocType = type;
        bestReason = reason;
      }
    });

    // 3. Check for Compliance Photos (if image file or has photo keywords)
    if (isImageFile) {
      // If filename clearly specifies a compliance document (e.g. CRE.jpg, Inspection.png), doc score wins if >= 75
      if (topDocType && highestScore >= 75) {
        candidates.push({
          id,
          file,
          bestTarget: topDocType,
          score: highestScore,
          reason: bestReason,
          isMedia: false,
        });
        return;
      }

      const hasPhotoKeyword = words.includes('photo') || words.includes('photos') || words.includes('pic') || words.includes('pics') || words.includes('image') || words.includes('batch');
      candidates.push({
        id,
        file,
        bestTarget: 'PHOTOS',
        score: hasPhotoKeyword ? 95 : 65,
        reason: hasPhotoKeyword ? 'Matched "Photos" keyword' : 'Image file assigned to Compliance Photos slot',
        isMedia: true,
      });
      return;
    }

    // 4. Non-image file (PDF / DOC) matched to a core compliance slot
    if (topDocType && highestScore >= 40) {
      candidates.push({
        id,
        file,
        bestTarget: topDocType,
        score: highestScore,
        reason: bestReason,
        isMedia: false,
      });
    } else {
      // Unrecognized file
      candidates.push({
        id,
        file,
        bestTarget: 'IGNORE',
        score: 0,
        reason: 'Filename does not match standard compliance keywords',
        isMedia: false,
      });
    }
  });

  // Second Pass: Resolve duplicate claims on single-slot compliance docs
  // (PHOTOS and VIDEOS are multi-file, but CRE, EC, etc. only hold 1 file each)
  const finalMatches: AutoMatchFile[] = [];

  // Sort candidates by score descending so highest confidence matches claim slots first
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

  for (const cand of sortedCandidates) {
    if (cand.bestTarget === 'PHOTOS' || cand.bestTarget === 'VIDEOS') {
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: cand.bestTarget,
        confidence: cand.score >= 80 ? 'high' : 'medium',
        matchReason: cand.reason,
        score: cand.score,
      });
      continue;
    }

    if (cand.bestTarget === 'IGNORE' || cand.score === 0) {
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: 'IGNORE',
        confidence: 'manual',
        matchReason: cand.reason,
        score: 0,
      });
      continue;
    }

    const docType = cand.bestTarget as DocType;
    if (!slotClaimed[docType]) {
      // Claim slot
      slotClaimed[docType] = { id: cand.id, score: cand.score };
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: docType,
        confidence: cand.score >= 80 ? 'high' : cand.score >= 50 ? 'medium' : 'manual',
        matchReason: cand.reason,
        score: cand.score,
      });
    } else {
      // Slot already claimed by a higher-scoring file -> flag for manual review
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: 'IGNORE',
        confidence: 'manual',
        matchReason: `Slot ${docType} already matched to another file; select a different slot or ignore`,
        score: cand.score,
      });
    }
  }

  // Restore original selection order for user readability
  const originalOrderMatches = candidates.map(c => finalMatches.find(m => m.id === c.id)!);

  const matchedDocCount = originalOrderMatches.filter(m => m.target !== 'IGNORE' && m.target !== 'PHOTOS' && m.target !== 'VIDEOS').length;
  const photoCount = originalOrderMatches.filter(m => m.target === 'PHOTOS').length;
  const videoCount = originalOrderMatches.filter(m => m.target === 'VIDEOS').length;
  const unmatchedCount = originalOrderMatches.filter(m => m.target === 'IGNORE').length;

  return {
    matches: originalOrderMatches,
    matchedDocCount,
    photoCount,
    videoCount,
    unmatchedCount,
    totalFiles: files.length,
  };
}

/**
 * Asynchronous Auto-Matcher with Deep PDF Content Inspection:
 * Reads inside digital PDFs when filenames are generic or unrenamed (e.g. scan001.pdf, doc.pdf),
 * and extracts VIN, RAW Workshop ID, and Model Report MRE # for Section 1 smart autofill.
 */
export async function autoMatchFilesWithContent(files: File[]): Promise<AutoMatchResult> {
  const candidates: Array<{
    id: string;
    file: File;
    bestTarget: AutoMatchTarget;
    score: number;
    reason: string;
    isMedia: boolean;
  }> = [];

  let extractedVin: string | undefined;
  let extractedRawId: string | undefined;
  let extractedMreNo: string | undefined;

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const id = `match_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();
    const baseName = lowerName.replace(/\.[^/.]+$/, '');
    const cleanText = baseName.replace(/[\s_\-\.\+\(\)\[\]]+/g, ' ');
    const words = cleanText.split(/\s+/).filter(Boolean);

    const isVideoFile = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName);
    const isImageFile = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(fileName);
    const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(fileName);

    // 1. Check for Videos
    if (isVideoFile || words.includes('video') || words.includes('videos') || words.includes('clip')) {
      candidates.push({
        id,
        file,
        bestTarget: 'VIDEOS',
        score: 100,
        reason: 'Detected video format or keyword (Inspection Video)',
        isMedia: true,
      });
      continue;
    }

    // 2. Score by filename first
    let topDocType: DocType | null = null;
    let highestScore = 0;
    let bestReason = '';

    CORE_DOC_SLOTS.forEach(({ type }) => {
      const { score, reason } = scoreDocSlot(baseName, words, type);
      if (score > highestScore) {
        highestScore = score;
        topDocType = type;
        bestReason = reason;
      }
    });

    // 3. Check for Compliance Photos
    if (isImageFile) {
      if (topDocType && highestScore >= 75) {
        candidates.push({
          id,
          file,
          bestTarget: topDocType,
          score: highestScore,
          reason: bestReason,
          isMedia: false,
        });
        continue;
      }

      const hasPhotoKeyword = words.includes('photo') || words.includes('photos') || words.includes('pic') || words.includes('pics') || words.includes('image') || words.includes('batch');
      candidates.push({
        id,
        file,
        bestTarget: 'PHOTOS',
        score: hasPhotoKeyword ? 95 : 65,
        reason: hasPhotoKeyword ? 'Matched "Photos" keyword' : 'Image file assigned to Compliance Photos slot',
        isMedia: true,
      });
      continue;
    }

    // 4. If it's a PDF file, perform Deep Content Inspection to extract text, VIN, RAW ID, MRE #
    if (isPdfFile) {
      try {
        const metadata = await extractPdfTextAndMetadata(file);
        if (metadata.vin && !extractedVin) extractedVin = metadata.vin;
        if (metadata.rawId && !extractedRawId) extractedRawId = metadata.rawId;
        if (metadata.mreNo && !extractedMreNo) extractedMreNo = metadata.mreNo;

        // If filename alone was inconclusive, use content-detected document type!
        if (metadata.detectedDocType && (!topDocType || highestScore < 75)) {
          topDocType = metadata.detectedDocType;
          highestScore = 98;
          bestReason = metadata.matchReason || `Identified from PDF content (${metadata.detectedDocType})`;
        }
      } catch (pdfErr) {
        console.warn('Deep PDF inspection skipped:', pdfErr);
      }
    }

    if (topDocType && highestScore >= 40) {
      candidates.push({
        id,
        file,
        bestTarget: topDocType,
        score: highestScore,
        reason: bestReason,
        isMedia: false,
      });
    } else {
      candidates.push({
        id,
        file,
        bestTarget: 'IGNORE',
        score: 0,
        reason: 'Filename and content do not match standard compliance keywords',
        isMedia: false,
      });
    }
  }

  // Second pass: resolve slot claims
  const slotClaimed: Partial<Record<DocType, { id: string; score: number }>> = {};
  const finalMatches: AutoMatchFile[] = [];
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

  for (const cand of sortedCandidates) {
    if (cand.bestTarget === 'PHOTOS' || cand.bestTarget === 'VIDEOS') {
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: cand.bestTarget,
        confidence: cand.score >= 80 ? 'high' : 'medium',
        matchReason: cand.reason,
        score: cand.score,
      });
      continue;
    }

    if (cand.bestTarget === 'IGNORE' || cand.score === 0) {
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: 'IGNORE',
        confidence: 'manual',
        matchReason: cand.reason,
        score: 0,
      });
      continue;
    }

    const docType = cand.bestTarget as DocType;
    if (!slotClaimed[docType]) {
      slotClaimed[docType] = { id: cand.id, score: cand.score };
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: docType,
        confidence: cand.score >= 80 ? 'high' : cand.score >= 50 ? 'medium' : 'manual',
        matchReason: cand.reason,
        score: cand.score,
      });
    } else {
      finalMatches.push({
        id: cand.id,
        file: cand.file,
        target: 'IGNORE',
        confidence: 'manual',
        matchReason: `Slot ${docType} already matched to another file; select a different slot or ignore`,
        score: cand.score,
      });
    }
  }

  const originalOrderMatches = candidates.map(c => finalMatches.find(m => m.id === c.id)!);
  const matchedDocCount = originalOrderMatches.filter(m => m.target !== 'IGNORE' && m.target !== 'PHOTOS' && m.target !== 'VIDEOS').length;
  const photoCount = originalOrderMatches.filter(m => m.target === 'PHOTOS').length;
  const videoCount = originalOrderMatches.filter(m => m.target === 'VIDEOS').length;
  const unmatchedCount = originalOrderMatches.filter(m => m.target === 'IGNORE').length;

  return {
    matches: originalOrderMatches,
    matchedDocCount,
    photoCount,
    videoCount,
    unmatchedCount,
    totalFiles: files.length,
    extractedVin,
    extractedRawId,
    extractedMreNo,
  };
}

