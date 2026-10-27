/** Stable grouping key for history entries belonging to the same target. */
export function getInvestigationIdentityKey(investigation: {
  targetName?: string;
  identifierType?: string;
  identifierValue?: string;
  requestedIdentifier?: { type?: string; value?: string };
}): string {
  const type = investigation.identifierType || investigation.requestedIdentifier?.type || '';
  const value = investigation.identifierValue || investigation.requestedIdentifier?.value || '';
  const normalizedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (type && type !== 'NAME' && normalizedValue) return `identifier:${type}:${normalizedValue}`;
  const normalizedName = (investigation.targetName || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `name:${normalizedName}`;
}

/** Keep the newest report for each identity, preserving newest-first order. */
export function keepLatestInvestigationPerIdentity<T extends {
  createdAt?: string;
  startedAt?: string;
  targetName?: string;
  identifierType?: string;
  identifierValue?: string;
  requestedIdentifier?: { type?: string; value?: string };
}>(investigations: T[]): T[] {
  const latest = new Map<string, T>();
  for (const investigation of [...investigations].sort((a, b) =>
    new Date(b.createdAt || b.startedAt || 0).getTime() - new Date(a.createdAt || a.startedAt || 0).getTime()
  )) {
    const key = getInvestigationIdentityKey(investigation);
    if (!latest.has(key)) latest.set(key, investigation);
  }
  return [...latest.values()];
}
