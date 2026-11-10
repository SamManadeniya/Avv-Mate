/**
 * Intelligent Document Intelligence Pipeline
 * Main Entry Point for Classifying, Inspecting, Extracting, and Renaming compliance files
 */

import type { DocType } from '../../types';
import { detectFileSignature, type FileSignatureResult } from './fileSignature';
import { analyzeImageVisualType, type VisualClassificationResult } from './visualClassifier';
import { extractTextFromPdf, extractTextFromImage, type ExtractedContentResult } from './ocrEngine';
import { ALL_RECOGNIZERS, type RecognitionResult } from './recognizers';
import { extractVinIntelligence, type VinExtractionResult } from './vinIntelligence';

export type IntelligentTarget = DocType | 'PHOTOS' | 'VIDEOS' | 'IGNORE';

export interface IntelligentFileResult {
  file: File;
  target: IntelligentTarget;
  confidence: 'high' | 'medium' | 'low' | 'manual';
  confidenceScore: number; // 0 - 100
  reason: string;
  signature: FileSignatureResult;
  visual?: VisualClassificationResult;
  extractedText: string;
  isScanned: boolean;
  metadata: {
    vin?: string;
    rawId?: string;
    mreNo?: string;
    make?: string;
    model?: string;
    chassisNo?: string;
  };
}

export interface BatchProcessingResult {
  results: IntelligentFileResult[];
  extractedVin?: string;
  extractedRawId?: string;
  extractedMreNo?: string;
  extractedMake?: string;
  extractedModel?: string;
  matchedDocCount: number;
  photoCount: number;
  videoCount: number;
  unmatchedCount: number;
  vinConflict?: {
    hasConflict: boolean;
    detectedVins: Array<{ vin: string; fileName: string; docType?: string; chassisNo?: string }>;
    warningMessage?: string;
  };
}

/**
 * Processes a single raw customer file through the intelligence pipeline
 */
