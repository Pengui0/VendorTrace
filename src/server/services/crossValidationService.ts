/**
 * Layer 3 Cross-Validation & Deterministic Risk Scoring Engine
 * Strictly enforces deterministic rules for confidence and risk score calculations.
 * Never allows an LLM to declare a vendor guilty or fraudulent.
 * Cites validated evidence IDs for all factual assertions.
 */

import {
  VendorTraceAssessmentReport,
  CrossValidatedFinding,
  ScoreFactorBreakdown,
  ReviewPriority,
  CoverageStatus,
  IdentityMatchQuality,
  CoreDimensionCard,
} from '../../types/crossValidation.js';
import { RiskFinding, EvidenceItem, FindingConfidence } from '../../types/riskFinding.js';
import { isSyndicatedPressRelease } from '../validation/riskFindingValidator.js';
import { GoogleGenAI } from '@google/genai';

export class CrossValidationService {
  /**
   * Evaluates evidence cross-validation for a single finding.
   * Strictly enforces:
   * - multiple_independent_sources only when >= 2 distinct non-syndicated domains match
   * - syndication/mirror grouping
   * - identity match quality gating
   */
  public crossValidateFinding(
    finding: RiskFinding,
    identityMatchQuality: IdentityMatchQuality = 'EXACT_IDENTIFIER'
  ): CrossValidatedFinding {
    const countedSources: string[] = [];
    const syndicatedSources: string[] = [];
    const seenDomains = new Set<string>();
    let hasSyndicationGroup = false;

    for (const ev of finding.evidence) {
      const domain = (ev.sourceDomain || 'unknown').toLowerCase().replace(/^www\./, '');
      const isSyndicated = ev.isPressReleaseRepetition || isSyndicatedPressRelease(domain, ev.snippet);

      if (isSyndicated) {
        syndicatedSources.push(`${ev.sourceName} (${domain})`);
        if (!hasSyndicationGroup) {
          countedSources.push(`Syndicated Wire Group (${domain})`);
          hasSyndicationGroup = true;
        }
      } else {
        if (!seenDomains.has(domain)) {
          seenDomains.add(domain);
          countedSources.push(`${ev.sourceName} (${domain})`);
        }
      }
    }

    // Determine deterministic confidence
    let confidence: FindingConfidence = 'single_source_review';
    let rationale = '';

    if (identityMatchQuality === 'WEAK' || identityMatchQuality === 'NO_MATCHING_ENTITY') {
      confidence = 'insufficient_evidence';
      rationale = 'Weak entity identity match; cannot corroborate claims against target without confirmed CIN/DIN.';
    } else if (finding.status === 'conflicting_evidence') {
      confidence = 'conflicting_sources';
      rationale = 'Conflicting evidence detected across independent official records.';
    } else if (finding.status === 'source_unavailable' || countedSources.length === 0) {
      confidence = 'insufficient_evidence';
      rationale = 'Source was unavailable or returned no evidence payload.';
    } else if (countedSources.length >= 2) {
      confidence = 'multiple_independent_sources';
      rationale = `Corroborated across ${countedSources.length} genuinely independent sources: ${countedSources.join(', ')}.`;
      if (syndicatedSources.length > 1) {
        rationale += ` (${syndicatedSources.length} syndicated wire copies detected and grouped as single source).`;
      }
    } else {
      confidence = 'single_source_review';
      rationale = `Supported by single source (${countedSources[0] || '1 source'}). Compliance policy requires manual officer review.`;
    }

    const needsHumanReview =
      confidence === 'single_source_review' ||
      confidence === 'conflicting_sources' ||
      confidence === 'insufficient_evidence' ||
      finding.status === 'inconclusive' ||
      identityMatchQuality === 'WEAK';

    let humanReviewReason: string | undefined;
    if (confidence === 'single_source_review') {
      humanReviewReason = 'Single-source claim; lacks secondary independent verification.';
    } else if (confidence === 'conflicting_sources') {
      humanReviewReason = 'Conflicting registry data requires officer reconciliation.';
    } else if (identityMatchQuality === 'WEAK') {
      humanReviewReason = 'Provisional or weak name-only match; verify Certificate of Incorporation.';
    } else if (finding.status === 'inconclusive') {
      humanReviewReason = 'Inconclusive query results in primary registry index.';
    }

    return {
      ...finding,
      confidence,
      confidenceRationale: rationale,
      sourcesCounted: countedSources,
      syndicatedOrExcludedSources: syndicatedSources,
      needsHumanReview,
      humanReviewReason,
    };
  }

