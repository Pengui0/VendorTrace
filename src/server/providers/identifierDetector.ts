/**
 * Identifier Detector & Format Validator for Indian Corporate Entities
 * Distinguishes CIN, LLPIN, GSTIN, PAN, DIN, and Company Trade Names.
 */

export type DetectedIdentifierKind =
  | 'CIN'
  | 'LLPIN'
  | 'GSTIN'
  | 'PAN'
  | 'DIN'
  | 'COMPANY_NAME';

export interface IdentifierDetectionResult {
  kind: DetectedIdentifierKind;
  rawInput: string;
  normalizedValue: string;
  isValid: boolean;
  helperMessage: string;
}

// 21-character CIN: [L/U] + 5-digit industry + 2-letter state + 4-digit year + 3-letter type + 6-digit registration
const CIN_REGEX = /^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/;

// LLPIN: 3 letters + optional hyphen + 4 digits (e.g. AAA-1234, AAB-9012, or AAA1234)
const LLPIN_REGEX = /^[A-Za-z]{3}-?[0-9]{4}$/;

// 15-character GSTIN: 2-digit state + 10-char PAN + 1 entity code + 'Z' + 1 checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[1-9A-Za-z]{1}[Zz][0-9A-Za-z]{1}$/;

// 10-character PAN: 5 letters + 4 digits + 1 letter
const PAN_REGEX = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/;

// 8-digit Director Identification Number (DIN)
const DIN_REGEX = /^[0-9]{8}$/;

export function detectIdentifierKind(input: string): IdentifierDetectionResult {
  const rawInput = (input || '').trim();
  const clean = rawInput.replace(/\s+/g, '');

  if (!clean) {
    return {
      kind: 'COMPANY_NAME',
      rawInput,
      normalizedValue: '',
      isValid: false,
      helperMessage: 'Please provide a company legal name or identifier.',
    };
  }

  // 1. Check CIN (21 characters)
  if (clean.length === 21 && CIN_REGEX.test(clean)) {
    return {
      kind: 'CIN',
      rawInput,
      normalizedValue: clean.toUpperCase(),
      isValid: true,
      helperMessage: 'Valid 21-digit Corporate Identification Number (CIN).',
    };
  }

  // 2. Check GSTIN (15 characters)
  if (clean.length === 15 && GSTIN_REGEX.test(clean)) {
    return {
      kind: 'GSTIN',
      rawInput,
      normalizedValue: clean.toUpperCase(),
      isValid: true,
      helperMessage: 'Valid 15-digit Goods & Services Tax Identification Number (GSTIN).',
    };
  }

  // 3. Check LLPIN (7 or 8 characters)
  if (LLPIN_REGEX.test(clean)) {
    return {
      kind: 'LLPIN',
      rawInput,
      normalizedValue: clean.toUpperCase().replace('-', ''),
      isValid: true,
      helperMessage: 'Valid Limited Liability Partnership Identification Number (LLPIN).',
    };
  }

  // 4. Check PAN (10 characters)
  if (clean.length === 10 && PAN_REGEX.test(clean)) {
    return {
      kind: 'PAN',
      rawInput,
      normalizedValue: clean.toUpperCase(),
      isValid: true,
      helperMessage: 'Valid 10-character Permanent Account Number (PAN).',
    };
  }

  // 5. Check DIN (8 digits)
  if (clean.length === 8 && DIN_REGEX.test(clean)) {
    return {
      kind: 'DIN',
      rawInput,
      normalizedValue: clean,
      isValid: true,
      helperMessage: 'Valid 8-digit Director Identification Number (DIN).',
    };
  }

  // Fallback: Company / Enterprise Trade Name for candidate search
  return {
    kind: 'COMPANY_NAME',
    rawInput,
    normalizedValue: rawInput,
    isValid: rawInput.length >= 2,
    helperMessage: 'Treated as legal or trade name for registry candidate search.',
  };
}
