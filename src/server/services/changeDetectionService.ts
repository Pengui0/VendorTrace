/**
 * VendorTrace Change Detection & Deterministic Signal Fingerprinting Service
 * Compares latest normalized investigation report against baseline/previous runs.
 * Strictly avoids hashing volatile fields and treats disappeared sources honestly.
 */

import {
  SignalDiffItem,
  RunComparisonReport,
  MonitoringConfig,
  MonitoringFrequencyPreference,
  FieldChange,
} from '../../types/monitoringDiff.js';
import { RiskFinding } from '../../types/riskFinding.js';
import { generateStableId } from '../validation/domainValidators.js';

export const SCHEDULING_UNAVAILABLE_NOTICE =
  'Scheduling not enabled in this deployment. Automated unattended background monitoring is inactive; re-checks must be executed manually.';

/**
 * Computes deterministic signal fingerprint without volatile fields.
 * Excludes retrievedAt, capturedAt, array indices, and scrape timestamps.
 */
export function computeSignalFingerprint(params: {
  entityIdentifier: string; // CIN or normalized canonical name
  dimension: string;
  title: string;
  referenceNumber?: string | null;
  sourceDomain?: string | null;
  snippetKey?: string | null;
}): string {
  const cleanEntity = params.entityIdentifier.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanDim = params.dimension.trim().toLowerCase();
  const cleanTitle = params.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanRef = params.referenceNumber ? params.referenceNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : 'NO_REF';
  const cleanDomain = params.sourceDomain ? params.sourceDomain.trim().toLowerCase().replace(/^www\./, '') : 'ANY_DOMAIN';
  const cleanSnippet =
    cleanRef !== 'NO_REF'
      ? 'REF_ANCHORED'
      : params.snippetKey
        ? params.snippetKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40)
        : 'NO_SNIPPET';

  return `sig_${cleanEntity}_${cleanDim}_${cleanTitle}_${cleanRef}_${cleanDomain}_${cleanSnippet}`;
}

/**
 * Extracts a normalized reference identifier from a finding if present (e.g. CNR number, case number, order number).
 */
