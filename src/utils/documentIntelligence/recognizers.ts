/**
 * Specialized Modular Document Recognizers
 * Identifies document category, extracts specialized metadata (VIN, RAW ID, MRE #, Make, Model),
 * and assigns a confidence score based on domain-specific rules.
 */

import type { DocType } from '../../types';
import { extractVinIntelligence } from './vinIntelligence';

export interface RecognitionResult {
  docType: DocType;
  confidence: number; // 0 - 100
  matchedKeywords: string[];
  reason: string;
  metadata: {
    vin?: string;
    rawId?: string;
    mreNo?: string;
    make?: string;
    model?: string;
    chassisNo?: string;
  };
}

export interface DocumentRecognizer {
  type: DocType;
  name: string;
  evaluate(text: string, fileName: string): RecognitionResult;
}

// 1. Export Certificate / Japanese Shaken Recognizer (EC)
export const exportCertificateRecognizer: DocumentRecognizer = {
  type: 'EC',
  name: 'Export Certificate',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    // Japanese official keywords (Kanji & Romaji)
    const jpTerms = [
      '輸出抹消仮登録証明書', '登録識別情報等通知書', '自動車検査証', '抹消登録',
      'yushutsu', 'shoumeisho', 'shaken', 'masshou', 'toroku',
      'japan automobile', 'ministry of land', 'chassis number',
      'certificate of export', 'export certificate', 'deregistration',
      'export cert', 'exp cert', 'auction sheet', '車台番号', '原動機型式',
      '初度登録年月', '乗車定員', '車両総重量'
    ];

    jpTerms.forEach(term => {
      if (lower.includes(term)) {
        matched.push(term);
        score += 25;
      }
    });

    if (fLower.includes('export') || fLower.includes('ec') || fLower.includes('shaken') || fLower.includes('dereg')) {
      matched.push(`filename:${fileName}`);
      score += 30;
    }

    // Look for chassis number typical of Japanese vehicles (e.g. ZRR85-0029733)
    const chassisMatch = text.match(/\b([A-Z0-9]{2,6}[-_][0-9]{5,8})\b/i);
    if (chassisMatch) {
      matched.push(`chassis:${chassisMatch[1]}`);
      score += 25;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'EC',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Export Certificate terms: ${matched.slice(0, 3).join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        chassisNo: chassisMatch ? chassisMatch[1].toUpperCase() : vinRes.chassisNo,
      },
    };
  },
};

// 2. Concessional RAV Entry Approval (CRE)
export const concessionalRavEntryRecognizer: DocumentRecognizer = {
  type: 'CRE',
  name: 'Concessional RAV Entry Approval',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('concessional rav entry approval') || lower.includes('concessional rav entry')) {
      matched.push('Concessional RAV Entry Approval');
      score += 60;
    }
    if (lower.includes('road vehicle standards rules 2019') || lower.includes('section 35')) {
      matched.push('RVSA Section 35');
      score += 25;
    }
    if (lower.includes('approval number') && /CRE[-_\s]*\d{4,8}/i.test(text)) {
      matched.push('CRE-Approval Number');
      score += 30;
    }
    if (fLower.includes('cre') || fLower.includes('concessional')) {
      matched.push(`filename:${fileName}`);
      score += 20;
    }

    // Extract VIN & Vehicle Details from CRE table
    const vinRes = extractVinIntelligence(text);

    let make: string | undefined;
    let model: string | undefined;
    const makeMatch = text.match(/\bMake[^A-Za-z0-9]+([A-Za-z0-9\-\s]{2,30}?)(?=\s*(?:\d+\s+)?\bModel\b|\r?\n|$)/i);
    if (makeMatch && !/^(details|number|rav|model)/i.test(makeMatch[1])) {
      make = makeMatch[1].trim();
    }
    const modelMatch = text.match(/\bModel[^A-Za-z0-9]+([A-Za-z0-9\-\s]{2,40}?)(?=\s*(?:\d+\s+)?\b(?:Variant|VIN|Vehicle|Chassis|Approval)\b|\r?\n|$)/i);
    if (modelMatch && !/^(report|number|details|instruction|version)/i.test(modelMatch[1])) {
      model = modelMatch[1].trim();
    }

    return {
      docType: 'CRE',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched CRE approval headers: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        make,
        model,
        chassisNo: vinRes.chassisNo,
      },
    };
  },
};

