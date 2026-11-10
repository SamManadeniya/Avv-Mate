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
    viaNo?: string;
    uniqueId?: string;
    buildDate?: string;
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

    // Disqualify if this file is clearly another document type that merely references the export cert
    const isDisqualified =
      /^vc|^vi|verification|checklist|^wi|instruction|^dr|^dc|damage|cin|recall/i.test(fileName) ||
      lower.includes('avv verification checklist') ||
      lower.includes('model report work instructions');

    if (!isDisqualified) {
      // Strong explicit filename match: export, shaken, dereg, or chassis number + cert (e.g. RP5-1098130 CERT.pdf)
      if (fLower.includes('export') || fLower.includes('shaken') || fLower.includes('dereg') || /\b_?ec_?\b/i.test(fileName)) {
        matched.push(`filename:${fileName}`);
        score += 80;
      } else if (/\bcert\b|\bcertificate\b/i.test(fileName)) {
        matched.push(`filename:${fileName}`);
        score += 70;
        if (/\b[a-z0-9]{2,6}[-_][0-9]{5,8}\b/i.test(fileName)) score += 30; // Chassis in filename!
      }

      // Official Japanese government export/shaken registration terms (Kanji)
      const officialJpTerms = [
        '輸出抹消仮登録証明書', '登録識別情報等通知書', '自動車検査証', '抹消登録',
        'yushutsu', 'shoumeisho', 'shaken', 'masshou', 'toroku',
        'japan automobile', 'ministry of land', 'certificate of export', 'export certificate',
        'deregistration', '車台番号', '原動機型式', '初度登録年月', '乗車定員', '車両総重量'
      ];

      officialJpTerms.forEach(term => {
        if (lower.includes(term.toLowerCase())) {
          matched.push(term);
          score += 40;
        }
      });

      // Look for chassis number typical of Japanese vehicles (e.g. ZRR85-0029733)
      const chassisMatch = text.match(/\b([A-Z0-9]{2,6}[-_][0-9]{5,8})\b/i);
      if (chassisMatch) {
        matched.push(`chassis:${chassisMatch[1]}`);
        score += 20;
      }
    }

    const vinRes = extractVinIntelligence(text);

    // Extract Build Date (First Registration Date / 初度登録年月) from Export Certificate
    let buildDate: string | undefined;
    const jpEraMatch = text.match(/(?:初度登録年月|初度登録)[^\d令和平成\n]{0,25}(令和|平成)\s*([0-9元]{1,2})\s*年\s*([0-9]{1,2})\s*月/i);
    if (jpEraMatch) {
      const era = jpEraMatch[1];
      const eraYearRaw = jpEraMatch[2] === '元' ? 1 : parseInt(jpEraMatch[2], 10);
      const month = parseInt(jpEraMatch[3], 10);
      const fullYear = era === '令和' ? 2018 + eraYearRaw : 1988 + eraYearRaw;
      if (!isNaN(fullYear) && !isNaN(month)) {
        buildDate = `${String(month).padStart(2, '0')}/${fullYear}`;
      }
    } else {
      const ymMatch = text.match(/(?:初度登録年月|初度登録)[^A-Za-z0-9]{0,35}(\d{4})\s*[年\/\-]\s*(\d{1,2})/i);
      if (ymMatch) {
        buildDate = `${ymMatch[2].padStart(2, '0')}/${ymMatch[1]}`;
      } else {
        const ymRevMatch = text.match(/(?:初度登録年月|初度登録)[^A-Za-z0-9]{0,35}(\d{1,2})\s*[年\/\-]\s*(\d{4})/i);
        if (ymRevMatch) {
          buildDate = `${ymRevMatch[1].padStart(2, '0')}/${ymRevMatch[2]}`;
        }
      }
    }

    return {
      docType: 'EC',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Export Certificate: ${matched.slice(0, 3).join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        chassisNo: vinRes.chassisNo,
        buildDate,
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

    // Disqualify if it's a RAW Declaration that merely lists the CRE number in Section 4
    const isDisqualified =
      fLower.includes('raw') ||
      fLower.includes('declaration') ||
      lower.includes('registered automotive workshop (raw) declaration') ||
      lower.includes('checks conducted by the raw');

    if (!isDisqualified) {
      if (fLower.includes('cre') || fLower.includes('concessional') || fLower.includes('approval notice') || fLower.includes('rav entry')) {
        matched.push(`filename:${fileName}`);
        score += 80;
      }
      if (lower.includes('concessional rav entry approval') || lower.includes('concessional rav entry')) {
        matched.push('Concessional RAV Entry Approval');
        score += 80;
      }
      if (lower.includes('road vehicle standards rules 2019') && lower.includes('section 35')) {
        matched.push('RVSA Section 35');
        score += 40;
      }
      if (/CRE[-_\s]*\d{4,8}/i.test(text)) {
        matched.push('CRE-Approval Number');
        score += 30;
      }
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

    // Extract VIA # (CRE Approval Number)
    let viaNo: string | undefined;
    const creMatch = text.match(/\b(CRE[-_\s]*\d{4,8})\b/i);
    if (creMatch) {
      viaNo = creMatch[1].toUpperCase().replace(/\s+/g, '-');
    }

    return {
      docType: 'CRE',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched CRE approval: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        make,
        model,
        chassisNo: vinRes.chassisNo,
        viaNo,
      },
    };
  },
};