export async function processFileIntelligently(
  file: File,
  onProgress?: (msg: string) => void
): Promise<IntelligentFileResult> {
  // Step 1: Detect True File Signature
  const signature = await detectFileSignature(file);

  // Step 2: Handle Videos immediately (MIME or format)
  if (signature.isVideo) {
    return {
      file,
      target: 'VIDEOS',
      confidence: 'high',
      confidenceScore: 100,
      reason: `Detected video media format (${signature.format})`,
      signature,
      extractedText: '',
      isScanned: false,
      metadata: {},
    };
  }

  // Step 3: Handle Images (Distinguish Vehicle Photograph vs Document)
  if (signature.isImage) {
    const hasExplicitDocName = /export|shaken|concessional|rav[-_]?entry|damage|corrosion|raw[-_]?decla|declaration|inspection|recall|import[-_]?notice|cin\b|cpt\b/i.test(file.name);
    const visual = await analyzeImageVisualType(file);

    // If it's a vehicle photograph (natural landscape photo, scenic background) AND has no explicit compliance doc name
    if (visual.isLikelyVehicle && !hasExplicitDocName) {
      return {
        file,
        target: 'PHOTOS',
        confidence: visual.confidence >= 75 ? 'high' : 'medium',
        confidenceScore: visual.confidence,
        reason: visual.reason,
        signature,
        visual,
        extractedText: '',
        isScanned: false,
        metadata: {},
      };
    }

    // It's a photographed or scanned document! Run WebAssembly OCR
    onProgress?.(`Extracting text from photographed document (${file.name})...`);
    const ocrResult = await extractTextFromImage(file, onProgress);

    // Evaluate against document recognizers
    let bestRecognition: RecognitionResult | null = null;
    let highestScore = 0;

    for (const rec of ALL_RECOGNIZERS) {
      const res = rec.evaluate(ocrResult.text, file.name);
      if (res.confidence > highestScore) {
        highestScore = res.confidence;
        bestRecognition = res;
      }
    }

    if (bestRecognition && highestScore >= 40) {
      return {
        file,
        target: bestRecognition.docType,
        confidence: highestScore >= 75 ? 'high' : 'medium',
        confidenceScore: highestScore,
        reason: bestRecognition.reason || `Identified document from image text (${bestRecognition.docType})`,
        signature,
        visual,
        extractedText: ocrResult.text,
        isScanned: true,
        metadata: bestRecognition.metadata,
      };
    }

    // Fallback: document image but slot inconclusive
    return {
      file,
      target: 'EC', // Default candidate for scanned single paper in vehicle compliance
      confidence: 'manual',
      confidenceScore: 45,
      reason: `Photographed document detected (Review slot: Export Certificate or Damage Report)`,
      signature,
      visual,
      extractedText: ocrResult.text,
      isScanned: true,
      metadata: {},
    };
  }

  // Step 4: Handle PDFs (Fast Native Extraction + OCR Fallback for Scanned PDFs)
  if (signature.isPdf) {
    const contentResult: ExtractedContentResult = await extractTextFromPdf(file, onProgress);

    let bestRecognition: RecognitionResult | null = null;
    let highestScore = 0;

    for (const rec of ALL_RECOGNIZERS) {
      const res = rec.evaluate(contentResult.text, file.name);
      if (res.confidence > highestScore) {
        highestScore = res.confidence;
        bestRecognition = res;
      }
    }

    const vinRes: VinExtractionResult = extractVinIntelligence(contentResult.text);

    if (bestRecognition && highestScore >= 35) {
      return {
        file,
        target: bestRecognition.docType,
        confidence: highestScore >= 70 ? 'high' : 'medium',
        confidenceScore: highestScore,
        reason: bestRecognition.reason || `Identified from PDF content (${bestRecognition.docType})`,
        signature,
        extractedText: contentResult.text,
        isScanned: contentResult.isScanned,
        metadata: {
          ...bestRecognition.metadata,
          vin: bestRecognition.metadata.vin || vinRes.vin,
          chassisNo: bestRecognition.metadata.chassisNo || vinRes.chassisNo,
        },
      };
    }

    return {
      file,
      target: 'IGNORE',
      confidence: 'manual',
      confidenceScore: 0,
      reason: 'PDF content does not match compliance keywords (Review slot manually)',
      signature,
      extractedText: contentResult.text,
      isScanned: contentResult.isScanned,
      metadata: { vin: vinRes.vin },
    };
  }

  // Unsupported or generic file
  return {
    file,
    target: 'IGNORE',
    confidence: 'manual',
    confidenceScore: 0,
    reason: `Unsupported file format (${signature.format})`,
    signature,
    extractedText: '',
    isScanned: false,
    metadata: {},
  };
}

/**
 * Processes an entire batch of raw files with cross-document intelligence and slot collision resolution
 */