function extractFindingReference(finding: RiskFinding): string | null {
  const lowerTitle = finding.title.toLowerCase();
  const match = lowerTitle.match(/([a-z]{2,}[\/_]\d{2,}[\/_]\d{2,}|cnr:\s*[a-z0-9]+|chg_\d+|order\s*#?[a-z0-9_\-]+)/i);
  if (match) return match[1];

  const firstEv = finding.evidence[0];
  if (firstEv?.url) {
    const urlMatch = firstEv.url.match(/(?:case|order)[_\/]([A-Za-z0-9_\-]+)/i);
    if (urlMatch) return urlMatch[1];
  }

  return null;
}

export class ChangeDetectionService {
  private monitoringPreferences = new Map<string, MonitoringConfig>();

  /**
   * Generates signal fingerprint for a RiskFinding.
   */
  public getFindingFingerprint(entityIdentifier: string, finding: RiskFinding): string {
    const refNum = extractFindingReference(finding);
    const firstEv = finding.evidence[0];

    return computeSignalFingerprint({
      entityIdentifier,
      dimension: finding.dimension,
      title: finding.title,
      referenceNumber: refNum,
      sourceDomain: firstEv?.sourceDomain || null,
      snippetKey: firstEv?.snippet || null,
    });
  }

  /**
   * Compares two investigation runs and detects new, changed, and unobserved signals.
   */
  public compareInvestigationRuns(params: {
    vendorId: string;
    vendorName: string;
    entityIdentifier: string;
    previousInvestigationId?: string | null;
    previousRunDate?: string | null;
    previousFindings?: RiskFinding[];
    latestInvestigationId: string;
    latestRunDate: string;
    latestFindings: RiskFinding[];
  }): RunComparisonReport {
    const {
      vendorId,
      vendorName,
      entityIdentifier,
      previousInvestigationId = 'BASELINE_RUN',
      previousRunDate = null,
      previousFindings = [],
      latestInvestigationId,
      latestRunDate,
      latestFindings,
    } = params;

    const comparisonId = generateStableId('cmp');
    const prevMap = new Map<string, RiskFinding>();
    for (const pf of previousFindings) {
      const fp = this.getFindingFingerprint(entityIdentifier, pf);
      prevMap.set(fp, pf);
    }

    const latestMap = new Map<string, RiskFinding>();
    for (const lf of latestFindings) {
      const fp = this.getFindingFingerprint(entityIdentifier, lf);
      latestMap.set(fp, lf);
    }

    const newSignals: SignalDiffItem[] = [];
    const changedSignals: SignalDiffItem[] = [];
    const notObservedSignals: SignalDiffItem[] = [];
    const unresolvedSignals: SignalDiffItem[] = [];

    // 1. Check for New and Changed Signals in Latest Run
    for (const [fp, curr] of latestMap.entries()) {
      const prev = prevMap.get(fp);

      if (!prev) {
        // Brand new signal not present in previous check
        newSignals.push({
          id: `diff_new_${curr.id}`,
          fingerprint: fp,
          diffType: 'NEW',
          title: curr.title,
          dimension: curr.dimension,
          currentSignal: curr,
          previousSignal: null,
          changes: [
            {
              field: 'status',
              previousValue: 'NOT_RECORDED',
              currentValue: curr.status,
              currentEvidenceDate: curr.evidence[0]?.publishedAt || curr.createdAt,
            },
          ],
          explanation: `New signal detected since previous check: "${curr.title}".`,
          needsHumanReview: curr.severity >= 3 || curr.confidence === 'single_source_review',
          statusBadge: 'New since previous check',
        });
      } else {
        // Compare fields for meaningful changes
        const changes: FieldChange[] = [];

        // Status change
        if (curr.status !== prev.status) {
          changes.push({
            field: 'status',
            previousValue: prev.status,
            currentValue: curr.status,
            previousEvidenceDate: prev.evidence[0]?.publishedAt,
            currentEvidenceDate: curr.evidence[0]?.publishedAt,
          });
        }

        // Severity change
        if (curr.severity !== prev.severity) {
          changes.push({
            field: 'severity',
            previousValue: prev.severity,
            currentValue: curr.severity,
            previousEvidenceDate: prev.evidence[0]?.publishedAt,
            currentEvidenceDate: curr.evidence[0]?.publishedAt,
          });
        }

        // Legal dispute stage change (e.g. pending -> disposed/settled)
        const prevLegal = prev.evidence[0]?.legalStatus || null;
        const currLegal = curr.evidence[0]?.legalStatus || null;
        if (prevLegal !== currLegal) {
          changes.push({
            field: 'legalDisputeStatus',
            previousValue: prevLegal,
            currentValue: currLegal,
            previousEvidenceDate: prev.evidence[0]?.publishedAt,
            currentEvidenceDate: curr.evidence[0]?.publishedAt,
          });
        }

        // Confidence change
        if (curr.confidence !== prev.confidence) {
          changes.push({
            field: 'confidence',
            previousValue: prev.confidence,
            currentValue: curr.confidence,
            previousEvidenceDate: prev.evidence[0]?.publishedAt,
            currentEvidenceDate: curr.evidence[0]?.publishedAt,
          });
        }

        if (changes.length > 0) {
          const isLegalResolution = currLegal === 'dismissed' || currLegal === 'disposed' || currLegal === 'settled';
          const diffType = isLegalResolution ? 'RESOLVED_BY_SOURCE' : 'CHANGED';

          const diffItem: SignalDiffItem = {
            id: `diff_chg_${curr.id}`,
            fingerprint: fp,
            diffType,
            title: curr.title,
            dimension: curr.dimension,
            currentSignal: curr,
            previousSignal: prev,
            changes,
            explanation: isLegalResolution
              ? `Matter procedurally resolved: stage changed from ${prevLegal || 'pending'} to ${currLegal}.`
              : `Signal changed across ${changes.length} attribute(s): ${changes.map((c) => c.field).join(', ')}.`,
            needsHumanReview: curr.severity >= 3 && !isLegalResolution,
            statusBadge: isLegalResolution ? 'Resolved by Source' : 'Modified since previous check',
          };

          changedSignals.push(diffItem);

          if (diffItem.needsHumanReview) {
            unresolvedSignals.push(diffItem);
          }
        }
      }
    }

    // 2. Check for Signals in Previous Run no longer present in Latest Run
    for (const [fp, prev] of prevMap.entries()) {
      if (!latestMap.has(fp)) {
        // Rule: Disappeared search result must NOT automatically be marked clean/resolved!
        const wasExplicitlyClosed =
          prev.evidence[0]?.legalStatus === 'settled' ||
          prev.evidence[0]?.legalStatus === 'dismissed' ||
          prev.evidence[0]?.legalStatus === 'disposed';

        const diffType = wasExplicitlyClosed ? 'RESOLVED_BY_SOURCE' : 'NOT_OBSERVED_IN_LATEST';

        notObservedSignals.push({
          id: `diff_notobs_${prev.id}`,
          fingerprint: fp,
          diffType,
          title: prev.title,
          dimension: prev.dimension,
          currentSignal: null,
          previousSignal: prev,
          changes: [
            {
              field: 'presence',
              previousValue: 'PRESENT',
              currentValue: 'NOT_OBSERVED',
              previousEvidenceDate: prev.evidence[0]?.publishedAt || prev.createdAt,
            },
          ],
          explanation: wasExplicitlyClosed
            ? 'Record marked resolved based on explicit court settlement / dismissal order.'
            : 'Signal was not observed in latest registry check. Zero-fabrication rule: absence of record in latest query does not constitute verified clearance.',
          needsHumanReview: !wasExplicitlyClosed && prev.severity >= 3,
          statusBadge: wasExplicitlyClosed ? 'Resolved by Source' : 'Not observed in latest check',
        });
      }
    }

    const totalChanges = newSignals.length + changedSignals.length + notObservedSignals.length;
    const isIdentical = totalChanges === 0;

    const summary = isIdentical
      ? `Re-check concluded with zero delta: All ${latestFindings.length} findings match baseline records identically.`
      : `Re-check identified ${totalChanges} delta(s): ${newSignals.length} new finding(s), ${changedSignals.length} modified, ${notObservedSignals.length} no longer observed in checked registries.`;

    return {
      comparisonId,
      previousInvestigationId: previousInvestigationId || 'BASELINE_RUN',
      previousRunDate: previousRunDate || latestRunDate,
      latestInvestigationId,
      latestRunDate,
      vendorId,
      vendorName,
      comparedAt: new Date().toISOString(),
      newSignals,
      changedSignals,
      notObservedSignals,
      unresolvedSignals,
      stats: {
        totalNew: newSignals.length,
        totalChanged: changedSignals.length,
        totalNotObserved: notObservedSignals.length,
        totalUnresolved: unresolvedSignals.length,
        isIdentical,
      },
      summary,
      schedulingNotice: SCHEDULING_UNAVAILABLE_NOTICE,
    };
  }

  /**
   * Gets or sets future monitoring preference without claiming active background scheduling.
   */
  public getMonitoringConfig(vendorId: string): MonitoringConfig {
    const existing = this.monitoringPreferences.get(vendorId);
    if (existing) return existing;

    const defaultConfig: MonitoringConfig = {
      vendorId,
      preference: 'MANUAL_ONLY',
      status: 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT',
      lastCheckedAt: new Date().toISOString(),
      nextScheduledCheck: null,
      notice: SCHEDULING_UNAVAILABLE_NOTICE,
    };

    this.monitoringPreferences.set(vendorId, defaultConfig);
    return defaultConfig;
  }

  public setMonitoringPreference(vendorId: string, preference: MonitoringFrequencyPreference): MonitoringConfig {
    const config: MonitoringConfig = {
      vendorId,
      preference,
      status: 'SCHEDULING_NOT_ENABLED_IN_THIS_DEPLOYMENT',
      lastCheckedAt: new Date().toISOString(),
      nextScheduledCheck: null,
      notice: SCHEDULING_UNAVAILABLE_NOTICE,
    };

    this.monitoringPreferences.set(vendorId, config);
    return config;
  }
}

export const changeDetectionService = new ChangeDetectionService();