// 3. RAW Declaration (RAW_DECLA)
export const rawDeclarationRecognizer: DocumentRecognizer = {
  type: 'RAW_DECLA',
  name: 'RAW Declaration',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    // Disqualify if it's a Consumer Information Notice (CIN)
    const isDisqualified =
      (/^cin|\bcin\b|\bcin\s*\(/i.test(fileName) && !fLower.includes('raw')) ||
      (lower.includes('consumer information notice') && !lower.includes('checks conducted by the raw'));

    if (!isDisqualified) {
      if (fLower.includes('raw') && (fLower.includes('decl') || fLower.includes('declaration'))) {
        matched.push(`filename:${fileName}`);
        score += 80;
      }
      if (lower.includes('registered automotive workshop') && lower.includes('declaration')) {
        matched.push('Registered Automotive Workshop Declaration');
        score += 80;
      }
      if (lower.includes('paragraph 65(2)(a)') || lower.includes('checks conducted by the raw') || lower.includes('raw approval holder details')) {
        matched.push('Paragraph 65(2)(a)');
        score += 40;
      }
      if (/RAW[:\-_\s]*\d{3,6}/i.test(text)) {
        matched.push('RAW Approval Number');
        score += 30;
      }
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

    // Extract VIA # (CRE Approval Number) from Item 4
    let viaNo: string | undefined;
    const viaMatch = text.match(/(?:Concessional\s+RAV\s+entry\s+approval\s+number|RAV\s+entry\s+approval\s+number|Concessional\s+approval\s+number)[^A-Za-z0-9\n]{0,35}(CRE[-_\s]*\d{4,8})/i);
    if (viaMatch) {
      viaNo = viaMatch[1].toUpperCase().replace(/\s+/g, '-');
    } else {
      const creFallback = text.match(/\b(CRE[-_\s]*\d{4,8})\b/i);
      if (creFallback) {
        viaNo = creFallback[1].toUpperCase().replace(/\s+/g, '-');
      }
    }

    // Extract Unique ID (Model Report Work Instructions document identifier) from Item 12
    let uniqueId: string | undefined;
    const uidMatch = text.match(/(?:Model\s+Report\s+Work\s+Instructions?\s+document\s+identifier|Work\s+Instructions?\s+document\s+identifier|document\s+identifier)[^A-Za-z0-9\n]{0,35}([A-Za-z0-9\-_]{5,25})/i);
    if (uidMatch && !/^(details|number|version|date|instruction|check)/i.test(uidMatch[1])) {
      uniqueId = uidMatch[1].trim();
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'RAW_DECLA',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched RAW Declaration: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        rawId,
        mreNo,
        make,
        model,
        viaNo,
        uniqueId,
      },
    };
  },
};

// 4. Consumer Information Notice (CIN)
export const consumerInformationNoticeRecognizer: DocumentRecognizer = {
  type: 'CIN',
  name: 'Consumer Information Notice',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (/^cin|\bcin\b|\bcin\s*\(|import[-_\s]?notice|consumer[-_\s]?notice/i.test(fileName) || fLower.includes('cin') || fLower.includes('consumer')) {
      matched.push(`filename:${fileName}`);
      score += 80;
    }
    if (lower.includes('consumer information notice') || lower.includes('consumer notice') || lower.includes('import notice')) {
      matched.push('Consumer Information Notice');
      score += 80;
    }

    // Extract Build Date (Build month/year) from CIN
    let buildDate: string | undefined;
    const buildMatch = text.match(
      /(?:Build\s+month(?:\s*[\/\-]\s*year)?|Build\s+date|Date\s+of\s+manufacture|Manufacture\s+date)[^A-Za-z0-9]{0,40}(\d{1,2}\s*[\/\-]\s*\d{4}|\d{4}\s*[\/\-]\s*\d{1,2})/i
    );
    if (buildMatch) {
      const rawDate = buildMatch[1].replace(/\s+/g, '').replace(/-/g, '/');
      const parts = rawDate.split('/');
      if (parts[0].length === 4) {
        buildDate = `${parts[1].padStart(2, '0')}/${parts[0]}`;
      } else {
        buildDate = `${parts[0].padStart(2, '0')}/${parts[1]}`;
      }
    }

    // Extract VIA # from CIN table
    let viaNo: string | undefined;
    const cinCre = text.match(/\b(CRE[-_\s]*\d{4,8})\b/i);
    if (cinCre) {
      viaNo = cinCre[1].toUpperCase().replace(/\s+/g, '-');
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'CIN',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Import Notice (CIN): ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        buildDate,
        viaNo,
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
    const matched: string[] = [];
    let score = 0;

    // Disqualify if it's a checklist / inspection
    const isDisqualified = /^vc|^vi|verification|checklist/i.test(fileName);
    if (!isDisqualified) {
      if (/^wi|\bwi\b|_wi_|instruction|work[-_\s]?instruction/i.test(fileName)) {
        matched.push(`filename:${fileName}`);
        score += 80;
      }
      if (lower.includes('model report work instructions') || lower.includes('work instructions') || lower.includes('work instruction')) {
        matched.push('Work Instructions');
        score += 80;
      }
      if (/CPT[-_\s]*[A-Z0-9]{4,10}/i.test(text)) {
        matched.push('CPT Document Identifier');
        score += 40;
      }
    }

    // Extract Unique ID from Work Instructions
    let uniqueId: string | undefined;
    const wiDocId = text.match(/(?:Document\s+identifier|Doc\s+identifier|Identifier)[:\s]+([A-Za-z0-9\-_]{5,25})/i);
    if (wiDocId && !/^(details|number|version|date|instruction|check)/i.test(wiDocId[1])) {
      uniqueId = wiDocId[1].trim();
    } else {
      const genericUid = text.match(/\b(AVV-\d{4}-\d{2,5}-\d{1,4}|CPT-[A-Z0-9]{4,10}|UID-[A-Za-z0-9\-_]{4,15})\b/i);
      if (genericUid) {
        uniqueId = genericUid[1].trim();
      }
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'WI',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Work Instructions: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
        uniqueId,
      },
    };
  },
};

