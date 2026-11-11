/**
 * Dual OCR & Text Extraction Engine
 * 1. Fast Path: Native PDF stream & text layer extraction via pdfjs-dist (< 50ms)
 * 2. Scanned Path: Page rasterization to Canvas + Tesseract.js WebAssembly OCR
 * 3. Image Path: Direct WebAssembly OCR on photographed/scanned .jpg/.png documents
 */

import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
// @ts-ignore - Vite asset URL import for bundled local worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure pdfjs worker to use local bundled asset with CDN fallback
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

let tesseractWorkerPromise: Promise<any> | null = null;

async function getTesseractWorker(onProgress?: (msg: string) => void) {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      onProgress?.('Initializing OCR engine (WebAssembly)...');
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

export interface ExtractedContentResult {
  text: string;
  isScanned: boolean;
  pageCount: number;
  engineUsed: 'native_pdf' | 'wasm_ocr' | 'hybrid';
  extractionTimeMs: number;
}

interface SpatialToken {
  str: string;
  x: number;
  y: number;
}

/**
 * Reconstructs visual reading order (top-to-bottom rows, left-to-right columns)
 * combining native text items and AcroForm/FreeText annotations so overlaid blue form
 * fields and multi-column PDF tables remain adjacent to their labels.
 */
async function extractPageVisualText(page: any): Promise<string> {
  const tokens: SpatialToken[] = [];
  const rawFallback: string[] = [];

  try {
    const textContent = await page.getTextContent();
    for (const item of textContent?.items || []) {
      if (!item || typeof item.str !== 'string') continue;
      const trimmed = item.str.trim();
      if (!trimmed) continue;
      rawFallback.push(trimmed);
      if (Array.isArray(item.transform) && item.transform.length >= 6) {
        tokens.push({ str: trimmed, x: item.transform[4], y: item.transform[5] });
      }
    }
  } catch (_) {}

  const namedFieldHints: string[] = [];
  try {
    const annotations = await page.getAnnotations();
    for (const annot of annotations || []) {
      if (!annot) continue;
      const rawVal = annot.fieldValue ?? annot.contentsObj?.str ?? annot.contents ?? '';
      const valStr = Array.isArray(rawVal) ? rawVal.join(' ').trim() : String(rawVal || '').trim();
      if (!valStr || valStr === 'Off') continue;

      if (Array.isArray(annot.rect) && annot.rect.length === 4) {
        const ax = Number(annot.rect[0]) || 0;
        const ay = ((Number(annot.rect[1]) || 0) + (Number(annot.rect[3]) || 0)) / 2;
        const alreadyPresentNearby = tokens.some(
          t => t.str === valStr && Math.abs(t.y - ay) <= 12 && Math.abs(t.x - ax) <= 25
        );
        if (!alreadyPresentNearby) {
          tokens.push({ str: valStr, x: ax, y: ay });
        }
      } else {
        rawFallback.push(valStr);
      }

      if (annot.fieldName && typeof annot.fieldName === 'string') {
        const readableName = annot.fieldName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
        if (/(build|date|manufacture|vin|chassis|raw|mre|cre|make|model)/i.test(readableName)) {
          namedFieldHints.push(`${readableName}: ${valStr}`);
        }
      }
    }
  } catch (_) {}

  if (tokens.length === 0) {
    return [...rawFallback, ...namedFieldHints].join(' ');
  }

  tokens.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Array<{ y: number; items: SpatialToken[] }> = [];
  for (const t of tokens) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow.y - t.y) <= 8) {
      lastRow.items.push(t);
    } else {
      rows.push({ y: t.y, items: [t] });
    }
  }

  const orderedLines = rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    return row.items.map(i => i.str).join(' ');
  });

  if (namedFieldHints.length > 0) {
    orderedLines.push(namedFieldHints.join(' '));
  }
  return orderedLines.join(' ');
}