  /**
   * Deterministically calculates the explainable risk score and factor contributions.
   * Never lets an LLM guess scores or declare innocence.
   */
  public calculateDeterministicScore(params: {
    findings: CrossValidatedFinding[];
    identityMatchQuality: IdentityMatchQuality;
    coverageStatus: CoverageStatus;
    investigationDate: string;
  }): ScoreFactorBreakdown {
    const { findings, identityMatchQuality, coverageStatus, investigationDate } = params;

    // 1. Severity Points (0 - 40)
    let maxSeverity = 1;
    let highSeverityCount = 0;
    for (const f of findings) {
      if (f.status === 'signal_found') {
        if (f.severity > maxSeverity) maxSeverity = f.severity;
        if (f.severity >= 4) highSeverityCount++;
      }
    }

    let severityPoints = 0;
    let severityRationale = '';
    if (maxSeverity === 5) {
      severityPoints = 40;
      severityRationale = 'Critical administrative sanction, debarment, or strike-off detected (40/40 pts).';
    } else if (maxSeverity === 4) {
      severityPoints = 30 + Math.min(highSeverityCount * 2, 8);
      severityRationale = `High severity regulatory or tax non-compliance detected (${severityPoints}/40 pts).`;
    } else if (maxSeverity === 3) {
      severityPoints = 18;
      severityRationale = 'Caution level: pending court suit or unresolved regulatory allegation (18/40 pts).';
    } else if (maxSeverity === 2) {
      severityPoints = 8;
      severityRationale = 'Low-caution historic dispute or routine unverified registry candidate (8/40 pts).';
    } else {
      severityPoints = 0;
      severityRationale = 'No adverse signals found in checked sources (0/40 pts).';
    }

    // 2. Evidence Confidence Points (0 - 30)
    let confidencePoints = 0;
    let confidenceRationale = '';
    const corroboratedFindings = findings.filter((f) => f.confidence === 'multiple_independent_sources' && f.status === 'signal_found');
    const singleSourceFindings = findings.filter((f) => f.confidence === 'single_source_review' && f.status === 'signal_found');

    if (corroboratedFindings.length > 0) {
      confidencePoints = 30;
      confidenceRationale = 'Adverse signals corroborated across multiple independent sources (30/30 pts).';
    } else if (singleSourceFindings.length > 0) {
      confidencePoints = 16;
      confidenceRationale = 'Adverse signals based on single-source claims; discounted by 45% for review (16/30 pts).';
    } else {
      confidencePoints = 0;
      confidenceRationale = 'No uncorroborated or single-source risk claims identified (0/30 pts).';
    }

    // 3. Recency Points (0 - 15)
    let recencyPoints = 0;
    let recencyRationale = '';
    const now = Date.now();
    let hasRecentAdverse = false;
    let hasHistoricAdverse = false;

    for (const f of findings) {
      if (f.status === 'signal_found' && f.severity >= 3) {
        const dateStr = f.evidence[0]?.publishedAt || f.createdAt;
        const ageDays = (now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays <= 365) hasRecentAdverse = true;
        else hasHistoricAdverse = true;
      }
    }

    if (hasRecentAdverse) {
      recencyPoints = 15;
      recencyRationale = 'Recent adverse signals within past 12 months (15/15 pts).';
    } else if (hasHistoricAdverse) {
      recencyPoints = 6;
      recencyRationale = 'Historic adverse matter (> 12 months old) with reduced ongoing impact (6/15 pts).';
    } else {
      recencyPoints = 0;
      recencyRationale = 'No recent or active adverse records identified (0/15 pts).';
    }

    // 4. Identity Match Quality Points (0 - 15)
    let identityMatchPoints = 0;
    let identityMatchRationale = '';
    switch (identityMatchQuality) {
      case 'EXACT_IDENTIFIER':
        identityMatchPoints = 15;
        identityMatchRationale = 'Exact 21-char CIN or 15-char GSTIN identifier match (15/15 pts).';
        break;
      case 'STRONG_NAME_AND_ADDRESS':
        identityMatchPoints = 10;
        identityMatchRationale = 'Strong name and registered RoC office match (10/15 pts).';
        break;
      case 'PROBABLE':
        identityMatchPoints = 5;
        identityMatchRationale = 'Probable legal name match; exact tax identifier unverified (5/15 pts).';
        break;
      case 'WEAK':
      case 'NO_MATCHING_ENTITY':
      default:
        identityMatchPoints = 0;
        identityMatchRationale = 'Weak or unconfirmed identity match; provisional findings only (0/15 pts).';
        break;
    }

    // 5. Total Score Computation
    const rawTotal = severityPoints + confidencePoints + recencyPoints + identityMatchPoints;
    let totalScore = Math.min(Math.max(rawTotal, 0), 100);
    let coveragePointsAdjustment = 0;

    // Rule: Inadequate coverage must never yield a reassuring low score!
    if (coverageStatus === 'INADEQUATE') {
      coveragePointsAdjustment = 0;
      // Do not allow totalScore to imply clean standing if coverage is inadequate
      if (totalScore < 45) totalScore = 50;
    }

    // Rule Description
    let ruleApplied = '';
    if (coverageStatus === 'INADEQUATE') {
      ruleApplied = 'Rule: Inadequate Registry Coverage. Essential registry dimensions were unavailable; risk index defaulted to Review Required to prevent false clearance.';
    } else if (maxSeverity >= 4 && confidencePoints >= 20) {
      ruleApplied = 'Rule: Corroborated Material Risk. Critical sanction or strike-off verified across independent registries.';
    } else if (singleSourceFindings.length > 0 && maxSeverity >= 3) {
      ruleApplied = 'Rule: Uncorroborated Allegation. Single-source legal or media claim requires human compliance officer review.';
    } else if (findings.every((f) => f.severity <= 2)) {
      ruleApplied = 'Rule: Clean Registry Standing. All checked sources confirmed active standing with no debarment orders.';
    } else {
      ruleApplied = 'Rule: Standard Weighted Multi-Factor Due Diligence Index.';
    }

    return {
      severityPoints,
      severityRationale,
      confidencePoints,
      confidenceRationale,
      recencyPoints,
      recencyRationale,
      identityMatchPoints,
      identityMatchRationale,
      coveragePointsAdjustment,
      totalScore,
      ruleApplied,
    };
  }