// 6. Vehicle Inspection (VI) / Verification Checklist
export const vehicleInspectionRecognizer: DocumentRecognizer = {
  type: 'VI',
  name: 'Vehicle Inspection Checklist',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (/^vc|^vi|\bvi\b|\bvc\b|verification|checklist|inspection/i.test(fileName)) {
      matched.push(`filename:${fileName}`);
      score += 80;
    }
    if (lower.includes('verification checklist') || lower.includes('vehicle inspection') || lower.includes('inspection checklist') || lower.includes('physical inspection')) {
      matched.push('Verification Checklist');
      score += 80;
    }
    if (lower.includes('hoist inspection') || lower.includes('brake test') || lower.includes('underbody check') || lower.includes('scope check')) {
      matched.push('Inspection Checklist Items');
      score += 30;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'VI',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Vehicle Inspection: ${matched.join(', ')}` : '',
      metadata: { vin: vinRes.vin },
    };
  },
};

// 7. Damage or Corrosion (DC)
export const damageCorrosionRecognizer: DocumentRecognizer = {
  type: 'DC',
  name: 'Damage or Corrosion Assessment',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    // Disqualify if it's Work Instructions or Verification Checklist (which contain "18 Damage or corrosion check")
    const isDisqualified =
      /^wi|^vc|^vi|work[-_\s]?instruction|verification|checklist/i.test(fileName) ||
      lower.includes('model report work instructions') ||
      lower.includes('avv verification checklist');

    if (!isDisqualified) {
      if (/^dr|^dc|\bdc\b|\bdr\b|damage|corrosion/i.test(fileName)) {
        matched.push(`filename:${fileName}`);
        score += 80;
      }
      if (lower.includes('damage or corrosion assessment') || lower.includes('damage or corrosion report') || lower.includes('damage report') || lower.includes('corrosion report')) {
        matched.push('Damage or Corrosion Report');
        score += 80;
      } else if (lower.includes('damage or corrosion') || lower.includes('damage and corrosion')) {
        matched.push('Damage or Corrosion');
        score += 50;
      }
      if (lower.includes('corrosion check') || lower.includes('damage assessment') || lower.includes('structural damage')) {
        matched.push('Damage Assessment / Corrosion Report');
        score += 40;
      }
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'DC',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Damage / Corrosion: ${matched.join(', ')}` : '',
      metadata: {
        vin: vinRes.vin,
      },
    };
  },
};

// 8. Recall Clearance (RECALL)
export const recallClearanceRecognizer: DocumentRecognizer = {
  type: 'RECALL',
  name: 'Recall Clearance',
  evaluate(text: string, fileName: string): RecognitionResult {
    const lower = text.toLowerCase();
    const fLower = fileName.toLowerCase();
    const matched: string[] = [];
    let score = 0;

    if (fLower.includes('recall')) {
      matched.push(`filename:${fileName}`);
      score += 80;
    }
    if (lower.includes('recall clearance') || lower.includes('recall check') || lower.includes('recall status')) {
      matched.push('Recall Clearance');
      score += 80;
    }
    if (lower.includes('outstanding safety recall') || lower.includes('campaign check') || lower.includes('no safety recalls')) {
      matched.push('Safety Recall Check');
      score += 40;
    }

    const vinRes = extractVinIntelligence(text);

    return {
      docType: 'RECALL',
      confidence: score,
      matchedKeywords: matched,
      reason: matched.length > 0 ? `Matched Recall Clearance: ${matched.join(', ')}` : '',
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
