import type { DocType } from '../types';
import { processFileIntelligently } from './documentIntelligence';

export interface ExtractedPdfMetadata {
  rawText: string;
  vin?: string;
  rawId?: string;
  mreNo?: string;
  make?: string;
  model?: string;
  viaNo?: string;
  uniqueId?: string;
  buildDate?: string;
  detectedDocType?: DocType;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchReason?: string;
}

/**
 * Reads binary streams, native text layers, or performs WebAssembly OCR on scanned PDFs and images.
 * Powered by the client-side Document Intelligence pipeline.
 */
export async function extractPdfTextAndMetadata(file: File): Promise<ExtractedPdfMetadata> {
  try {
    const result = await processFileIntelligently(file);
    const docType = result.target !== 'IGNORE' && result.target !== 'PHOTOS' && result.target !== 'VIDEOS'
      ? (result.target as DocType)
      : undefined;

    return {
      rawText: (result.extractedText || '').slice(0, 5000),
      vin: result.metadata.vin,
      rawId: result.metadata.rawId,
      mreNo: result.metadata.mreNo,
      make: result.metadata.make,
      model: result.metadata.model,
      viaNo: result.metadata.viaNo,
      uniqueId: result.metadata.uniqueId,
      buildDate: result.metadata.buildDate,
      detectedDocType: docType,
      confidence: result.confidence === 'manual' ? 'low' : result.confidence,
      matchReason: result.reason,
    };
  } catch (err) {
    console.warn('Document intelligence extraction error:', err);
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
