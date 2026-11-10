/**
 * High-Precision VIN Intelligence & Cross-Validator
 * Extracts, normalizes, disambiguates, and cross-validates 17-char VINs,
 * Australian 6ZZ formats, and Japanese Chassis Numbers.
 */

export interface VinExtractionResult {
  vin?: string;
  chassisNo?: string;
  confidence: number; // 0 - 100
  source: string;
  isStandardIso: boolean;
  isAustralian6ZZ: boolean;
  isJapaneseChassis: boolean;
}

/**
 * Normalizes common OCR misread characters in VIN candidates
 */
export function normalizeOcrVinCandidate(raw: string): string {
  // Strip whitespace, hyphens, colons, dots, asterisks
  const clean = raw.toUpperCase().replace(/[\s\-_:\.\*\/\\]+/g, '');
  
  // Standard ISO VINs do not allow I, O, Q
  // Disambiguate common OCR confusions:
  // 'O' or 'Q' -> '0'
  // 'I' -> '1'
  return clean.replace(/[OQ]/g, '0').replace(/I/g, '1');
}

/**
 * Validates whether a candidate is a valid 17-character ISO or 6ZZ VIN
 */
export function isValid17CharVin(candidate: string): boolean {
  if (candidate.length !== 17) return false;
  // Must contain both letters and digits
  if (!/[A-Z]/.test(candidate) || !/[0-9]/.test(candidate)) return false;
  // Standard ISO VINs do not contain I, O, Q
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(candidate);
}

/**
 * Extracts and reconstructs VIN from OCR/PDF text, handling hyphenation,
 * multi-line line wraps, and Japanese chassis numbers.
 */
export function extractVinIntelligence(text: string): VinExtractionResult {
  if (!text || text.length < 5) {
    return { confidence: 0, source: 'None', isStandardIso: false, isAustralian6ZZ: false, isJapaneseChassis: false };
  }

  // 1. Look for explicit VIN / Chassis labeled prefixes (including Japanese 車台番号)
  const labeledRegexes = [
    /(?:VIN|Vehicle\s+Identification\s+Number|Chassis\s+No|Chassis\s+Number|車台番号)[^A-Za-z0-9]{0,20}([A-Za-z0-9\s-]{8,30})/gi,
  ];

  for (const regex of labeledRegexes) {
    const matches = Array.from(text.matchAll(regex));
    for (const m of matches) {
      const rawCandidate = m[1].trim();

      // Check Japanese chassis format first if under 車台番号 or Chassis Number
      const chassisMatch = rawCandidate.match(/\b([A-Z0-9]{2,6}[-_][0-9]{5,8})\b/i);

      // If it's a 17-char VIN
      const normalized = normalizeOcrVinCandidate(rawCandidate);
      if (normalized.length >= 17) {
        const exact17 = normalized.slice(0, 17);
        // Ensure raw candidate had at least one digit originally to prevent misreading words
        if (/[0-9]/.test(rawCandidate) && isValid17CharVin(exact17)) {
          return {
            vin: exact17,
            chassisNo: chassisMatch ? chassisMatch[1].toUpperCase() : undefined,
            confidence: 98,
            source: 'Labeled VIN Prefix (Exact 17 chars)',
            isStandardIso: !exact17.startsWith('6ZZ'),
            isAustralian6ZZ: exact17.startsWith('6ZZ'),
            isJapaneseChassis: false,
          };
        }
      }

      if (chassisMatch) {
        return {
          chassisNo: chassisMatch[1].toUpperCase(),
          confidence: 95,
          source: 'Labeled Chassis Format (車台番号 / Chassis No)',
          isStandardIso: false,
          isAustralian6ZZ: false,
          isJapaneseChassis: true,
        };
      }
    }
  }

  // 2. Scan entire text for isolated 17-character VINs
  // Must be a single word token (or single hyphen/space) AND originally contain at least two digits
  const fullTextMatches = Array.from(text.matchAll(/\b(6ZZ[A-Za-z0-9]{13,15}|[A-Za-z0-9]{8,12}[-\s]?[A-Za-z0-9]{5,8}|[A-Za-z0-9]{17})\b/g));
  for (const match of fullTextMatches) {
    const rawMatch = match[0];
    const digitCount = (rawMatch.match(/[0-9]/g) || []).length;
    if (digitCount < 2) continue;

    const normalized = normalizeOcrVinCandidate(rawMatch);
    if (normalized.length === 17 && isValid17CharVin(normalized)) {
      return {
        vin: normalized,
        confidence: 90,
        source: 'Isolated 17-character pattern match',
        isStandardIso: !normalized.startsWith('6ZZ'),
        isAustralian6ZZ: normalized.startsWith('6ZZ'),
        isJapaneseChassis: false,
      };
    }
  }

  // 3. Fallback Japanese chassis number (e.g. ZRR85-0029733, ZE1-060474, ANH20-0012345)
  const chassisStandaloneMatch = text.match(/\b([A-Z0-9]{2,6}[-_][0-9]{5,8})\b/i);
  if (chassisStandaloneMatch) {
    return {
      chassisNo: chassisStandaloneMatch[1].toUpperCase(),
      confidence: 85,
      source: 'Standalone Chassis Pattern',
      isStandardIso: false,
      isAustralian6ZZ: false,
      isJapaneseChassis: true,
    };
  }

  return { confidence: 0, source: 'None', isStandardIso: false, isAustralian6ZZ: false, isJapaneseChassis: false };
}