  /**
   * Generates a neutral brief summary citing exact evidence IDs.
   * If GEMINI_API_KEY is available, asks Gemini to write the brief summary strictly from validated findings.
   * Otherwise falls back to deterministic citation generator.
   */
  public async generateSummaryWithCitations(
    vendorName: string,
    findings: CrossValidatedFinding[],
    reviewPriority: ReviewPriority
  ): Promise<{ text: string; citedEvidenceIds: string[]; generatedBy: 'DETERMINISTIC_RULES' | 'GEMINI_ASSISTED' }> {
    const citedEvidenceIds: string[] = [];

    for (const f of findings) {
      for (const ev of f.evidence) {
        if (ev.id && !citedEvidenceIds.includes(ev.id)) {
          citedEvidenceIds.push(ev.id);
        } else if (!ev.id) {
          const fallbackId = `evi_${f.dimension}_${citedEvidenceIds.length + 1}`;
          citedEvidenceIds.push(fallbackId);
        }
      }
    }

    // Check if Gemini API is configured
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.trim().length > 10 && !geminiKey.includes('MY_GEMINI_API_KEY')) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey.trim() });
        const findingsSnippet = findings
          .map((f, i) => `[Finding ${i + 1}] Dimension: ${f.dimension}, Title: ${f.title}, Summary: ${f.neutralSummary}, Evidence IDs: ${f.evidence.map((e) => e.id || 'evi_' + i).join(', ')}`)
          .join('\n');

        const prompt = `You are a compliance analyst summarizing verified due diligence facts for "${vendorName}".
Assessment Priority: ${reviewPriority}.
Validated Findings:
${findingsSnippet}

Instructions:
1. Write exactly 2-3 neutral, objective factual sentences summarizing the findings.
2. DO NOT declare guilt, fraud, or absolute innocence. Use neutral compliance language.
3. You MUST cite the exact evidence IDs in brackets (e.g. [evi_123]) for every factual statement.
4. Output only the brief summary text.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });

        const generatedText = response.text ? response.text.trim() : null;
        if (generatedText && generatedText.length > 20) {
          return {
            text: generatedText,
            citedEvidenceIds,
            generatedBy: 'GEMINI_ASSISTED',
          };
        }
      } catch {
        // Fall through to deterministic citation generator on any error
      }
    }

    // Deterministic Rule-Based Citation Generator
    let text = `Due diligence review for ${vendorName} concluded with priority [${reviewPriority.replace(/_/g, ' ')}]. `;

    const adverseFindings = findings.filter((f) => f.status === 'signal_found');
    const cleanFindings = findings.filter((f) => f.status === 'no_signal_found_in_checked_sources');

    if (adverseFindings.length > 0) {
      const topAdverse = adverseFindings[0];
      const evId = topAdverse.evidence[0]?.id || `evi_${topAdverse.dimension}`;
      text += `Identified ${topAdverse.title.toLowerCase()} recorded in official registries [${evId}]. `;
    }

    if (cleanFindings.length > 0) {
      const topClean = cleanFindings[0];
      const evId = topClean.evidence[0]?.id || `evi_${topClean.dimension}`;
      text += `No adverse debarment or active corporate strike-off indicators were located in checked dockets [${evId}]. `;
    }

    text += `All evaluations conform to zero-fabrication standards; absence of records in checked registries does not imply absolute clearance.`;

    return {
      text,
      citedEvidenceIds,
      generatedBy: 'DETERMINISTIC_RULES',
    };
  }

  /**
   * Compiles the comprehensive Layer 3 Assessment Report.
   */
  public async compileAssessmentReport(params: {
    investigationId: string;
    vendorId: string;
    vendorName: string;
    cin: string | null;
    gstin: string | null;
    pan: string | null;
    identityMatchQuality: IdentityMatchQuality;
    rawFindings: RiskFinding[];
    coverageGaps: string[];
    dimensionTaskStates: Record<string, { status: string; lastCheckedAt?: string }>;
    investigationDate: string;
    sourcesChecked: string[];
  }): Promise<VendorTraceAssessmentReport> {
    const {
      investigationId,
      vendorId,
      vendorName,
      cin,
      gstin,
      pan,
      identityMatchQuality,
      rawFindings,
      coverageGaps,
      dimensionTaskStates,
      investigationDate,
      sourcesChecked,
    } = params;

    // 1. Cross-validate all findings
    const crossValidatedFindings = rawFindings.map((f) => this.crossValidateFinding(f, identityMatchQuality));

    // 2. Assess coverage across the four user-facing core dimensions.
    // Registry and GST are separate provider tasks but one reporting dimension;
    // the other three dimensions each require their own completed task. Do not
    // treat four completed tasks out of five as complete when adverse media is queued.
    const isCompleted = (key: string) => dimensionTaskStates[key]?.status === 'completed';
    const coreDimensionCoverage = {
      registry_gst: isCompleted('company_registry') && isCompleted('gst_compliance'),
      court_litigation: isCompleted('court_litigation'),
      blacklist_debarment: isCompleted('blacklist_debarment'),
      negative_news: isCompleted('negative_news'),
    };
    const completedCoreDimensions = Object.values(coreDimensionCoverage).filter(Boolean).length;

    let coverageStatus: CoverageStatus = 'COMPLETE';
    if (completedCoreDimensions < 2 || (!cin && !gstin)) {
      coverageStatus = 'INADEQUATE';
    } else if (coverageGaps.length > 0 || completedCoreDimensions < 4) {
      coverageStatus = 'PARTIAL';
    }

    // 3. Stale Report Check (investigation older than 30 days)
    const invTime = new Date(investigationDate).getTime();
    const ageDays = (Date.now() - invTime) / (1000 * 60 * 60 * 24);
    const isStale = ageDays > 30;
    const staleNotice = isStale
      ? `Report was generated ${Math.floor(ageDays)} days ago. Vendor tax filing status or litigation dockets may have updated.`
      : undefined;

    // 4. Calculate Deterministic Score Breakdown
    const scoreBreakdown = this.calculateDeterministicScore({
      findings: crossValidatedFindings,
      identityMatchQuality,
      coverageStatus,
      investigationDate,
    });

    // 5. Determine Neutral Review Priority Label
    let reviewPriority: ReviewPriority = 'STANDARD_PERIODIC_REVIEW';
    let priorityHeadline = '';

    if (coverageStatus === 'INADEQUATE') {
      reviewPriority = 'INSUFFICIENT_COVERAGE';
      priorityHeadline = 'Insufficient Coverage: Primary Registry Facts Unavailable';
    } else if (identityMatchQuality === 'WEAK' || identityMatchQuality === 'NO_MATCHING_ENTITY') {
      reviewPriority = 'LIMITED_EVIDENCE';
      priorityHeadline = 'Limited Evidence: Identity Match Ambiguous';
    } else if (scoreBreakdown.totalScore >= 70 || crossValidatedFindings.some((f) => f.severity >= 4 && f.confidence === 'multiple_independent_sources')) {
      reviewPriority = 'ELEVATED_REVIEW_PRIORITY';
      priorityHeadline = 'Elevated Review Priority: Corroborated Material Risk Signals';
    } else if (scoreBreakdown.totalScore >= 40 || crossValidatedFindings.some((f) => f.needsHumanReview && f.severity >= 3)) {
      reviewPriority = 'REVIEW_RECOMMENDED';
      priorityHeadline = 'Review Recommended: Uncorroborated Caution Matters';
    } else {
      reviewPriority = 'STANDARD_PERIODIC_REVIEW';
      priorityHeadline = 'Standard Periodic Review: Clean Standing in Checked Sources';
    }

    // 6. Build Human Review Queue
    const humanReviewQueue = crossValidatedFindings.filter((f) => f.needsHumanReview);

    // 7. Assemble Four Core Dimension Cards
    const nowIso = new Date().toISOString();
    const fourDimensionCards = {
      registry_gst: this.buildCoreDimensionCard(
        'registry_gst',
        'Company Registry & GST Tax Standing',
        crossValidatedFindings.filter((f) => f.dimension === 'company_registry' || f.dimension === 'gst_compliance'),
        dimensionTaskStates['company_registry']?.status,
        coverageGaps.filter((g) => g.toLowerCase().includes('mca') || g.toLowerCase().includes('gst'))
      ),
      court_litigation: this.buildCoreDimensionCard(
        'court_litigation',
        'E-Courts & Commercial Litigation',
        crossValidatedFindings.filter((f) => f.dimension === 'court_litigation'),
        dimensionTaskStates['court_litigation']?.status,
        coverageGaps.filter((g) => g.toLowerCase().includes('court') || g.toLowerCase().includes('litigation'))
      ),
      blacklist_debarment: this.buildCoreDimensionCard(
        'blacklist_debarment',
        'Public Procurement Debarment & Penalties',
        crossValidatedFindings.filter((f) => f.dimension === 'blacklist_debarment'),
        dimensionTaskStates['blacklist_debarment']?.status,
        coverageGaps.filter((g) => g.toLowerCase().includes('debar') || g.toLowerCase().includes('gem'))
      ),
      negative_news: this.buildCoreDimensionCard(
        'negative_news',
        'Negative News & Adverse Regulatory Media',
        crossValidatedFindings.filter((f) => f.dimension === 'negative_news'),
        dimensionTaskStates['negative_news']?.status,
        coverageGaps.filter((g) => g.toLowerCase().includes('media') || g.toLowerCase().includes('news'))
      ),
    };

    // 8. Generate Brief Summary with Evidence Citations
    const briefSummary = await this.generateSummaryWithCitations(vendorName, crossValidatedFindings, reviewPriority);

    return {
      investigationId,
      vendorId,
      vendorName,
      cin,
      gstin,
      pan,
      identityMatchQuality,
      reviewPriority,
      priorityHeadline,
      coverageStatus,
      coverageGaps,
      scoreBreakdown,
      isStale,
      staleNotice,
      humanReviewQueue,
      fourDimensionCards,
      briefSummary,
      sourcesChecked,
      totalSourcesEvaluated: sourcesChecked.length,
      createdAt: investigationDate || nowIso,
    };
  }

  /**
   * Helper to build a standardized CoreDimensionCard.
   */
  private buildCoreDimensionCard(
    dimension: 'registry_gst' | 'court_litigation' | 'blacklist_debarment' | 'negative_news',
    title: string,
    findings: CrossValidatedFinding[],
    taskStatus?: string,
    gaps: string[] = []
  ): CoreDimensionCard {
    let status: CoreDimensionCard['status'] = 'no_signal_found_in_checked_sources';
    let confidenceBadge = 'No Signals Found';
    let neutralSummary = '';

    if (taskStatus === 'failed' || taskStatus === 'unavailable') {
      status = 'source_unavailable';
      confidenceBadge = 'Source Unavailable';
      neutralSummary = 'Registry connector was unreachable or unconfigured during this investigation run.';
    } else if (findings.length === 0) {
      status = 'no_data_available';
      confidenceBadge = 'No Data Available';
      neutralSummary = 'No matching registry records identified for the specified vendor identifier.';
    } else if (findings.some((f) => f.status === 'signal_found')) {
      status = 'signal_found';
      const maxSev = Math.max(...findings.map((f) => f.severity));
      confidenceBadge = maxSev >= 4 ? 'Material Signal' : 'Caution Signal';
      neutralSummary = findings.map((f) => f.neutralSummary).join(' ');
    } else {
      status = 'no_signal_found_in_checked_sources';
      confidenceBadge = 'Checked Clear';
      neutralSummary = 'No adverse filings, debarment records, or penalties located in checked sources.';
    }

    return {
      dimension,
      title,
      status,
      count: findings.length,
      confidenceBadge,
      lastCheckedAt: new Date().toISOString(),
      coverageGaps: gaps,
      neutralSummary,
      findings,
    };
  }
}

export const crossValidationService = new CrossValidationService();
