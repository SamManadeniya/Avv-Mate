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

/**
 * Extracts text from a PDF file using pdfjs-dist.
 * If the PDF has no text layer (scanned PDF), renders page 1 to canvas and runs Tesseract OCR.
 */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (status: string) => void
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
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      fullText += ' ' + pageStrings.join(' ');
    }

    const cleanText = fullText.replace(/\s+/g, ' ').trim();

    // If substantial digital text is present, return immediately
    if (cleanText.length >= 60) {
      return {
        text: cleanText,
        isScanned: false,
        pageCount,
        engineUsed: 'native_pdf',
        extractionTimeMs: Date.now() - startTime,
      };
    }

    // Sparse or empty text -> Scanned PDF. Fall back to OCR on Page 1
    onProgress?.('Scanned PDF detected. Rendering page for OCR...');
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

    await page1.render({ canvasContext: ctx, viewport } as any).promise;

    onProgress?.('Running OCR on scanned PDF page...');
    const worker = await getTesseractWorker(onProgress);
    const { data } = await worker.recognize(canvas);

    const ocrCombined = (cleanText + ' ' + (data?.text || '')).replace(/\s+/g, ' ').trim();

    return {
      text: ocrCombined,
      isScanned: true,
      pageCount,
      engineUsed: 'wasm_ocr',
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