// 3. Damage or Corrosion (DC)
export const damageCorrosionRecognizer: DocumentRecognizer = {
  type: 'DC',
  name: 'Damage or Corrosion Assessment',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('damage or corrosion') || lower.includes('damage and corrosion') || lower.includes('damage & corrosion')) {
      matched.push('Damage or Corrosion');
      score += 65;
    }
    if (lower.includes('corrosion check') || lower.includes('damage assessment') || lower.includes('structural damage')) {
      matched.push('Damage Assessment / Corrosion Check');
      score += 35;
    }
    if (lower.includes('rust inspection') || lower.includes('corrosion report')) {
      matched.push('Corrosion Report');
      score += 30;
    }
    if (fLower.includes('dc') || fLower.includes('damage') || fLower.includes('corrosion')) {
      matched.push(`filename:${fileName}`);
      score += 25;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'DC',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Damage / Corrosion inspection terms: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
      },
    };
  },
};

// 4. RAW Declaration (RAW_DECLA)
export const rawDeclarationRecognizer: DocumentRecognizer = {
  type: 'RAW_DECLA',
  name: 'RAW Declaration',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('registered automotive workshop') && lower.includes('declaration')) {
      matched.push('Registered Automotive Workshop Declaration');
      score += 65;
    }
    if (lower.includes('paragraph 65(2)(a)') || lower.includes('road vehicle standards rules 2019')) {
      matched.push('Paragraph 65(2)(a)');
      score += 25;
    }
    if (/RAW[:\-_\s]*\d{3,6}/i.test(text)) {
      matched.push('RAW Approval Number');
      score += 25;
    }
    if (fLower.includes('raw') && (fLower.includes('decl') || fLower.includes('declaration'))) {
      matched.push(`filename:${fileName}`);
      score += 25;
    }

    // Extract RAW ID
    let rawId: string | undefined;
    const rawMatch = text.match(/\bRAW[:\-_\s]*(\d{3,6})\b/i);
    if (rawMatch) {
      rawId = `RAW-${rawMatch[1].replace(/[^0-9]/g, '').padStart(6, '0')}`;
    }

    // Extract Model Report MRE #
    let mreNo: string | undefined;
    const mreMatches = Array.from(text.matchAll(/\bM\s*R\s*E\s*[:\-_\s]*([0-9\s]{2,12})\b/gi));
    for (const m of mreMatches) {
      const numPart = m[1].replace(/[^0-9]/g, '');
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > 0) {
        mreNo = `MRE-${numPart.padStart(6, '0')}`;
        break;
      }
    }

    if (!mreNo) {
      const tableMreMatches = Array.from(text.matchAll(/(?:Approved\s+Model\s+Report(?:\s+number)?|Model\s+Report(?:\s+number)?)[^A-Za-z0-9\n]{0,35}(?:M\s*R\s*E[:\-_\s]*)?([0-9\s]{2,12})\b/gi));
      for (const match of tableMreMatches) {
        const numPart = match[1].replace(/[^0-9]/g, '');
        const num = parseInt(numPart, 10);
        if (!isNaN(num) && num > 0) {
          mreNo = `MRE-${numPart.padStart(6, '0')}`;
          break;
        }
      }
    }

    // Extract Make & Model
    let make: string | undefined;
    let model: string | undefined;
    const makeMatch = text.match(/\bMake[^A-Za-z0-9]+([A-Za-z0-9\-\s]{2,30}?)(?=\s*(?:\d+\s+)?\bModel\b|\r?\n|$)/i);
    if (makeMatch && !/^(details|number|rav|model)/i.test(makeMatch[1])) {
      make = makeMatch[1].trim();
    }
    const modelMatch = text.match(/\bModel[^A-Za-z0-9]+([A-Za-z0-9\-\s]{2,40}?)(?=\s*(?:\d+\s+)?\b(?:Variant|VIN|Vehicle|MODEL REPORT|version)\b|\r?\n|$)/i);
    if (modelMatch && !/^(report|number|details|instruction|version)/i.test(modelMatch[1])) {
      model = modelMatch[1].trim();
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'RAW_DECLA',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched RAW Declaration form: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        rawId,
        mreNo,
        make,
        model,
      },
    };
  },
};