export async function processBatchIntelligently(
  files: File[],
  onProgress?: (current: number, total: number, msg: string) => void
): Promise<BatchProcessingResult> {
  const fileResults: IntelligentFileResult[] = [];

  let batchVin: string | undefined;
  let batchRawId: string | undefined;
  let batchMreNo: string | undefined;
  let batchMake: string | undefined;
  let batchModel: string | undefined;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, `Analyzing file ${i + 1} of ${files.length}: ${file.name}`);
    
    const result = await processFileIntelligently(file, msg => {
      onProgress?.(i + 1, files.length, `${file.name}: ${msg}`);
    });

    // Cross-pollinate Section 1 metadata across documents
    if (result.metadata.vin && !batchVin) batchVin = result.metadata.vin;
    if (result.metadata.rawId && !batchRawId) batchRawId = result.metadata.rawId;
    if (result.metadata.mreNo && !batchMreNo) batchMreNo = result.metadata.mreNo;
    if (result.metadata.make && !batchMake) batchMake = result.metadata.make;
    if (result.metadata.model && !batchModel) batchModel = result.metadata.model;

    fileResults.push(result);
  }

  // Second pass: resolve slot claims (prevent two files taking the same slot)
  const slotClaimed: Partial<Record<DocType, { fileIdx: number; score: number }>> = {};
  const finalResults: IntelligentFileResult[] = [...fileResults];

  // Sort by score descending to grant slots to highest-confidence files first
  const sortedIndices = fileResults
    .map((res, idx) => ({ idx, score: res.confidenceScore, target: res.target }))
    .sort((a, b) => b.score - a.score);

  for (const item of sortedIndices) {
    const res = finalResults[item.idx];
    if (res.target === 'PHOTOS' || res.target === 'VIDEOS' || res.target === 'IGNORE') {
      continue;
    }

    const docType = res.target as DocType;
    if (!slotClaimed[docType]) {
      slotClaimed[docType] = { fileIdx: item.idx, score: res.confidenceScore };
    } else {
      // Slot collision: flag second file for manual review
      finalResults[item.idx] = {
        ...res,
        target: 'IGNORE',
        confidence: 'manual',
        reason: `Slot ${docType} already claimed by another file; please select a slot or ignore`,
      };
    }
  }

  // Cross-document VIN intelligence & Conflict Detection
  const detectedVins: Array<{ vin: string; fileName: string; docType?: string; chassisNo?: string }> = [];
  const vinScore: Record<string, number> = {};

  for (const res of fileResults) {
    if (res.metadata.vin) {
      const v = res.metadata.vin.toUpperCase();
      detectedVins.push({
        vin: v,
        fileName: res.file.name,
        docType: res.target !== 'IGNORE' ? res.target : undefined,
        chassisNo: res.metadata.chassisNo,
      });
      vinScore[v] = (vinScore[v] || 0) + 1;
    }
  }

  // Cross-reference detected chassis numbers from Export Certs, Checklists, etc.
  const allChassis = fileResults
    .map(r => r.metadata.chassisNo?.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter((c): c is string => typeof c === 'string' && c.length >= 5);

  const uniqueVins = Object.keys(vinScore);
  for (const v of uniqueVins) {
    const vClean = v.replace(/[^A-Z0-9]/g, '');
    for (const ch of allChassis) {
      if (vClean.includes(ch)) {
        vinScore[v] = (vinScore[v] || 0) + 1;
      }
    }
  }

  let vinConflict: BatchProcessingResult['vinConflict'] = undefined;

  if (uniqueVins.length > 1) {
    // Sort VINs by total consensus score descending (majority + chassis reinforcement)
    const sortedVins = [...uniqueVins].sort((a, b) => vinScore[b] - vinScore[a]);
    batchVin = sortedVins[0];

    const conflictSummary = uniqueVins.map(v => {
      const filesWithV = detectedVins.filter(d => d.vin === v).map(d => `${d.fileName}${d.docType ? ` (${d.docType})` : ''}`).join(', ');
      return `VIN ${v} in [${filesWithV}]`;
    }).join(' vs ');

    vinConflict = {
      hasConflict: true,
      detectedVins,
      warningMessage: `⚠️ Mixed Vehicle Warning: Uploaded batch contains multiple different VINs: ${conflictSummary}. Please check that you selected files for the same car.`,
    };
  } else if (uniqueVins.length === 1) {
    batchVin = uniqueVins[0];
  }

  const matchedDocCount = finalResults.filter(r => r.target !== 'IGNORE' && r.target !== 'PHOTOS' && r.target !== 'VIDEOS').length;
  const photoCount = finalResults.filter(r => r.target === 'PHOTOS').length;
  const videoCount = finalResults.filter(r => r.target === 'VIDEOS').length;
  const unmatchedCount = finalResults.filter(r => r.target === 'IGNORE').length;

  return {
    results: finalResults,
    extractedVin: batchVin,
    extractedRawId: batchRawId,
    extractedMreNo: batchMreNo,
    extractedMake: batchMake,
    extractedModel: batchModel,
    matchedDocCount,
    photoCount,
    videoCount,
    unmatchedCount,
    vinConflict,
  };
}

