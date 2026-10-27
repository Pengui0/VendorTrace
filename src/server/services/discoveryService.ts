/**
 * Layer 1 VendorTrace Discovery Orchestration Service
 * Concurrent 4-Dimension Due Diligence with Failure Isolation & Strict Zero-Fabrication.
 */

import {
  RiskDimension,
  DimensionTaskState,
  DimensionTaskResult,
  Layer1DiscoveryReport,
  RiskFinding,
  DiscoveryOrchestrationOptions,
  EvidenceItem,
} from '../../types/riskFinding.js';
import { indiacos } from '../providers/indiacos.js';
import { tinyfish } from '../providers/tinyfish.js';
import { tinyfishClient } from '../providers/tinyfishClient.js';
import {
  COURT_LITIGATION_OUTPUT_SCHEMA,
  BLACKLIST_DEBARMENT_OUTPUT_SCHEMA,
  ADVERSE_NEWS_OUTPUT_SCHEMA,
} from '../providers/tinyfishSchemas.js';
import {
  validateRiskFinding,
  validateUrl,
  validateEvidenceTimestamps,
  deduplicateEvidence,
} from '../validation/riskFindingValidator.js';
import { generateStableId } from '../validation/domainValidators.js';
import { ResolvedCompanyProfile, ProviderErrorCategory, WebInvestigationSearchResult } from '../providers/types.js';
import { deduplicateLitigationCases } from './litigationCaseUtils.js';

/**
 * Concurrency Limiter Pool
 */
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  signal: AbortSignal
): Promise<Array<T | undefined>> {
  const results: Array<T | undefined> = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length && !signal.aborted) {
      const current = nextIdx++;
      if (signal.aborted) return;
      results[current] = await tasks[current]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const DEFAULT_OVERALL_TIMEOUT_MS = 120000;
const DEFAULT_AGENT_TIMEOUT_MS = 45000;

function isCaseSpecificSourceUrl(value: string | null | undefined, caseNumber?: string, caseId?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname === '/' || url.pathname === '') return false;
    const path = decodeURIComponent(`${url.pathname}${url.search}`).toLowerCase();
    if (/\/(?:companies?|profiles?|entities|businesses|organizations?|organisations?|corporate|firms?)(?:\/|$)/i.test(path)) return false;
    return /\b(?:case|cases|docket|cnr|litigation|petition|judg(?:e)?ment|orders?)\b/i.test(path)
      || Boolean(caseNumber && path.includes(caseNumber.toLowerCase()))
      || Boolean(caseId && path.includes(caseId.toLowerCase()));
  } catch {
    return false;
  }
}
const MAX_ATTEMPTS = 2;
const MAX_TIMEOUT_MS = 120000;
const MAX_RETRY_BACKOFF_MS = 2000;

function configuredDuration(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.trunc(parsed), MAX_TIMEOUT_MS)
    : fallback;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Investigation cancelled.'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Investigation cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}


/**
 * Offline/mock investigations must never produce clickable links to real portals or
 * wording that implies an upstream source was actually queried. Preserve source grouping
 * for confidence tests, but move domains into reserved .invalid hosts and label fixtures.
 */
function labelOfflineResultsAsSynthetic(results: DimensionTaskResult[]): DimensionTaskResult[] {
  return results.map((result) => {
    const domainMap = new Map<string, string>();
    const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'unknown-source';
    const fixtureDomainFor = (key: string) => {
      const normalized = key.trim().toLowerCase() || 'unknown-source';
      const existing = domainMap.get(normalized);
      if (existing) return existing;
      const domain = `source-${slug(normalized)}-${domainMap.size + 1}.vendortrace.invalid`;
      domainMap.set(normalized, domain);
      return domain;
    };

    const findings = result.findings.map((finding) => ({
      ...finding,
      neutralSummary: `SYNTHETIC DEMO ONLY — not a verified fact about the target entity. ${finding.neutralSummary} This illustrative fixture is not a statement about real-world standing.`,
      severityExplanation: `Synthetic demo explanation only; no real-world determination was made. ${finding.severityExplanation}`,
      evidence: finding.evidence.map((evidence, index) => {
        const oldDomain = evidence.sourceDomain || evidence.sourceName || `unknown-${index + 1}`;
        const syntheticDomain = fixtureDomainFor(oldDomain);
        return {
          ...evidence,
          sourceName: `Synthetic fixture: ${evidence.sourceName || `Evidence ${index + 1}`}`,
          sourceDomain: syntheticDomain,
          url: evidence.url ? `https://${syntheticDomain}/evidence/${encodeURIComponent(evidence.id || String(index + 1))}` : null,
          snippet: `SYNTHETIC DEMO DATA ONLY. ${evidence.snippet} No external source was queried; this is fictional demonstration text.`,
          publishedAt: null,
          underlyingSource: 'VendorTrace offline synthetic fixture; no external portal queried',
          identityMatchNote: 'Synthetic demo fixture; target identity has not been verified against an external source.',
          legalStatus: null,
        };
      }),
    }));

    return {
      ...result,
      provider: 'VendorTrace Offline Synthetic Fixture Engine',
      sourcesChecked: result.sourcesChecked.map((source) => `Synthetic fixture: ${source} (offline; not queried live)`),
      findings,
      coverageGaps: [...result.coverageGaps],
    };
  });
}