// 5. Work Instructions (WI)
export const workInstructionsRecognizer: DocumentRecognizer = {
  type: 'WI',
  name: 'Work Instructions',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('model report work instructions') || lower.includes('work instructions')) {
      matched.push('Work Instructions');
      score += 65;
    }
    if (/CPT[-_\s]*[A-Z0-9]{4,10}/i.test(text)) {
      matched.push('CPT Document Identifier');
      score += 30;
    }
    if (fLower.includes('wi') || fLower.includes('instruction')) {
      matched.push(`filename:${fileName}`);
      score += 20;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'WI',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Work Instructions: ${matched.join(', ')}` : '',
      metadata: { vin: vinRes.vin },
    };
  },
};

// 6. Vehicle Inspection (VI)
export const vehicleInspectionRecognizer: DocumentRecognizer = {
  type: 'VI',
  name: 'Vehicle Inspection Checklist',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('vehicle inspection') || lower.includes('inspection checklist') || lower.includes('physical inspection')) {
      matched.push('Vehicle Inspection Checklist');
      score += 65;
    }
    if (lower.includes('hoist inspection') || lower.includes('brake test') || lower.includes('underbody check')) {
      matched.push('Inspection Test Items');
      score += 25;
    }
    if (fLower.includes('vi') || fLower.includes('inspection')) {
      matched.push(`filename:${fileName}`);
      score += 20;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'VI',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Vehicle Inspection: ${matched.join(', ')}` : '',
      metadata: { vin: vinRes.vin },
    };
  },
};

// 7. Recall Clearance (RECALL)
export const recallClearanceRecognizer: DocumentRecognizer = {
  type: 'RECALL',
  name: 'Recall Clearance',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('recall clearance') || lower.includes('recall check') || lower.includes('recall status')) {
      matched.push('Recall Clearance');
      score += 65;
    }
    if (lower.includes('outstanding safety recall') || lower.includes('campaign check') || lower.includes('no safety recalls')) {
      matched.push('Safety Recall Check');
      score += 35;
    }
    if (fLower.includes('recall')) {
      matched.push(`filename:${fileName}`);
      score += 25;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'RECALL',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Recall Clearance: ${matched.join(', ')}` : '',
      metadata: { vin: vinRes.vin },
    };
  },
};

// 8. Consumer Information Notice (CIN)
export const consumerInformationNoticeRecognizer: DocumentRecognizer = {
  type: 'CIN',
  name: 'Consumer Information Notice',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (lower.includes('consumer information notice') || lower.includes('consumer notice') || lower.includes('import notice')) {
      matched.push('Consumer Information Notice');
      score += 65;
    }
    if (fLower.includes('cin') || fLower.includes('import_notice') || fLower.includes('consumer')) {
      matched.push(`filename:${fileName}`);
      score += 25;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'CIN',
      confidence: Math.min(100, score),
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Import Notice: ${matched.join(', ')}` : '',
      metadata: { vin: vinRes.vin },
    };
  },
};

export const ALL_RECOGNIZERS: DocumentRecognizer[] = [
  exportCertificateRecognizer,
  concessionalRavEntryRecognizer,
  damageCorrosionRecognizer,
  rawDeclarationRecognizer,
  workInstructionsRecognizer,
  vehicleInspectionRecognizer,
  recallClearanceRecognizer,
  consumerInformationNoticeRecognizer,
];
