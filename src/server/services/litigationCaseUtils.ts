import { LitigationCaseItem } from '../providers/types.js';

function normalizePart(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function deduplicateLitigationCases(cases: LitigationCaseItem[]): LitigationCaseItem[] {
  const seen = new Set<string>();
  const result: LitigationCaseItem[] = [];
  for (const item of cases) {
    const id = item.caseId?.trim();
    const parties = (item.parties || [item.petitioner, item.respondent].filter((value): value is string => Boolean(value)))
      .map(normalizePart).filter(Boolean).sort();
    const composite = item.caseNumber && item.courtName && parties.length > 0
      ? `composite:${normalizePart(item.caseNumber)}|${normalizePart(item.courtName)}|${parties.join('|')}`
      : null;
    const key = id ? `id:${normalizePart(id)}` : composite;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(item);
  }
  return result;
}