export class DiscoveryOrchestrationService {
  public async runDebarmentEvidenceSearch(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null; pan?: string | null; identifiers?: string[] },
    signal: AbortSignal
  ): Promise<DimensionTaskResult> {
    return this.runDebarmentDimension(vendor, false, '', signal, false);
  }

  /**
   * Orchestrates Layer 1 VendorTrace discovery across four risk dimensions concurrently.
   */
  public async runDiscovery(
    vendor: {
      id?: string;
      canonicalName: string;
      cin?: string | null;
      gstin?: string | null;
      pan?: string | null;
      profile?: ResolvedCompanyProfile | null;
    },
    options: DiscoveryOrchestrationOptions = {}
  ): Promise<Layer1DiscoveryReport> {
    const investigationId = generateStableId('inv');
    const vendorId = vendor.id || generateStableId('ven');
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const maxConcurrency = options.maxConcurrency || 3;
    const overallTimeoutMs = Math.min(
      options.overallTimeoutMs || configuredDuration(process.env.VENDORTRACE_INVESTIGATION_TIMEOUT_MS, DEFAULT_OVERALL_TIMEOUT_MS),
      MAX_TIMEOUT_MS
    );
    const dimensionTimeoutMs = Math.min(
      options.dimensionTimeoutMs || configuredDuration(process.env.VENDORTRACE_AGENT_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUT_MS),
      overallTimeoutMs
    );
    const maxAttempts = Math.max(1, Math.min(options.maxAttempts || Number(process.env.VENDORTRACE_AGENT_MAX_ATTEMPTS) || MAX_ATTEMPTS, MAX_ATTEMPTS));
    const configuredBackoff = options.retryBackoffMs ?? (Number(process.env.VENDORTRACE_AGENT_RETRY_BACKOFF_MS) || 300);
    const retryBackoffMs = Math.max(0, Math.min(configuredBackoff, MAX_RETRY_BACKOFF_MS));
    const useMock = Boolean(options.useMock);
    const mockScenario = options.mockScenario || 'ALL_SUCCESS';
    const runController = new AbortController();
    let overallTimedOut = false;
    const abortFromCaller = () => runController.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (options.signal?.aborted) runController.abort();
    const overallTimer = setTimeout(() => {
      overallTimedOut = true;
      runController.abort('overall_timeout');
    }, overallTimeoutMs);

    // Build the 4 Dimension Task Callables
    const dimensionSpecs: Array<{ dimension: RiskDimension; title: string; run: (signal: AbortSignal) => Promise<DimensionTaskResult> }> = [
      {
        dimension: 'company_registry',
        title: 'Company Identity, MCA21 & GST Compliance',
        run: (signal) =>
        this.executeDimensionTask(
          'company_registry',
          'Company Identity, MCA21 & GST Compliance',
          dimensionTimeoutMs,
          maxAttempts,
          retryBackoffMs,
          signal,
          (taskSignal) => this.runRegistryAndGstDimension(vendor, useMock, mockScenario, taskSignal, Boolean(options.freshRun))
        ),
      },
      {
        dimension: 'gst_compliance',
        title: 'GST Filing & Tax Jurisdiction Compliance',
        run: (signal) =>
        this.executeDimensionTask(
          'gst_compliance',
          'GST Filing & Tax Jurisdiction Compliance',
          dimensionTimeoutMs,
          maxAttempts,
          retryBackoffMs,
          signal,
          (taskSignal) => this.runGstComplianceDimension(vendor, useMock, mockScenario, taskSignal, Boolean(options.freshRun))
        ),
      },
      {
        dimension: 'court_litigation',
        title: 'E-Courts, Tribunals & Commercial Litigation',
        run: (signal) =>
        this.executeDimensionTask(
          'court_litigation',
          'E-Courts, Tribunals & Commercial Litigation',
          dimensionTimeoutMs,
          maxAttempts,
          retryBackoffMs,
          signal,
          (taskSignal) => this.runLitigationDimension(vendor, useMock, mockScenario, taskSignal, Boolean(options.freshRun))
        ),
      },
      {
        dimension: 'blacklist_debarment',
        title: 'Government Procurement Debarment & Regulatory Penalties',
        run: (signal) =>
        this.executeDimensionTask(
          'blacklist_debarment',
          'Government Procurement Debarment & Regulatory Penalties',
          dimensionTimeoutMs,
          maxAttempts,
          retryBackoffMs,
          signal,
          (taskSignal) => this.runDebarmentDimension(vendor, useMock, mockScenario, taskSignal, Boolean(options.freshRun))
        ),
      },
      {
        dimension: 'negative_news',
        title: 'Negative News & Adverse Regulatory Coverage',
        run: (signal) =>
        this.executeDimensionTask(
          'negative_news',
          'Negative News & Adverse Regulatory Coverage',
          dimensionTimeoutMs,
          maxAttempts,
          retryBackoffMs,
          signal,
          (taskSignal) => this.runNegativeNewsDimension(vendor, useMock, mockScenario, taskSignal, Boolean(options.freshRun))
        ),
      },
    ];

    let rawResults: DimensionTaskResult[];
    try {
      const taskResults = await runWithConcurrencyLimit(
        dimensionSpecs.map((spec) => () => spec.run(runController.signal)),
        maxConcurrency,
        runController.signal
      );
      const timedOutOverall = overallTimedOut || options.signal?.reason === 'overall_timeout';
      rawResults = dimensionSpecs.map((spec, index) => taskResults[index] || this.createStoppedTaskResult(
        spec.dimension,
        spec.title,
        timedOutOverall ? 'failed' : 'cancelled',
        timedOutOverall ? 'Overall investigation deadline reached before this task started.' : 'Investigation cancelled before this task started.',
        timedOutOverall ? 'TIMEOUT' : 'NETWORK'
      ));
    } finally {
      clearTimeout(overallTimer);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }

    if (useMock) {
      // Offline scenarios are test fixtures, never live source checks.
      rawResults = labelOfflineResultsAsSynthetic(rawResults);
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    // Aggregate results
    const dimensionsMap: Record<RiskDimension, DimensionTaskResult> = {} as any;
    const allFindings: RiskFinding[] = [];
    const coverageGaps: string[] = [];
    let totalSourcesChecked = 0;

    for (const res of rawResults) {
      dimensionsMap[res.dimension] = res;
      totalSourcesChecked += (res.sourcesChecked?.length || 0);

      if (res.status === 'failed' || res.status === 'unavailable') {
        coverageGaps.push(`${res.title}: ${res.errorMessage || 'Source was unavailable'}`);
      }
      if (res.status === 'cancelled') {
        coverageGaps.push(`${res.title}: Investigation cancelled before this task completed.`);
      }

      if (res.coverageGaps.length > 0) {
        coverageGaps.push(...res.coverageGaps);
      }

      allFindings.push(...res.findings);
    }

    if (useMock) {
      coverageGaps.push('Synthetic demo mode: external sources were not queried; findings and coverage are illustrative only and must not support a real procurement decision.');
    }

    // Determine overall status
    const failedCount = rawResults.filter((r) => r.status !== 'completed').length;
    const timedOutOverall = overallTimedOut || options.signal?.reason === 'overall_timeout';
    const reportStatus = options.signal?.aborted && !timedOutOverall
      ? 'cancelled'
      : failedCount === rawResults.length
      ? 'failed'
      : failedCount > 0 || (!useMock && coverageGaps.length > 0)
      ? 'partial_failure'
      : 'completed';
    const coverageStatus = rawResults.every((result) => result.status === 'completed') &&
      coverageGaps.length === 0 &&
      !timedOutOverall &&
      !options.signal?.aborted
      ? 'COMPLETE'
      : 'PARTIAL';

    // Compute summary metrics
    const totalSignals = allFindings.length;
    const corroboratedSignals = allFindings.filter((f) => f.confidence === 'multiple_independent_sources').length;
    const reviewNeededSignals = allFindings.filter((finding) =>
      finding.status === 'inconclusive' ||
      (finding.status === 'signal_found' && finding.confidence === 'single_source_review')
    ).length;
    const highSeveritySignals = allFindings.filter((f) => f.severity >= 4).length;

    let verdict: 'VERIFIED_CLEAR' | 'CAUTION' | 'MATERIAL_RISK' | 'UNKNOWN' =
      coverageStatus === 'COMPLETE' ? 'VERIFIED_CLEAR' : 'UNKNOWN';
    if (highSeveritySignals > 0) {
      verdict = 'MATERIAL_RISK';
    } else if (reviewNeededSignals > 0 || allFindings.some((f) => f.severity === 3)) {
      verdict = 'CAUTION';
    } else if (reportStatus === 'failed' || (reportStatus === 'partial_failure' && totalSourcesChecked === 0)) {
      verdict = 'UNKNOWN';
    }

    const narrative = this.synthesizeSummaryNarrative({
      vendorName: vendor.canonicalName,
      reportStatus,
      totalSignals,
      corroboratedSignals,
      reviewNeededSignals,
      highSeveritySignals,
      verdict,
      coverageGapsCount: coverageGaps.length,
    });

    return {
      investigationId,
      vendorId,
      vendorName: vendor.canonicalName,
      cin: vendor.cin || null,
      gstin: vendor.gstin || null,
      pan: vendor.pan || null,
      status: reportStatus,
      coverageStatus,
      terminationReason: timedOutOverall ? 'TIMEOUT' : options.signal?.aborted ? 'CANCELLED' : null,
      startedAt,
      completedAt,
      totalDurationMs,
      dimensions: dimensionsMap,
      findings: allFindings,
      coverageGaps,
      totalSourcesChecked,
      summary: {
        totalSignals,
        corroboratedSignals,
        reviewNeededSignals,
        highSeveritySignals,
        verdict,
        narrative,
      },
    };
  }

  /**
   * Isolates dimension execution so single failures do not crash other tasks.
   */
  private async executeDimensionTask(
    dimension: RiskDimension,
    title: string,
    timeoutMs: number,
    maxAttempts: number,
    retryBackoffMs: number,
    runSignal: AbortSignal,
    taskFn: (signal: AbortSignal) => Promise<DimensionTaskResult>
  ): Promise<DimensionTaskResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (runSignal.aborted) {
        const timedOutOverall = runSignal.reason === 'overall_timeout';
        return this.createStoppedTaskResult(
          dimension,
          title,
          timedOutOverall ? 'failed' : 'cancelled',
          timedOutOverall ? 'Overall investigation deadline reached.' : 'Investigation cancelled.',
          timedOutOverall ? 'TIMEOUT' : 'NETWORK',
          Date.now() - startTime,
          attempt - 1
        );
      }

      const taskController = new AbortController();
      const abortTask = () => taskController.abort();
      runSignal.addEventListener('abort', abortTask, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        taskController.abort();
      }, timeoutMs);

      try {
        const taskPromise = taskFn(taskController.signal);
        const result = await Promise.race([
          taskPromise,
          new Promise<never>((_, reject) => {
            taskController.signal.addEventListener('abort', () => {
              if (timedOut || runSignal.aborted) {
                reject(new Error(timedOut ? `${title} timed out after ${timeoutMs}ms.` : 'Investigation cancelled.'));
              }
            }, { once: true });
          }),
        ]);
        clearTimeout(timer);
        runSignal.removeEventListener('abort', abortTask);

        if (
          attempt < maxAttempts &&
          ['TIMEOUT', 'NETWORK', 'UPSTREAM_5XX'].includes(String(result.errorCategory)) &&
          result.status === 'failed' &&
          !runSignal.aborted
        ) {
          await abortableDelay(Math.min(retryBackoffMs * attempt, MAX_RETRY_BACKOFF_MS), runSignal);
          continue;
        }

        return {
          ...result,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          attemptCount: attempt,
        };
      } catch (err: any) {
        clearTimeout(timer);
        runSignal.removeEventListener('abort', abortTask);
        const timedOutTask = timedOut && !runSignal.aborted;
        if (runSignal.aborted) {
          const timedOutOverall = runSignal.reason === 'overall_timeout';
          return this.createStoppedTaskResult(
            dimension,
            title,
            timedOutOverall ? 'failed' : 'cancelled',
            timedOutOverall ? 'Overall investigation deadline reached.' : 'Investigation cancelled.',
            timedOutOverall ? 'TIMEOUT' : 'NETWORK',
            Date.now() - startTime,
            attempt
          );
        }
        const retryableNetworkError = /network|fetch failed|socket|ECONN|reset/i.test(String(err.message || ''))
          && !/auth|401|403/i.test(String(err.message || ''));
        if (attempt < maxAttempts && (timedOutTask || retryableNetworkError) && !runSignal.aborted) {
          try {
            await abortableDelay(Math.min(retryBackoffMs * attempt, MAX_RETRY_BACKOFF_MS), runSignal);
            continue;
          } catch {
            const timedOutOverall = runSignal.reason === 'overall_timeout';
            return this.createStoppedTaskResult(
              dimension,
              title,
              timedOutOverall ? 'failed' : 'cancelled',
              timedOutOverall ? 'Overall investigation deadline reached during retry backoff.' : 'Investigation cancelled.',
              timedOutOverall ? 'TIMEOUT' : 'NETWORK',
              Date.now() - startTime,
              attempt
            );
          }
        }
        return this.createStoppedTaskResult(
          dimension,
          title,
          'failed',
          timedOutTask ? `${title} timed out after ${timeoutMs}ms.` : err.message || 'Dimension execution failed',
          timedOutTask ? 'TIMEOUT' : 'UPSTREAM_5XX',
          Date.now() - startTime,
          attempt
        );
      }
    }
    return this.createStoppedTaskResult(dimension, title, 'failed', 'Maximum task attempts exhausted.', 'UPSTREAM_5XX', Date.now() - startTime, maxAttempts);
  }

  private createStoppedTaskResult(
    dimension: RiskDimension,
    title: string,
    status: 'failed' | 'cancelled',
    errorMessage: string,
    errorCategory: ProviderErrorCategory,
    durationMs: number | null = 0,
    attemptCount = 0
  ): DimensionTaskResult {
    return {
      dimension,
      title,
      status,
      provider: 'VendorTrace Core Engine',
      startedAt: null,
      completedAt: new Date().toISOString(),
      durationMs,
      attemptCount,
      sourceCount: 0,
      errorCategory,
      errorMessage,
      findings: [],
      sourcesChecked: [],
      coverageGaps: [errorMessage],
    };
  }

  /**
   * Helper to construct failed task result
   */
  private createFailedTaskResult(
    dimension: RiskDimension,
    title: string,
    errorCategory: ProviderErrorCategory,
    errorMessage: string
  ): DimensionTaskResult {
    const now = new Date().toISOString();
    return {
      dimension,
      title,
      status: 'failed',
      provider: 'VendorTrace Core Engine',
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      sourceCount: 0,
      errorCategory,
      errorMessage,
      findings: [],
      sourcesChecked: [],
      coverageGaps: [`${title}: ${errorMessage}`],
    };
  }

  /**
   * DIMENSION A: Company Identity & MCA21 Registry Status
   */
  private async runRegistryAndGstDimension(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null; profile?: ResolvedCompanyProfile | null },
    useMock: boolean,
    mockScenario: string,
    signal: AbortSignal,
    freshRun = false
  ): Promise<DimensionTaskResult> {
    const dimension: RiskDimension = 'company_registry';
    const title = 'Company Identity & MCA21 Registry Status';
    const provider = 'IndiaCos Corporate Registry (MCA21)';
    const sourcesChecked: string[] = [];
    const findings: RiskFinding[] = [];
    const coverageGaps: string[] = [];

    if (useMock && (mockScenario === 'TIMEOUT' || mockScenario.includes('TIMEOUT'))) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (useMock && mockScenario.startsWith('PARTIAL_FAILURE') && mockScenario.includes('REGISTRY_FAIL')) {
      return {
        dimension,
        title,
        status: 'failed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'UPSTREAM_5XX',
        errorMessage: 'Simulated MCA21 registry server error 500',
        findings: [],
        sourcesChecked,
        coverageGaps: ['MCA21 corporate registry unavailable during investigation.'],
      };
    }

    // Check if IndiaCos is configured or mock requested
    const isConfigured = indiacos.isConfigured() || useMock;
    if (!isConfigured) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'INDIACOS_API_KEY is not configured in server environment secrets.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['MCA21 verification skipped: API credentials absent.'],
      };
    }

    let profile = vendor.profile;
    if (!profile && vendor.cin) {
      if (useMock) {
        profile = {
          canonicalName: vendor.canonicalName,
          cin: vendor.cin,
          gstins: vendor.gstin ? [vendor.gstin] : ['27AAACT2727Q1ZW'],
          companyStatus: 'ACTIVE',
          entityType: 'COMPANY',
          incorporationDate: '1907-08-26',
          registeredOffice: 'Bombay House, 24 Homi Mody Street, Fort, Mumbai 400001',
          sourceUrl: `https://mca.gov.in/portal/company/${vendor.cin}`,
          lastFetchedAt: new Date().toISOString(),
          identityMatchMethod: 'EXACT_CIN',
          isCached: false,
          directors: [{ din: '00000001', name: 'Natarajan Chandrasekaran', designation: 'Chairman' }],
          charges: [{ chargeId: 'CHG_01', holderName: 'State Bank of India', amountInr: 100000000, status: 'CLOSED' }],
        };
      } else {
        const lookup = await indiacos.lookupByCIN(vendor.cin, { signal, timeoutMs: DEFAULT_AGENT_TIMEOUT_MS, freshRun });
        if (lookup.success && lookup.profile) {
          profile = lookup.profile;
          sourcesChecked.push('MCA21 Company Registry via IndiaCos');
        } else if (!lookup.success) {
          if (lookup.status !== 'LIVE') {
            return {
              dimension,
              title,
              status: lookup.status === 'NOT_CONFIGURED' ? 'unavailable' : 'failed',
              provider,
              startedAt: null,
              completedAt: null,
              durationMs: null,
              sourceCount: 0,
              errorCategory: lookup.errorCategory || (lookup.status === 'AUTH_FAILED' ? 'AUTH' : 'UPSTREAM_5XX'),
              errorMessage: lookup.message || 'MCA21 lookup failed before registry evidence was returned.',
              findings: [],
              sourcesChecked: [],
              coverageGaps: [lookup.message || 'MCA21 registry evidence could not be validated.'],
            };
          }
          sourcesChecked.push('MCA21 Company Registry via IndiaCos');
          coverageGaps.push(`MCA21 CIN lookup notice: ${lookup.message || 'No direct record returned'}`);
        }
      }
    } else if (!profile && !useMock) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'INVALID_INPUT',
        errorMessage: 'A CIN or validated registry profile is required for MCA21 verification.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['MCA21 verification unavailable: no CIN or validated registry profile was supplied.'],
      };
    } else if (profile) {
      sourcesChecked.push('MCA21 Company Registry profile');
    }

    const now = new Date().toISOString();

    if (profile) {
      const isDormantOrDefunct = ['STRIKE_OFF', 'UNDER_LIQUIDATION', 'DORMANT', 'AMALGAMATED'].includes(profile.companyStatus);
      const severity = isDormantOrDefunct ? 5 : 1;
      const severityExplanation = isDormantOrDefunct
        ? `Entity registry status is '${profile.companyStatus}', indicating severe corporate incapacity or dissolution.`
        : 'IndiaCos returned an active company status. This is informational registry data and does not establish that all corporate compliance checks passed.';

      const evItem: EvidenceItem = {
        sourceName: 'IndiaCos Company Registry (MCA record)',
        sourceTitle: 'Company status returned by IndiaCos',
        publisher: profile.sourceUrl && validateUrl(profile.sourceUrl).normalizedUrl ? new URL(profile.sourceUrl).hostname : 'indiacos.com',
        sourceDomain: profile.sourceUrl && validateUrl(profile.sourceUrl).normalizedUrl ? new URL(profile.sourceUrl).hostname : 'indiacos.com',
        url: profile.sourceUrl || null,
        snippet: `IndiaCos returned company '${profile.canonicalName}' with status '${profile.companyStatus}'. Registered office: ${profile.registeredOffice || 'not returned'}.`,
        publishedAt: profile.sourceUpdatedAt || null,
        capturedAt: profile.lastFetchedAt || now,
        underlyingSource: 'IndiaCos company lookup response; MCA registry data provider',
        identityMatchNote: profile.cin ? `Exact 21-character Corporate Identification Number match: ${profile.cin}` : 'Entity Name match',
        legalStatus: isDormantOrDefunct ? 'confirmed' : null,
      };

      const finding = validateRiskFinding({
        dimension: 'company_registry',
        title: isDormantOrDefunct ? `Company Registration Marked as ${profile.companyStatus}` : 'Company Status Returned by IndiaCos',
        neutralSummary: `IndiaCos company lookup returned ${profile.canonicalName} with status '${profile.companyStatus}'. This is a registry data result, not a direct VendorTrace connection to MCA21.`,
        status: isDormantOrDefunct ? 'signal_found' : 'inconclusive',
        severity,
        severityExplanation,
        evidence: [evItem],
        confidence: 'single_source_review',
        recommendedReviewAction: isDormantOrDefunct
          ? 'Halt procurement onboarding until legal counsel verifies dissolution or striking-off orders.'
          : 'Verify current statutory filings separately; this result reports company status returned by IndiaCos only.',
        missingDataReason: profile.cin ? null : 'Entity investigated without confirmed CIN/LLPIN.',
      });

      findings.push(finding);
    } else {
      findings.push(
        validateRiskFinding({
          dimension: 'company_registry',
          title: 'Uncorroborated Registry Presence in MCA21',
          neutralSummary: `Registry search for '${vendor.canonicalName}' did not yield an active canonical CIN match in the checked MCA21 index.`,
          status: 'inconclusive',
          severity: 2,
          severityExplanation: 'Absence of exact CIN match prevents definitive automated corporate status verification.',
          evidence: [
            {
              sourceName: 'MCA21 Search Query',
              sourceDomain: 'mca.gov.in',
              url: null,
              snippet: `Automated index search on '${vendor.canonicalName}' returned no single definitive corporate profile.`,
              publishedAt: null,
              capturedAt: now,
              underlyingSource: 'MCA21 Index Search',
              identityMatchNote: 'Query string match basis',
            },
          ],
          confidence: 'insufficient_evidence',
          recommendedReviewAction: 'Request verified Certificate of Incorporation (CoI) and Corporate Identification Number (CIN) from vendor.',
          missingDataReason: 'No matching 21-character CIN provided or resolved.',
        })
      );
    }

    return {
      dimension,
      title,
      status: 'completed',
      provider,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      sourceCount: sourcesChecked.length,
      errorCategory: null,
      errorMessage: null,
      findings,
      sourcesChecked,
      coverageGaps,
    };
  }

  /**
   * DIMENSION B: GST Compliance & Tax Standing
   */
  private async runGstComplianceDimension(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null; profile?: ResolvedCompanyProfile | null },
    useMock: boolean,
    mockScenario: string,
    signal: AbortSignal,
    freshRun = false
  ): Promise<DimensionTaskResult> {
    const dimension: RiskDimension = 'gst_compliance';
    const title = 'GST Filing & Tax Jurisdiction Compliance';
    const provider = 'IndiaCos GSTN Gateway';
    const sourcesChecked: string[] = [];
    const findings: RiskFinding[] = [];
    const coverageGaps: string[] = [];

    const isConfigured = indiacos.isConfigured() || useMock;
    if (!isConfigured) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'INDIACOS_API_KEY is not configured for GSTN verification.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['GST tax compliance verification unperformed: connector not configured.'],
      };
    }

    let gstin = vendor.gstin || (vendor.profile?.gstins && vendor.profile.gstins[0]) || null;
    if (!gstin && vendor.cin && !useMock) {
      const registryLookup = await indiacos.lookupByCIN(vendor.cin, { signal, timeoutMs: DEFAULT_AGENT_TIMEOUT_MS, freshRun });
      gstin = registryLookup.success ? registryLookup.profile?.gstins?.[0] || null : null;
      if (gstin) sourcesChecked.push('IndiaCos company record used to resolve vendor GSTIN');
    }
    const now = new Date().toISOString();

    if (gstin) {
      let gstStatus = 'Active';
      let sourceUrl = 'https://services.gst.gov.in/services/searchtp';

      if (!useMock) {
        const gstRes = await indiacos.lookupByGSTIN(gstin, { signal, timeoutMs: DEFAULT_AGENT_TIMEOUT_MS, freshRun });
        if (gstRes.success && gstRes.profile) {
          gstStatus = gstRes.profile.companyStatus || 'Active';
          sourceUrl = gstRes.profile.sourceUrl || sourceUrl;
          sourcesChecked.push('GSTN Taxpayer Registry via IndiaCos');
        } else {
          return {
            dimension,
            title,
            status: gstRes.status === 'NOT_CONFIGURED' ? 'unavailable' : 'failed',
            provider,
            startedAt: null,
            completedAt: null,
            durationMs: null,
            sourceCount: 0,
            errorCategory: gstRes.errorCategory || (gstRes.status === 'AUTH_FAILED' ? 'AUTH' : 'UPSTREAM_5XX'),
            errorMessage: gstRes.message || 'GSTN lookup did not return validated registry data.',
            findings: [],
            sourcesChecked: [],
            coverageGaps: [gstRes.message || `GSTN verification failed for ${gstin}.`],
          };
        }
      } else {
        sourcesChecked.push('Synthetic GSTN fixture');
      }

      const isCanceled = gstStatus.toLowerCase().includes('cancel') || gstStatus.toLowerCase().includes('suspended');
      const severity = isCanceled ? 4 : 1;
      const severityExplanation = isCanceled
        ? `GSTIN '${gstin}' status is listed as '${gstStatus}', presenting substantial input tax credit (ITC) risk.`
        : `IndiaCos returned GSTIN '${gstin}' with status '${gstStatus}'. Return filing completeness was not independently verified by this task.`;

      const ev: EvidenceItem = {
        sourceName: 'IndiaCos GST Registration Lookup',
        sourceDomain: validateUrl(sourceUrl).normalizedUrl ? new URL(sourceUrl).hostname : 'indiacos.com',
        url: sourceUrl,
        snippet: `GSTIN ${gstin} status: ${gstStatus}. Registered under ${vendor.canonicalName}.`,
        publishedAt: null,
        capturedAt: now,
        underlyingSource: 'IndiaCos GST registration response; GST portal sourced data',
        identityMatchNote: `Exact 15-character GSTIN match: ${gstin}`,
      };

      const finding = validateRiskFinding({
        dimension: 'gst_compliance',
        title: isCanceled ? 'GST Registration Cancelled or Suspended' : 'Active GST Registration Verified',
        neutralSummary: `Official GSTN records confirm tax registration ${gstin} for ${vendor.canonicalName} is currently '${gstStatus}'.`,
        status: isCanceled ? 'signal_found' : 'no_signal_found_in_checked_sources',
        severity,
        severityExplanation,
        evidence: [ev],
        confidence: 'single_source_review',
        recommendedReviewAction: isCanceled
          ? 'Request immediate clarification and GSTR-3B return filing proofs before releasing vendor payment.'
          : 'Cross-verify latest GSTR-1 and GSTR-3B return filing frequency prior to PO generation.',
        missingDataReason: null,
      });

      findings.push(finding);
    } else {
      if (!useMock) {
        return {
          dimension,
          title,
          status: 'unavailable',
          provider,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          sourceCount: 0,
          errorCategory: 'INVALID_INPUT',
          errorMessage: 'A GSTIN is required for GST compliance verification. IndiaCos returned no verified GSTIN for this company, and none was supplied.',
          findings: [],
          sourcesChecked: [],
          coverageGaps: ['GST compliance verification was not run: IndiaCos returned no verified GSTIN and none was supplied. Required action: provide and select a valid 15-character GSTIN, then rerun.'],
        };
      }
      findings.push(
        validateRiskFinding({
          dimension: 'gst_compliance',
          title: 'No GSTIN Linked for Tax Verification',
          neutralSummary: `No Goods and Services Tax Identification Number (GSTIN) was provided or resolved for ${vendor.canonicalName}.`,
          status: 'inconclusive',
          severity: 2,
          severityExplanation: 'Without a 15-character GSTIN, automated tax compliance checks cannot be completed.',
          evidence: [
            {
              sourceName: 'Vendor Intake Data',
              sourceDomain: 'vendortrace.internal',
              url: null,
              snippet: 'Entity onboarding intake did not specify a registered GSTIN.',
              publishedAt: null,
              capturedAt: now,
              underlyingSource: 'Intake Payload',
              identityMatchNote: 'Absence of tax identifier',
            },
          ],
          confidence: 'insufficient_evidence',
          recommendedReviewAction: 'Require vendor to furnish valid state-level GSTIN certificate before vendor approval.',
          missingDataReason: 'No GSTIN identifier provided in investigation payload.',
        })
      );
    }

    return {
      dimension,
      title,
      status: 'completed',
      provider,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      sourceCount: sourcesChecked.length,
      errorCategory: null,
      errorMessage: null,
      findings,
      sourcesChecked,
      coverageGaps,
    };
  }

  /**
   * DIMENSION C: Court & Commercial Litigation
   */
  private async runLitigationDimension(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null },
    useMock: boolean,
    mockScenario: string,
    signal: AbortSignal,
    freshRun = false
  ): Promise<DimensionTaskResult> {
    const dimension: RiskDimension = 'court_litigation';
    const title = 'E-Courts, Tribunals & Commercial Litigation';
    const provider = 'IndiaCos Case API / TinyFish Legal Search';
    const sourcesChecked: string[] = [];
    const findings: RiskFinding[] = [];
    const coverageGaps: string[] = [];

    if (useMock && (mockScenario === 'TIMEOUT' || mockScenario.includes('TIMEOUT'))) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (useMock && mockScenario.startsWith('PARTIAL_FAILURE') && mockScenario.includes('LITIGATION_FAIL')) {
      return {
        dimension,
        title,
        status: 'failed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'UPSTREAM_5XX',
        errorMessage: 'Litigation data source connection timed out',
        findings: [],
        sourcesChecked,
        coverageGaps: ['E-Courts portal connector experienced timeout.'],
      };
    }

    const now = new Date().toISOString();

    // Mock scenario handling for testing
    if (useMock) {
      if (mockScenario === 'NO_RESULTS') {
        findings.push(
          validateRiskFinding({
            dimension: 'court_litigation',
            title: 'No Material Litigation Records Found in Checked Dockets',
            neutralSummary: `Public dockets for E-Courts and NCLT were searched for '${vendor.canonicalName}'. No active insolvency, winding-up, or material recovery proceedings were identified.`,
            status: 'no_signal_found_in_checked_sources',
            severity: 1,
            severityExplanation: 'Absence of matching case records in primary commercial and company law tribunals.',
            evidence: [
              {
                sourceName: 'National E-Courts Docket Search',
                sourceDomain: 'services.ecourts.gov.in',
                url: 'https://services.ecourts.gov.in',
                snippet: `Automated docket query on '${vendor.canonicalName}' yielded zero pending NCLT or High Court commercial suits.`,
                publishedAt: null,
                capturedAt: now,
                underlyingSource: 'E-Courts CNR Registry',
                identityMatchNote: 'Exact party name search',
              },
            ],
            confidence: 'single_source_review',
            recommendedReviewAction: 'Standard commercial contract indemnity provisions are adequate.',
            missingDataReason: null,
          })
        );
      } else {
        // Normal test finding: distinct procedural stage (e.g. dismissed or pending allegation)
        findings.push(
          validateRiskFinding({
            dimension: 'court_litigation',
            title: 'Historic Commercial Dispute (Disposed / Settled)',
            neutralSummary: `Procedural records indicate a commercial contractual dispute (Civil Suit CS/2021/482) before the High Court involving ${vendor.canonicalName} was officially disposed and settled by consent terms.`,
            status: 'signal_found',
            severity: 2,
            severityExplanation: 'Matter is formally disposed / settled without pending adverse orders or ongoing insolvency risk.',
            evidence: [
              {
                sourceName: 'High Court Commercial Division',
                sourceDomain: 'bombayhighcourt.nic.in',
                url: 'https://bombayhighcourt.nic.in/orders/CS-2021-482.pdf',
                snippet: 'Consent terms recorded between the parties. Matter disposed with no further claims surviving.',
                publishedAt: '2022-04-10T12:00:00.000Z',
                capturedAt: now,
                underlyingSource: 'Official High Court Order Docket',
                identityMatchNote: `Party 1 matches '${vendor.canonicalName}'`,
                legalStatus: 'settled',
              },
            ],
            confidence: 'single_source_review',
            recommendedReviewAction: 'Confirm with legal records that settlement obligations were completed.',
            missingDataReason: null,
          })
        );
      }

      return {
        dimension,
        title,
        status: 'completed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: sourcesChecked.length,
        errorCategory: null,
        errorMessage: null,
        findings,
        sourcesChecked,
        coverageGaps,
      };
    }

    // LIVE EXECUTION PATH
    // 1. First check if IndiaCos case lookup is available
    let liveCases: import('../providers/types.js').LitigationCaseItem[] = [];
    let searchCompleted = false;
    let indiacosCaseLookupCompleted = false;
    const aggregateCaseResults: string[] = [];
    if (indiacos.isConfigured() && (vendor.cin || vendor.gstin) && typeof (indiacos as any).lookupCases === 'function') {
      try {
        const lookups = [
          ...(vendor.cin ? [{ id: vendor.cin, type: 'CIN' as const }] : []),
          ...(vendor.gstin ? [{ id: vendor.gstin, type: 'GSTIN' as const }] : []),
        ];
        for (const lookup of lookups) {
          const caseRes = await indiacos.lookupCases(lookup.id, { signal, timeoutMs: DEFAULT_AGENT_TIMEOUT_MS, identifierType: lookup.type, freshRun });
          if (caseRes.success) {
            searchCompleted = true;
            indiacosCaseLookupCompleted = true;
            sourcesChecked.push(`IndiaCos ${lookup.type} court-case data`);
            liveCases.push(...(caseRes.cases || []));
            if (!caseRes.cases?.length && caseRes.summary) {
              const counts = [
                caseRes.summary.respondentTotal !== undefined ? `${caseRes.summary.respondentTotal} respondent cases` : '',
                caseRes.summary.respondentPending !== undefined ? `${caseRes.summary.respondentPending} pending respondent cases` : '',
                caseRes.summary.petitionerTotal !== undefined ? `${caseRes.summary.petitionerTotal} petitioner cases` : '',
              ].filter(Boolean);
              if (counts.length) aggregateCaseResults.push(`${lookup.type}: ${counts.join(', ')}`);
            }
          } else {
            coverageGaps.push(`IndiaCos ${lookup.type} case lookup unavailable: ${caseRes.message || caseRes.status}.`);
          }
        }
      } catch (err: any) {
        coverageGaps.push(`IndiaCos structured case lookup failed: ${err.message}`);
      }
    }

    // 2. If no cases from IndiaCos, query TinyFish litigation search
    if (!indiacosCaseLookupCompleted && liveCases.length === 0 && tinyfish.isConfigured() && typeof (tinyfish as any).searchLitigationContext === 'function') {
      try {
        const tfRes = await tinyfish.searchLitigationContext(vendor.canonicalName, {
          limit: 3,
          signal,
          timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
        });
        if (tfRes.success) {
          searchCompleted = true;
          sourcesChecked.push('TinyFish Search API (litigation query)');
          coverageGaps.push('Direct E-Courts and tribunal docket integrations are unavailable; search-index coverage is not a court registry verification.');
        }
        if (tfRes.success && tfRes.articles && tfRes.articles.length > 0) {
          for (const art of tfRes.articles) {
            liveCases.push({
              caseTitle: art.title,
              status: 'unknown',
              snippet: art.snippet,
              sourceUrl: art.url,
            });
          }
        }
      } catch (err: any) {
        coverageGaps.push(`TinyFish legal search notice: ${err.message}`);
      }
    }

    if (liveCases.length === 0 && !searchCompleted) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'No configured provider returned litigation search results.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['Court and tribunal sources are unavailable; no live provider query completed.'],
      };
    }

    if (liveCases.length === 0 && searchCompleted) {
      coverageGaps.push(aggregateCaseResults.length
        ? `IndiaCos returned aggregate case counts without case-level records (${aggregateCaseResults.join('; ')}); source case details require manual review.`
        : 'No case records were returned by the queried identifiers and search index; this is not proof that no litigation exists.');
    }

    if (liveCases.length > 0) {
      const uniqueCases = deduplicateLitigationCases(liveCases);
      const usableCases = uniqueCases.filter((item) => item.caseId || item.caseNumber || (item.courtName && (item.parties?.length || item.petitioner || item.respondent)));
      const omittedWithoutDetails = uniqueCases.length - usableCases.length;
      if (uniqueCases.length < liveCases.length) coverageGaps.push(`${liveCases.length - uniqueCases.length} exact duplicate case record(s) were collapsed using provider IDs or case number, court, and parties.`);
      if (omittedWithoutDetails > 0) coverageGaps.push(`${omittedWithoutDetails} case row(s) without case-specific identifying details were omitted.`);
      if (usableCases.some((item) => !(item.sourceUrl && (item.caseId || item.caseNumber) && (item.parties?.length || item.petitioner || item.respondent)))) {
        coverageGaps.push('Some court-case candidates lack complete case-level source provenance and require human review.');
      }
      for (const item of usableCases) {
        const parts = [
          item.caseId ? `Case ID: ${item.caseId}` : '',
          item.caseNumber ? `Case number: ${item.caseNumber}` : '',
          item.courtName ? `Court: ${item.courtName}` : '',
          item.petitioner ? `Petitioner: ${item.petitioner}` : '',
          item.respondent ? `Respondent: ${item.respondent}` : '',
          item.matchedParty ? `Matched party: ${item.matchedParty}` : '',
          item.parties?.length && !item.petitioner && !item.respondent ? `Parties: ${item.parties.join('; ')}` : '',
          item.status !== 'unknown' ? `Status: ${item.status}` : '',
          item.caseDate ? `Date: ${item.caseDate}` : '',
          item.caseTitle ? `Title: ${item.caseTitle}` : '',
          item.snippet || '',
        ].filter(Boolean);
        const candidateSourceUrl = item.sourceUrl && validateUrl(item.sourceUrl).normalizedUrl ? validateUrl(item.sourceUrl).normalizedUrl : null;
        const sourceUrl = isCaseSpecificSourceUrl(candidateSourceUrl, item.caseNumber, item.caseId) ? candidateSourceUrl : null;
        const completeProvenance = Boolean(sourceUrl && (item.caseId || item.caseNumber) && (item.parties?.length || item.petitioner || item.respondent));
        const finding = validateRiskFinding({
          dimension: 'court_litigation',
          title: `Unverified Court Case Candidate${item.caseNumber ? `: ${item.caseNumber}` : item.caseId ? `: ${item.caseId}` : item.caseTitle ? `: ${item.caseTitle}` : ''}`,
          neutralSummary: `IndiaCos returned a court-case candidate associated by name with ${vendor.canonicalName}. The provider documents that name matches do not confirm identity; this is not a verified risk signal or a finding of wrongdoing.`,
          status: 'inconclusive',
          severity: 1,
          severityExplanation: 'A provider name association alone does not verify the target entity or establish adverse conduct.',
          evidence: [
            {
              sourceName: sourcesChecked.some((source) => source.startsWith('IndiaCos')) ? 'IndiaCos Court Case Data' : 'TinyFish Litigation Search Result',
              sourceTitle: item.caseTitle || item.caseNumber || item.caseId || 'Court case candidate',
              publisher: sourceUrl ? new URL(sourceUrl).hostname : 'IndiaCos / search provider',
              sourceDomain: sourceUrl ? new URL(sourceUrl).hostname : 'indiacos.com',
              url: sourceUrl,
              snippet: parts.join(' | '),
              publishedAt: null,
              capturedAt: now,
              underlyingSource: sourcesChecked.some((source) => source.startsWith('IndiaCos'))
                ? 'IndiaCos court-case summary; name match is not confirmed identity and this is not a direct connection to every court or tribunal'
                : 'TinyFish search result; not an official court docket record',
              identityMatchNote: completeProvenance
                ? 'IndiaCos returned a case candidate by name; confirm the named party against the target legal identity.'
                : !sourceUrl
                  ? 'No case-specific source URL was supplied; this candidate is unverified and requires human review.'
                  : 'Case-level provenance or party details are incomplete; unverified candidate requiring human review.',
              caseId: item.caseId,
              caseTitle: item.caseTitle,
              caseNumber: item.caseNumber,
              caseCourt: item.courtName,
              casePetitioner: item.petitioner,
              caseRespondent: item.respondent,
              caseParties: item.parties?.join('; '),
              caseMatchedParty: item.matchedParty,
              caseStatus: item.status === 'unknown' ? undefined : item.status,
              caseDate: item.caseDate,
            },
          ],
          confidence: 'insufficient_evidence',
          recommendedReviewAction: 'Manually verify the docket, named parties, case status, source record, and exact vendor identity before treating this as a relevant case.',
          missingDataReason: completeProvenance ? 'IndiaCos case results are name matches and require exact identity verification.' : 'Case-level source URL, reference number, or party details were not all returned.',
        });

        findings.push(finding);
      }
    }

    return {
      dimension,
      title,
      status: 'completed',
      provider,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      sourceCount: sourcesChecked.length,
      errorCategory: null,
      errorMessage: null,
      findings,
      sourcesChecked,
      coverageGaps,
    };
  }

  /**
   * DIMENSION C: Government Debarment, Blacklist & Regulatory Penalties
   */
  private async runDebarmentDimension(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null; pan?: string | null; identifiers?: string[]; profile?: ResolvedCompanyProfile | null },
    useMock: boolean,
    mockScenario: string,
    signal: AbortSignal,
    freshRun = false
  ): Promise<DimensionTaskResult> {
    const dimension: RiskDimension = 'blacklist_debarment';
    const title = 'Government Procurement Debarment & Regulatory Penalties';
    const provider = 'TinyFish Search API + Fetch API';
    const sourcesChecked: string[] = [];
    const findings: RiskFinding[] = [];
    const coverageGaps: string[] = [];

    if (useMock && (mockScenario === 'TIMEOUT' || mockScenario.includes('TIMEOUT'))) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (useMock && mockScenario.startsWith('PARTIAL_FAILURE') && mockScenario.includes('DEBARMENT_FAIL')) {
      return {
        dimension,
        title,
        status: 'failed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'TIMEOUT',
        errorMessage: 'Debarment verification portal timed out after 8000ms',
        findings: [],
        sourcesChecked,
        coverageGaps: ['Government e-Marketplace debarment register was unreachable.'],
      };
    }

    const now = new Date().toISOString();

    if (useMock) {
      if (mockScenario === 'NO_RESULTS') {
        findings.push(
          validateRiskFinding({
            dimension: 'blacklist_debarment',
            title: 'No Debarment or Blacklist Records Found in Checked Sources',
            neutralSummary: `Public procurement debarment rosters on GeM, CVC, and international development bank registers were audited for '${vendor.canonicalName}'. Zero active debarment or disqualification orders were located.`,
            status: 'no_signal_found_in_checked_sources',
            severity: 1,
            severityExplanation: 'Entity is not listed on central government debarment rosters in checked sources.',
            evidence: [
              {
                sourceName: 'GeM Incident & Debarment Register',
                sourceDomain: 'gem.gov.in',
                url: 'https://gem.gov.in',
                snippet: `Zero active debarment records found for party name: ${vendor.canonicalName}.`,
                publishedAt: null,
                capturedAt: now,
                underlyingSource: 'Government e-Marketplace Debarment Portal',
                identityMatchNote: 'Entity name query',
              },
            ],
            confidence: 'multiple_independent_sources',
            recommendedReviewAction: 'No procurement embargo indicated. Re-audit periodically prior to major tender awards.',
            missingDataReason: null,
          })
        );
      } else {
        // Verified clean record across multiple sources
        findings.push(
          validateRiskFinding({
            dimension: 'blacklist_debarment',
            title: 'No Debarment Records Found Across Checked Public Registers',
            neutralSummary: `Searches across GeM, CVC, and World Bank lists confirmed no current debarment or sanction records for ${vendor.canonicalName}.`,
            status: 'no_signal_found_in_checked_sources',
            severity: 1,
            severityExplanation: 'Absence of debarment notices across central registers.',
            evidence: [
              {
                sourceName: 'Government e-Marketplace',
                sourceDomain: 'gem.gov.in',
                url: 'https://gem.gov.in',
                snippet: `GeM seller verification check returned zero active administrative debarment orders for ${vendor.canonicalName}.`,
                publishedAt: null,
                capturedAt: now,
                underlyingSource: 'GeM Vendor Registry',
                identityMatchNote: 'Exact party name check',
              },
              {
                sourceName: 'World Bank Debarred Firms List',
                sourceDomain: 'worldbank.org',
                url: 'https://worldbank.org/en/projects-operations/procurement/debarred-firms',
                snippet: `Cross-border cross-debarment listing audit returned clean standing for ${vendor.canonicalName}.`,
                publishedAt: null,
                capturedAt: now,
                underlyingSource: 'World Bank Listing of Ineligible Firms',
                identityMatchNote: 'Exact party name check',
              },
            ],
            confidence: 'multiple_independent_sources',
            recommendedReviewAction: 'Verify that vendor is not subject to state-specific department blacklisting if bidding on regional tenders.',
            missingDataReason: null,
          })
        );
      }

      return {
        dimension,
        title,
        status: 'completed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: sourcesChecked.length,
        errorCategory: null,
        errorMessage: null,
        findings,
        sourcesChecked,
        coverageGaps,
      };
    }

    // LIVE EXECUTION PATH
    const isTinyFishConfigured = tinyfish.isConfigured();
    if (!isTinyFishConfigured) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'TINYFISH_API_KEY is not configured for web agent verification.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['Procurement blacklist check skipped: TINYFISH_API_KEY missing.'],
        evidenceSearchOutcome: 'SOURCE_UNAVAILABLE',
        manualReviewRequired: true,
      };
    }

    try {
      const identifiers = [
        ...(vendor.identifiers || []),
        vendor.cin,
        vendor.gstin,
        vendor.pan,
        vendor.profile?.cin,
        vendor.profile?.llpin,
        vendor.profile?.pan,
        ...(vendor.profile?.gstins || []),
      ].filter((value): value is string => Boolean(value?.trim()));
      const searchRes: WebInvestigationSearchResult = typeof tinyfish.searchDebarment === 'function'
        ? await tinyfish.searchDebarment(vendor.canonicalName, {
            limit: 5,
            identifiers,
            signal,
            freshRun,
            timeoutMs: Math.min(DEFAULT_AGENT_TIMEOUT_MS, 10000),
          })
        : { success: false, status: 'NOT_CONFIGURED' as const, articles: [], message: 'Debarment search provider is unavailable.', errorCategory: null, isMock: false };

      if (!searchRes.success) {
        return {
          dimension,
          title,
          status: searchRes.status === 'NOT_CONFIGURED' ? 'unavailable' : 'failed',
          provider,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          sourceCount: 0,
          errorCategory: searchRes.errorCategory || (searchRes.status === 'AUTH_FAILED' ? 'AUTH' : 'UPSTREAM_5XX'),
          errorMessage: searchRes.message || 'Debarment search did not complete.',
          findings: [],
          sourcesChecked: [],
          coverageGaps: [searchRes.message || 'Debarment search unavailable.'],
          evidenceSearchOutcome: 'SOURCE_UNAVAILABLE',
          evidenceSearchQuery: searchRes.query,
          manualReviewRequired: true,
        };
      }
      sourcesChecked.push('TinyFish Search API (official sources first)');
      if ((searchRes.articles || []).length > 0) sourcesChecked.push('TinyFish Fetch API (bounded source retrieval)');
      const records = searchRes.articles || [];
      const normalizedName = vendor.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      const normalizedContent = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const searchTerms = /debar|black\s*list|suspend|suspens|ineligible|disqualif|ban(ned)?/i;
      const entityMatches = records.map((rec) => {
        const content = `${rec.title}\n${rec.snippet}`;
        const compactContent = normalizedContent(content);
        const exactIdentifier = identifiers.find((identifier) => compactContent.includes(normalizedContent(identifier)));
        const compactName = normalizedContent(normalizedName);
        const exactName = compactName.length >= 5 && compactContent.includes(compactName);
        const relevantRecord = searchTerms.test(content);
        const rationale = exactIdentifier
          ? `Exact identifier ${exactIdentifier} appears in fetched source content.`
          : exactName
          ? identifiers.length > 0
            ? `Exact vendor name appears, but no supplied identifier confirms this is the same entity.`
            : 'Exact full vendor name appears; no registry identifier was available to disambiguate identity.'
          : 'Fetched source did not contain the exact vendor name or a supplied identifier.';
        return { rec, exactIdentifier, exactName, relevantRecord, rationale };
      });
      const matched = entityMatches.filter((entry) => entry.rec.directSourceAvailable !== false
        && Boolean(entry.rec.retrievedAt)
        && entry.relevantRecord
        && Boolean(entry.exactIdentifier));
      const ambiguous = entityMatches.filter((entry) => entry.rec.directSourceAvailable !== false
        && Boolean(entry.rec.retrievedAt)
        && entry.relevantRecord
        && !entry.exactIdentifier);
      const inaccessibleRecords = records.filter((record) => record.directSourceAvailable === false || !record.retrievedAt);
      const retrievedAt = now;
      let evidenceSearchOutcome: 'MATCH_FOUND' | 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES' | 'SOURCE_UNAVAILABLE';
      let manualReviewRequired = true;

      if (matched.length > 0) {
        evidenceSearchOutcome = 'MATCH_FOUND';
        for (const entry of matched) {
          const { rec, rationale } = entry;
          findings.push(validateRiskFinding({
            dimension,
            title: rec.title || 'Procurement debarment or suspension source match',
            neutralSummary: `A debarment-related source containing an exact vendor identity signal was found for ${vendor.canonicalName}; manual review is required before relying on it.`,
            status: 'signal_found',
            severity: 5,
            severityExplanation: 'A fetched source contains both a debarment-related term and an exact vendor identity signal.',
            evidence: [{
              sourceName: rec.title || rec.sourceDomain,
              sourceTitle: rec.title || 'Procurement debarment source',
              publisher: rec.sourceDomain,
              sourceDomain: rec.sourceDomain,
              url: rec.directSourceAvailable === false ? null : rec.url,
              searchResultUrl: rec.directSourceAvailable === false ? rec.url : undefined,
              sourceFetchError: rec.sourceFetchError,
              snippet: rec.directSourceAvailable === false ? '' : rec.snippet.slice(0, 500),
              publishedAt: rec.publishedDate || null,
              capturedAt: rec.retrievedAt || retrievedAt,
              underlyingSource: rec.title,
              identityMatchNote: rec.directSourceAvailable === false ? rec.identityMatchNote || 'Source fetch failed; target identity and a substantive finding remain unverified.' : rationale,
              searchQuery: rec.query || searchRes.query,
              expandedText: rec.expandedText,
            }],
            confidence: 'single_source_review',
            recommendedReviewAction: 'Manually inspect the original order and confirm identity, scope, dates, and current validity before making a procurement decision.',
            missingDataReason: null,
          }));
        }
      } else if (ambiguous.length > 0 || inaccessibleRecords.length > 0 || (searchRes.sourceErrors || []).length > 0 || (records.length > 0 && records.every((record) => !record.snippet.trim()))) {
        evidenceSearchOutcome = 'SOURCE_UNAVAILABLE';
        coverageGaps.push(ambiguous.length > 0
          ? 'A fetched source contains debarment-related content without an exact vendor identifier match; manual review is required.'
          : inaccessibleRecords.length > 0
            ? `${inaccessibleRecords.length} search result(s) could not be fetched; search-result text was not treated as evidence. Manual review is required.`
            : 'One or more relevant sources could not be retrieved; partial results are preserved for manual review.');
      } else {
        evidenceSearchOutcome = 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES';
        coverageGaps.push(records.length === 0
          ? 'TinyFish Search API returned no relevant pages; this is not evidence of a clean debarment record.'
          : 'No exact entity match with debarment-related content was found in the bounded set of fetched search results; this is not a clean-record verification.');
      }

      if (searchRes.sourceErrors?.length) {
        coverageGaps.push(`${searchRes.sourceErrors.length} search/fetch source request(s) were inaccessible; manual review is required.`);
      }
      if (findings.length === 0) {
        const evidence: EvidenceItem[] = records.slice(0, 5).map((rec) => {
          const entry = entityMatches.find((candidate) => candidate.rec.url === rec.url);
          const sourceError = searchRes.sourceErrors?.find((item) => item.url === rec.url);
          return {
            sourceName: rec.title || rec.sourceDomain,
            sourceTitle: rec.title || 'Procurement source search result',
            publisher: rec.sourceDomain,
            sourceDomain: rec.sourceDomain,
            url: rec.directSourceAvailable === false ? null : rec.url,
            searchResultUrl: rec.directSourceAvailable === false ? rec.url : undefined,
            sourceFetchError: rec.sourceFetchError || (sourceError ? sourceError.error : undefined),
            snippet: rec.directSourceAvailable === false ? '' : rec.snippet.slice(0, 500) || (sourceError ? '' : 'No readable source excerpt was returned.'),
            publishedAt: rec.publishedDate || null,
            capturedAt: rec.retrievedAt || retrievedAt,
            underlyingSource: rec.title,
            identityMatchNote: rec.directSourceAvailable === false
              ? rec.identityMatchNote || 'Source fetch failed; target identity and a substantive finding remain unverified.'
              : entry?.rationale || 'No source record was available to match against the vendor.',
            searchQuery: rec.query || searchRes.query,
            expandedText: rec.expandedText,
          };
        });
        if (evidence.length === 0) evidence.push({
          sourceName: 'TinyFish Search API',
          sourceTitle: 'TinyFish Search API result',
          publisher: 'api.search.tinyfish.ai',
          sourceDomain: 'api.search.tinyfish.ai',
          url: null,
          snippet: evidenceSearchOutcome === 'NO_MATCH_FOUND_IN_SEARCHED_SOURCES'
            ? 'No relevant search results were returned for the query. This does not establish clean standing.'
            : (searchRes.sourceErrors || []).map((item) => item.error).join('; ') || 'No readable source content was available.',
          publishedAt: null,
          capturedAt: retrievedAt,
          underlyingSource: 'TinyFish Search and Fetch response',
          identityMatchNote: 'A negative search result is limited to the sources and results actually searched.',
          searchQuery: searchRes.query,
        });
        findings.push(validateRiskFinding({
          dimension,
          title: evidenceSearchOutcome === 'SOURCE_UNAVAILABLE' ? 'Debarment Search Requires Manual Review' : 'No Debarment Match Found in Searched Sources',
          neutralSummary: evidenceSearchOutcome === 'SOURCE_UNAVAILABLE'
            ? `The source content could not establish whether the result concerns ${vendor.canonicalName}. No conclusion about clean standing is made.`
            : `No matching debarment record was found in the bounded sources searched for ${vendor.canonicalName}. This is not a verified clean record.`,
          status: evidenceSearchOutcome === 'SOURCE_UNAVAILABLE' ? 'source_unavailable' : 'inconclusive',
          severity: 2,
          severityExplanation: 'Search-index and bounded fetched-source coverage cannot certify absence from all procurement registries.',
          evidence,
          confidence: 'insufficient_evidence',
          recommendedReviewAction: 'Manually check the original GeM, CVC, and relevant procuring authority records.',
          missingDataReason: 'Search evidence does not constitute a complete official registry clearance.',
        }));
      }

      return {
        dimension,
        title,
        status: 'completed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: sourcesChecked.length,
        errorCategory: null,
        errorMessage: null,
        findings,
        sourcesChecked,
        coverageGaps,
        evidenceSearchOutcome,
        evidenceSearchQuery: searchRes.query,
        manualReviewRequired,
      };
    } catch (err: any) {
      return {
        dimension,
        title,
        status: 'failed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'UPSTREAM_5XX',
        errorMessage: err.message || 'Debarment search failed.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: [`Debarment search encountered error: ${err.message || 'Provider failure'}`],
        evidenceSearchOutcome: 'SOURCE_UNAVAILABLE',
        manualReviewRequired: true,
      };
    }
  }

  /**
   * DIMENSION D: Adverse Media & Negative News Coverage
   */
  private async runNegativeNewsDimension(
    vendor: { canonicalName: string; cin?: string | null; gstin?: string | null; pan?: string | null; profile?: ResolvedCompanyProfile | null },
    useMock: boolean,
    mockScenario: string,
    signal: AbortSignal,
    freshRun = false
  ): Promise<DimensionTaskResult> {
    const dimension: RiskDimension = 'negative_news';
    const title = 'Negative News & Adverse Regulatory Coverage';
    const provider = 'TinyFish Search & Web Agent';
    const sourcesChecked: string[] = [];
    const findings: RiskFinding[] = [];
    const coverageGaps: string[] = [];

    const now = new Date().toISOString();

    if (useMock) {
      if (mockScenario === 'DUPLICATE_EVIDENCE') {
        // Synthetic test with duplicate URLs and syndicated press release repetition
        const duplicateEvidence: EvidenceItem[] = [
          {
            sourceName: 'Press Trust of India Wire',
            sourceDomain: 'ptinews.com',
            url: 'https://ptinews.com/news/business-update?utm_source=twitter&utm_medium=feed',
            snippet: 'Company announces new corporate governance restructuring following audit review.',
            publishedAt: '2026-09-10T10:00:00.000Z',
            capturedAt: now,
            underlyingSource: 'PTI Press Release Wire',
            identityMatchNote: 'Exact legal name match',
            isPressReleaseRepetition: true,
          },
          {
            // Exact same story re-syndicated on an aggregator with tracking params
            sourceName: 'Big News Network',
            sourceDomain: 'bignewsnetwork.com',
            url: 'https://ptinews.com/news/business-update?utm_source=rss',
            snippet: 'Company announces new corporate governance restructuring following audit review.',
            publishedAt: '2026-09-10T10:00:00.000Z',
            capturedAt: now,
            underlyingSource: 'Syndicated PTI Wire',
            identityMatchNote: 'Exact legal name match',
            isPressReleaseRepetition: true,
          },
          {
            // Independent financial reporting
            sourceName: 'Mint Financial Daily',
            sourceDomain: 'livemint.com',
            url: 'https://livemint.com/companies/tata-steel-audit-review',
            snippet: 'Independent board committee reviews expansion capex and environmental compliance filings.',
            publishedAt: '2026-09-11T08:30:00.000Z',
            capturedAt: now,
            underlyingSource: 'Investigative Corporate Reporting',
            identityMatchNote: 'Exact legal name match',
          },
        ];

        findings.push(
          validateRiskFinding({
            dimension: 'negative_news',
            title: 'Audit Review and Governance Restructuring Coverage',
            neutralSummary: `Financial press reported on governance restructuring and committee reviews for ${vendor.canonicalName}. Syndicated press release was detected and deduplicated.`,
            status: 'signal_found',
            severity: 2,
            severityExplanation: 'Routine governance disclosure and routine board committee review.',
            evidence: duplicateEvidence,
            confidence: 'single_source_review', // Since PR wire groups into 1, + Mint = 2 sources, or single_source if PR is 1. Evaluator handles cleanly!
            recommendedReviewAction: 'Review official stock exchange regulatory disclosures (BSE/NSE) for official filing context.',
            missingDataReason: null,
          })
        );
      } else if (mockScenario === 'NO_RESULTS') {
        findings.push(
          validateRiskFinding({
            dimension: 'negative_news',
            title: 'No Material Adverse Media Located in Recent Window',
            neutralSummary: `Targeted news and regulatory media search over the past 24-month window for '${vendor.canonicalName}' yielded zero credible reports of fraud, tax evasion, insolvency, or regulatory sanctions.`,
            status: 'no_signal_found_in_checked_sources',
            severity: 1,
            severityExplanation: 'Absence of negative press coverage in major financial publications.',
            evidence: [
              {
                sourceName: 'Indian Financial Media Aggregator',
                sourceDomain: 'news.google.com',
                url: 'https://news.google.com',
                snippet: `Negative media query on '${vendor.canonicalName}' (fraud OR penalty OR debarment OR NCLT) returned zero high-confidence adverse articles.`,
                publishedAt: null,
                capturedAt: now,
                underlyingSource: 'Public Media Search',
                identityMatchNote: 'Exact entity name search',
              },
            ],
            confidence: 'multiple_independent_sources',
            recommendedReviewAction: 'Maintain periodic adverse media monitoring alerts.',
            missingDataReason: null,
          })
        );
      } else {
        // Realistic clean coverage
        findings.push(
          validateRiskFinding({
            dimension: 'negative_news',
            title: 'Routine Commercial News & Market Coverage',
            neutralSummary: `Coverage across national publications indicates operational announcements and expansion investments for ${vendor.canonicalName}. No criminal proceedings or major regulatory embargoes noted.`,
            status: 'no_signal_found_in_checked_sources',
            severity: 1,
            severityExplanation: 'General commercial coverage without adverse regulatory findings.',
            evidence: [
              {
                sourceName: 'Economic Times',
                sourceDomain: 'economictimes.indiatimes.com',
                url: 'https://economictimes.indiatimes.com/news/company/earnings-brief',
                snippet: `${vendor.canonicalName} announces quarterly commercial operational capacity updates.`,
                publishedAt: '2026-08-15T09:00:00.000Z',
                capturedAt: now,
                underlyingSource: 'Financial Press Report',
                identityMatchNote: 'Exact entity name match',
              },
            ],
            confidence: 'single_source_review',
            recommendedReviewAction: 'Standard vendor onboarding diligence is sufficient.',
            missingDataReason: null,
          })
        );
      }

      return {
        dimension,
        title,
        status: 'completed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: sourcesChecked.length,
        errorCategory: null,
        errorMessage: null,
        findings,
        sourcesChecked,
        coverageGaps,
      };
    }

    // LIVE EXECUTION PATH
    if (!tinyfish.isConfigured()) {
      return {
        dimension,
        title,
        status: 'unavailable',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'NOT_CONFIGURED',
        errorMessage: 'TINYFISH_API_KEY is not configured for media research.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: ['Adverse media research omitted: TINYFISH_API_KEY absent.'],
      };
    }

    try {
      const searchRes = await tinyfish.searchAdverseMedia(vendor.canonicalName, {
        limit: 5,
        identifiers: [vendor.cin, vendor.gstin, vendor.pan, ...(vendor.profile?.gstins || [])].filter((value): value is string => Boolean(value)),
        signal,
        timeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
        freshRun,
      });
      if (!searchRes.success) {
        return {
          dimension,
          title,
          status: searchRes.status === 'NOT_CONFIGURED' ? 'unavailable' : 'failed',
          provider,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          sourceCount: 0,
          errorCategory: searchRes.errorCategory || (searchRes.status === 'AUTH_FAILED' ? 'AUTH' : 'UPSTREAM_5XX'),
          errorMessage: searchRes.message || 'Adverse-media search did not complete.',
          findings: [],
          sourcesChecked: [],
          coverageGaps: [searchRes.message || 'Adverse-media search unavailable.'],
        };
      }
      sourcesChecked.push('TinyFish Search API (adverse-media query)');
      const articles = searchRes.articles || [];
      const identifiers = [vendor.cin, vendor.gstin, vendor.pan, ...(vendor.profile?.gstins || [])].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
      const substantiveNegativeContent = /\b(fraud|bribery|corruption|scam|debar(?:red|ment)?|blacklist(?:ed|ing)?|penalt(?:y|ies)|fined|sanction(?:ed)?|charged|prosecut(?:ed|ion)|accused|alleg(?:ed|ation)|lawsuit|sued|court case|under investigation|investigation into|insolvency|winding.?up|default(?:ed)?|violat(?:ion|ed)|breach|misconduct|regulatory action)\b/i;
      const identityMatchedArticles = articles.filter((article) => {
        const content = `${article.title} ${article.snippet} ${article.expandedText || ''}`.toLowerCase();
        let sourceIsValid = false;
        try { const source = new URL(article.url); sourceIsValid = ['http:', 'https:'].includes(source.protocol) && Boolean(article.sourceDomain); } catch { /* invalid source provenance */ }
        const identityMatched = identifiers.some((identifier) => content.includes(identifier)) || content.includes(vendor.canonicalName.toLowerCase());
        return sourceIsValid && Boolean(article.retrievedAt) && article.directSourceAvailable !== false && article.snippet.trim().length > 0 && identityMatched;
      });
      const attributable = identityMatchedArticles.filter((article) => {
        const content = `${article.title} ${article.snippet} ${article.expandedText || ''}`.toLowerCase();
        const exactIdentifier = identifiers.some((identifier) => content.includes(identifier));
        return exactIdentifier && substantiveNegativeContent.test(content);
      });
      const ambiguous = articles.length > identityMatchedArticles.length;

      if (attributable.length > 0) {
        const rawEvidenceList: EvidenceItem[] = attributable.map((art) => ({
          sourceName: art.title || art.sourceDomain,
          sourceDomain: art.sourceDomain,
          url: art.url || null,
          snippet: art.snippet.replace(/[#*_`>]/g, '').slice(0, 500),
          publishedAt: art.publishedDate || null,
          capturedAt: art.retrievedAt || now,
          underlyingSource: 'Financial Media Publication',
          identityMatchNote: identifiers.some((identifier) => `${art.title} ${art.snippet}`.toLowerCase().includes(identifier))
            ? 'An exact supplied CIN, GSTIN, or PAN appears in the fetched article; confirm source context manually.'
            : 'Exact legal vendor name appears in fetched content; verify that this is the same legal entity.',
          searchQuery: art.query || searchRes.query,
          expandedText: art.expandedText,
        }));

        const { deduplicated } = deduplicateEvidence(rawEvidenceList);

        findings.push(
          validateRiskFinding({
            dimension: 'negative_news',
            title: `Adverse Media Mentions (${deduplicated.length} Distinct Sources)`,
            neutralSummary: `Fetched public media articles with vendor identity signals were found for ${vendor.canonicalName}. Reports are allegations or claims and require source review.`,
            status: 'signal_found',
            severity: 3,
            severityExplanation: 'Public press reporting of investigations or allegations. Media allegations are not conclusive legal determinations.',
            evidence: deduplicated,
            confidence: deduplicated.length >= 2 ? 'multiple_independent_sources' : 'single_source_review',
            recommendedReviewAction: 'Review underlying source articles; verify whether allegations have reached formal court filings or charge sheets.',
            missingDataReason: null,
          })
        );
      } else {
        const neutralItems = identityMatchedArticles.some((article) => !substantiveNegativeContent.test(`${article.title} ${article.snippet} ${article.expandedText || ''}`)) && !(searchRes.sourceErrors?.length);
        coverageGaps.push(ambiguous
          ? 'Adverse-media results were retrieved, but vendor identity or substantive negative content could not be established; manual review is required.'
          : identityMatchedArticles.length > 0 && identityMatchedArticles.some((article) => substantiveNegativeContent.test(`${article.title} ${article.snippet} ${article.expandedText || ''}`))
            ? 'Fetched adverse-media source contains a negative claim and the vendor name, but no exact supplied CIN, GSTIN, or PAN; identity remains unverified and manual review is required.'
          : searchRes.sourceErrors?.length
            ? 'Some adverse-media source pages were inaccessible; retrieved partial results were retained.'
            : neutralItems
              ? 'Retrieved vendor-related items were neutral routine notices or filings and were excluded from risk scoring.'
              : 'TinyFish Search and Fetch returned no attributable adverse-media source; this does not establish absence of adverse media.');
      }
      if (searchRes.sourceErrors?.length) coverageGaps.push(`${searchRes.sourceErrors.length} adverse-media source(s) were inaccessible; returned results are partial.`);
    } catch (err: any) {
      return {
        dimension,
        title,
        status: 'failed',
        provider,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        sourceCount: 0,
        errorCategory: 'UPSTREAM_5XX',
        errorMessage: err.message || 'Adverse-media search failed.',
        findings: [],
        sourcesChecked: [],
        coverageGaps: [`Negative news search encountered an error: ${err.message || 'Provider failure'}`],
      };
    }

    return {
      dimension,
      title,
      status: 'completed',
      provider,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      sourceCount: sourcesChecked.length,
      errorCategory: null,
      errorMessage: null,
      findings,
      sourcesChecked,
      coverageGaps,
    };
  }

  /**
   * Synthesizes an executive narrative adhering strictly to zero-fabrication rules.
   */
  private synthesizeSummaryNarrative(params: {
    vendorName: string;
    reportStatus: string;
    totalSignals: number;
    corroboratedSignals: number;
    reviewNeededSignals: number;
    highSeveritySignals: number;
    verdict: string;
    coverageGapsCount: number;
  }): string {
    const { vendorName, reportStatus, totalSignals, corroboratedSignals, reviewNeededSignals, highSeveritySignals, verdict, coverageGapsCount } = params;

    let text = `Due diligence investigation for ${vendorName} concluded with verdict: [${verdict}]. `;

    if (reportStatus === 'partial_failure') {
      text += `NOTICE: Partial report generated due to ${coverageGapsCount} source availability gap(s). Gaps are explicitly marked. `;
    }

    if (highSeveritySignals > 0) {
      text += `Identified ${highSeveritySignals} high-severity risk finding(s) requiring immediate compliance intervention. `;
    } else {
      text += `No critical administrative debarment or active corporate strike-off indicators were detected in checked sources. `;
    }

    text += `${totalSignals} total finding(s) evaluated (${corroboratedSignals} corroborated across independent sources, ${reviewNeededSignals} requiring human officer review). `;
    text += `Under VendorTrace integrity guarantees: absence of findings in checked sources does not constitute absolute clearance.`;

    return text;
  }
}

export const discoveryService = new DiscoveryOrchestrationService();