/**
 * Extracts text from a PDF file using pdfjs-dist (including AcroForm annotations and spatial layout order).
 * If the PDF has no text layer (scanned PDF) or forceOcr is requested, renders page 1 and runs Tesseract OCR.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (status: string) => void,
  forceOcr = false
): Promise<ExtractedContentResult> {
  const startTime = Date.now();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;

    let fullText = '';
    const maxPagesToRead = Math.min(pageCount, 3); // Inspect up to first 3 pages

    for (let p = 1; p <= maxPagesToRead; p++) {
      onProgress?.(`Reading PDF page ${p} of ${pageCount}...`);
      const page = await pdfDoc.getPage(p);
      const pageText = await extractPageVisualText(page);
      fullText += ' ' + pageText;
    }

    // Read document-level AcroForm field values as an extra safeguard
    try {
      const fieldObjects = await (pdfDoc as any).getFieldObjects?.();
      if (fieldObjects && typeof fieldObjects === 'object') {
        const extraFields: string[] = [];
        for (const [name, list] of Object.entries<any>(fieldObjects)) {
          if (!Array.isArray(list)) continue;
          for (const entry of list) {
            const val = Array.isArray(entry?.value) ? entry.value.join(' ').trim() : String(entry?.value || '').trim();
            if (val && val !== 'Off' && !fullText.includes(val)) {
              const readable = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
              extraFields.push(`${readable}: ${val}`);
            }
          }
        }
        if (extraFields.length > 0) {
          fullText += ' ' + extraFields.join(' ');
        }
      }
    } catch (_) {}

    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    const hasAnyComplianceWord = /concessional|approval|rules|workshop|declaration|export|certificate|shaken|damage|corrosion|inspection|checklist|instruction|consumer|import|recall|vin|chassis|rav/i.test(cleanText);

    // If substantial digital text with compliance content is present (and OCR fallback wasn't explicitly requested), return immediately
    if (!forceOcr && cleanText.length >= 120 && hasAnyComplianceWord) {
      return {
        text: cleanText,
        isScanned: false,
        pageCount,
        engineUsed: 'native_pdf',
        extractionTimeMs: Date.now() - startTime,
      };
    }

    // Sparse/empty text OR forced OCR fallback for vector-outlined/stamped PDFs -> Render Page 1 & OCR
    onProgress?.(forceOcr ? 'Running visual OCR scan on document fields...' : 'Scanned PDF detected. Rendering page for OCR...');
    const page1 = await pdfDoc.getPage(1);
    const viewport = page1.getViewport({ scale: 1.8 }); // ~150-180 DPI for crisp OCR

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return {
        text: cleanText,
        isScanned: true,
        pageCount,
        engineUsed: 'native_pdf',
        extractionTimeMs: Date.now() - startTime,
      };
    }

    const annotationMode = (pdfjsLib as any).AnnotationMode?.ENABLE_FORMS ?? 2;
    await page1.render({ canvasContext: ctx, viewport, annotationMode } as any).promise;

    onProgress?.('Running OCR on PDF page...');
    const worker = await getTesseractWorker(onProgress);
    const { data } = await worker.recognize(canvas);

    const ocrCombined = (cleanText + ' ' + (data?.text || '')).replace(/\s+/g, ' ').trim();

    return {
      text: ocrCombined,
      isScanned: true,
      pageCount,
      engineUsed: cleanText.length >= 120 ? 'hybrid' : 'wasm_ocr',
      extractionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn('PDF extraction notice:', err);
    return {
      text: '',
      isScanned: false,
      pageCount: 1,
      engineUsed: 'native_pdf',
      extractionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Extracts text from an Image file (photographed/scanned .jpg, .png) using Tesseract.js WebAssembly
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (status: string) => void
): Promise<ExtractedContentResult> {
  const startTime = Date.now();
  try {
    onProgress?.(`Running OCR on image document (${file.name})...`);
    const worker = await getTesseractWorker(onProgress);
    const { data } = await worker.recognize(file);
    const text = (data?.text || '').replace(/\s+/g, ' ').trim();

    return {
      text,
      isScanned: true,
      pageCount: 1,
      engineUsed: 'wasm_ocr',
      extractionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn('Image OCR notice:', err);
    return {
      text: '',
      isScanned: true,
      pageCount: 1,
      engineUsed: 'wasm_ocr',
      extractionTimeMs: Date.now() - startTime,
    };
  }
}
