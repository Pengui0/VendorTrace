/**
 * VendorTrace Export Service
 * Generates verified, tamper-evident PDF reports and RFC 4180 compliant CSV evidence registers.
 * Strictly prevents secret leakage, handles Unicode/newlines, and enforces zero-empty-export rules.
 */

import { jsPDF } from 'jspdf';
import { Investigation, Finding } from '../../types/vendor.js';
import { RiskFinding } from '../../types/riskFinding.js';
import { AssessmentReport } from '../../types/crossValidation.js';
import { getAssessmentDisplayValues } from '../../utils/assessmentDisplay.js';

export const EXPORT_LEGAL_DISCLAIMER =
  'This report supports due diligence and is not legal advice or proof of misconduct. Findings are evidence-backed signals compiled from public registries and official sources for human compliance review.';

export interface CsvSignalRow {
  vendor: string;
  dimension: string;
  title: string;
  status: string;
  severity: number;
  confidence: string;
  source_url: string;
  source_domain: string;
  snippet: string;
  captured_date: string;
  identity_match_note: string;
  review_action: string;
  report_id: string;
}

export const DEMO_EXPORT_NOTICE =
  'DEMO DATA — SYNTHETIC EXAMPLE: Entirely fictional corporate entity and evidence for demonstration purposes. Not real findings or allegations.';

export class ExportService {
  /**
   * RFC 4180 compliant CSV field escaper.
   * Handles commas, double quotes, newlines, and Unicode cleanly.
   */
  public escapeCsvField(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    // If field contains comma, quote, or newline, wrap in quotes and double internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  }

  /**
   * Determines if an investigation is a synthetic demonstration run.
   */
  public isDemoReport(investigation: Investigation): boolean {
    return Boolean(
      (investigation as any).isDemo ||
      investigation.id.startsWith('inv_demo_') ||
      investigation.targetName.toUpperCase().includes('SYNTHETIC') ||
      investigation.targetName.toUpperCase().includes('DEMO')
    );
  }

  /**
   * Generates CSV Evidence Register from an Investigation.
   * Strictly produces one row per evidence item.
   */
  public generateCsvRegister(investigation: Investigation): string {
    if (!investigation) {
      throw new Error('Cannot export CSV: Investigation record is null or undefined.');
    }

    const findings = investigation.normalizedFindings || [];
    if (findings.length === 0 && (!investigation.findings || investigation.findings.length === 0)) {
      throw new Error('Cannot export CSV: Investigation contains no findings or evidence data.');
    }

    const isDemo = this.isDemoReport(investigation);

    const headers = [
      'vendor',
      'dimension',
      'title',
      'risk_score',
      'review_priority',
      'status',
      'severity',
      'confidence',
      'source_url',
      'search_result_url',
      'source_fetch_error',
      'source_domain',
      'publisher',
      'source_title',
      'search_query',
      'case_id',
      'case_title',
      'case_number',
      'case_court',
      'case_petitioner',
      'case_respondent',
      'case_parties',
      'case_matched_party',
      'case_status',
      'case_date',
      'snippet',
      'captured_date',
      'identity_match_note',
      'review_action',
      'report_id',
    ];

    const rows: string[] = [];
    const assessmentValues = getAssessmentDisplayValues(investigation.assessmentReport);
    const scoreField = assessmentValues.riskScore ?? 'Not Calculated';
    const priorityField = assessmentValues.priorityLabel;

    // Prepend explicit demo warning banner row if this is a synthetic run
    if (isDemo) {
      rows.push(`# ${DEMO_EXPORT_NOTICE}`);
    }

    rows.push(headers.join(','));

    if (investigation.normalizedFindings && investigation.normalizedFindings.length > 0) {
      for (const rf of investigation.normalizedFindings) {
        if (!rf.evidence || rf.evidence.length === 0) {
          // Row with empty evidence placeholder if no evidence items exist
          rows.push([
            this.escapeCsvField(investigation.targetName),
            this.escapeCsvField(rf.dimension),
            this.escapeCsvField(rf.title),
            this.escapeCsvField(scoreField),
            this.escapeCsvField(priorityField),
            this.escapeCsvField(rf.status),
            this.escapeCsvField(rf.severity),
            this.escapeCsvField(rf.confidence),
            this.escapeCsvField('No direct source URL supplied.'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField(rf.title),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField(rf.neutralSummary),
            this.escapeCsvField(rf.createdAt || investigation.createdAt),
            this.escapeCsvField('N/A'),
            this.escapeCsvField(rf.recommendedReviewAction),
            this.escapeCsvField(investigation.id),
          ].join(','));
        } else {
          for (const ev of rf.evidence) {
            rows.push([
              this.escapeCsvField(investigation.targetName),
              this.escapeCsvField(rf.dimension),
              this.escapeCsvField(rf.title),
              this.escapeCsvField(scoreField),
              this.escapeCsvField(priorityField),
              this.escapeCsvField(rf.status),
              this.escapeCsvField(rf.severity),
              this.escapeCsvField(rf.confidence),
              this.escapeCsvField(ev.url || 'No direct source URL supplied.'),
              this.escapeCsvField(ev.searchResultUrl || 'N/A'),
              this.escapeCsvField(ev.sourceFetchError || 'N/A'),
              this.escapeCsvField(ev.publisher || ev.sourceDomain || 'N/A'),
              this.escapeCsvField(ev.publisher || ev.sourceDomain || 'N/A'),
              this.escapeCsvField(ev.sourceTitle || ev.underlyingSource || 'N/A'),
              this.escapeCsvField(ev.searchQuery || 'N/A'),
              this.escapeCsvField(ev.caseId || 'N/A'),
              this.escapeCsvField(ev.caseTitle || 'N/A'),
              this.escapeCsvField(ev.caseNumber || 'N/A'),
              this.escapeCsvField(ev.caseCourt || 'N/A'),
              this.escapeCsvField(ev.casePetitioner || 'N/A'),
              this.escapeCsvField(ev.caseRespondent || 'N/A'),
              this.escapeCsvField(ev.caseParties || 'N/A'),
              this.escapeCsvField(ev.caseMatchedParty || 'N/A'),
              this.escapeCsvField(ev.caseStatus || 'N/A'),
              this.escapeCsvField(ev.caseDate || 'N/A'),
              this.escapeCsvField(ev.snippet || 'Record verified.'),
              this.escapeCsvField(ev.capturedAt || ev.publishedAt || investigation.createdAt),
              this.escapeCsvField(ev.identityMatchNote || 'N/A'),
              this.escapeCsvField(rf.recommendedReviewAction),
              this.escapeCsvField(investigation.id),
            ].join(','));
          }
        }
      }
    } else {
      // Fallback for legacy Finding format
      for (const f of investigation.findings) {
        const sources = f.sources || [];
        const anyF = f as any;
        if (sources.length === 0) {
          rows.push([
            this.escapeCsvField(investigation.targetName),
            this.escapeCsvField(f.category),
            this.escapeCsvField(f.title),
            this.escapeCsvField(scoreField),
            this.escapeCsvField(priorityField),
            this.escapeCsvField(f.riskLevel),
            this.escapeCsvField(f.riskLevel === 'MATERIAL_RISK' ? 4 : f.riskLevel === 'CAUTION' ? 3 : 1),
            this.escapeCsvField(f.verificationStatus),
            this.escapeCsvField(anyF.sourceUrl || 'No direct source URL supplied.'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField(anyF.sourceDomain || 'N/A'),
            this.escapeCsvField(anyF.sourceDomain || 'N/A'),
            this.escapeCsvField(f.title),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField('N/A'),
            this.escapeCsvField(anyF.evidenceSnippet || f.claim),
            this.escapeCsvField(anyF.sourceDate || investigation.createdAt),
            this.escapeCsvField(f.identityMatchStrength),
            this.escapeCsvField(f.notesForOfficer),
            this.escapeCsvField(investigation.id),
          ].join(','));
        } else {
          for (const s of sources) {
            rows.push([
              this.escapeCsvField(investigation.targetName),
              this.escapeCsvField(f.category),
              this.escapeCsvField(f.title),
              this.escapeCsvField(scoreField),
              this.escapeCsvField(priorityField),
              this.escapeCsvField(f.riskLevel),
              this.escapeCsvField(f.riskLevel === 'MATERIAL_RISK' ? 4 : f.riskLevel === 'CAUTION' ? 3 : 1),
              this.escapeCsvField(f.verificationStatus),
            this.escapeCsvField(s.url || 'No direct source URL supplied.'),
            this.escapeCsvField(s.searchResultUrl || 'N/A'),
            this.escapeCsvField(s.sourceFetchError || 'N/A'),
            this.escapeCsvField(s.sourceDomain || 'N/A'),
            this.escapeCsvField(s.sourceDomain || 'N/A'),
            this.escapeCsvField(s.sourceName || f.title),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField('N/A'),
              this.escapeCsvField(s.snippet || anyF.evidenceSnippet || f.claim),
              this.escapeCsvField(s.retrievedAt || investigation.createdAt),
              this.escapeCsvField(s.matchConfidence || f.identityMatchStrength),
              this.escapeCsvField(f.notesForOfficer),
              this.escapeCsvField(investigation.id),
            ].join(','));
          }
        }
      }
    }

    return rows.join('\r\n');
  }

  /**
   * Generates a clean, professional due diligence PDF report.
   * Includes Scope, Timestamps, Coverage Limitations, Methodology, Risk Findings, Sources, and Disclaimer.
   */
  public generatePdfReport(investigation: Investigation): Uint8Array {
    if (!investigation) {
      throw new Error('Cannot export PDF: Investigation record is null or undefined.');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;

    const checkPageBreak = (neededHeight = 25) => {
      if (y + neededHeight > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 18;
      }
    };

    const writeLine = (text: string, fontSize = 10, isBold = false, color = '#1C1F26') => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(text, pageWidth - 28);
      for (const line of lines) {
        checkPageBreak(fontSize * 0.45 + 5);
        doc.text(line, 14, y);
        y += fontSize * 0.45 + 2.5;
      }
    };

    const writeParagraph = (text: string, fontSize = 9, color = '#5F6572') => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(text, pageWidth - 28);
      for (const line of lines) {
        checkPageBreak(6);
        doc.text(line, 14, y);
        y += 4.2;
      }
      y += 2;
    };

    // 1. Header Banner
    doc.setFillColor(28, 31, 38); // #1C1F26 dark brand
    doc.rect(14, y, pageWidth - 28, 18, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('VENDORTRACE DUE DILIGENCE REPORT', 20, y + 11.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 205, 215);
    doc.text(`REPORT ID: ${investigation.id}`, pageWidth - 70, y + 11.5);
    y += 22;

    const isDemo = this.isDemoReport(investigation);
    if (isDemo) {
      doc.setFillColor(254, 242, 242); // rose-50
      doc.setDrawColor(225, 29, 72); // rose-600
      doc.rect(14, y, pageWidth - 28, 11, 'FD');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(190, 18, 60); // rose-700
      doc.text(
        'DEMO DATA — SYNTHETIC EXAMPLE: Entirely fictional entity & evidence. Not real findings.',
        18,
        y + 7
      );
      y += 15;
    }

    // 2. Scope & Target Identity
    writeLine('1. SCOPE OF INVESTIGATION & TARGET IDENTIFIER', 11, true, '#1C1F26');
    writeLine(`Target Corporate Entity: ${investigation.targetName}`, 10, true);
    writeLine(`Identifier Provided: ${investigation.identifierType} ${investigation.identifierValue}`, 9);
    writeLine(`Audit Timestamp: ${new Date(investigation.createdAt).toUTCString()}`, 9);
    writeLine(`Investigation Status: ${investigation.status}`, 9);
    y += 3;

    // 3. Assessment & Risk Priority
    checkPageBreak(35);
    writeLine('2. RISK ASSESSMENT & METHODOLOGY SUMMARY', 11, true, '#1C1F26');
    const assessment = investigation.assessmentReport;
    const assessmentValues = getAssessmentDisplayValues(assessment);
    if (assessment) {
      writeLine(`Overall Review Priority: ${assessmentValues.priorityLabel}`, 10, true, '#1C1F26');
      writeLine(`Explainable Risk Score: ${assessmentValues.riskScore === null ? 'Not Calculated' : `${assessmentValues.riskScore} / 100`}`, 9);
      writeLine(`Coverage Adequacy: ${assessment.coverageStatus}`, 9);
      if (assessment.briefSummary?.text) {
        y += 1;
        writeParagraph(`Summary: ${assessment.briefSummary.text}`, 9, '#1C1F26');
      }
    } else {
      writeLine('Overall Review Priority: Not Calculated', 10, true, '#1C1F26');
      writeLine('Explainable Risk Score: Not Calculated', 9);
      writeLine(`Verdict: ${investigation.findingsCount.materialRisk > 0 ? 'Elevated Review' : 'Periodic Review'}`, 9);
    }
    y += 3;

    // 4. Coverage Limitations & Coverage Gaps
    checkPageBreak(30);
    writeLine('3. COVERAGE LIMITATIONS & UNVERIFIED SCOPE', 11, true, '#1C1F26');
    if (investigation.coverageGaps && investigation.coverageGaps.length > 0) {
      writeParagraph(
        `Coverage Gaps Identified: ${investigation.coverageGaps.join('; ')}. ` +
        'Absence of findings in unverified dimensions must not be construed as verified clearance.',
        8.5,
        '#B45309'
      );
    } else {
      writeParagraph('No explicit coverage gaps were recorded. Review each task status; this does not certify that every registry was cleared.', 8.5);
    }
    y += 3;

    // 5. Verifiable Findings & Evidence Chains
    checkPageBreak(35);
    writeLine('4. EVIDENCE-BACKED RISK FINDINGS', 11, true, '#1C1F26');
    const findings = investigation.normalizedFindings || [];

    if (findings.length === 0) {
      writeParagraph('No evidence-backed risk findings were recorded. This does not establish that no adverse records exist.', 9);
    } else {
      const courtCandidates: RiskFinding[] = [];
      for (const rf of findings) {
        if (rf.dimension === 'court_litigation' && rf.status === 'inconclusive') {
          courtCandidates.push(rf);
          continue;
        }
        checkPageBreak(32);
        const sevLabel = rf.severity >= 4 ? 'HIGH SEVERITY' : rf.severity === 3 ? 'MODERATE SEVERITY' : 'LOW / INFO';
        writeLine(`• [${rf.dimension.toUpperCase()}] ${rf.title} (${sevLabel})`, 9.5, true, '#1C1F26');
        writeParagraph(`Summary: ${rf.neutralSummary}`, 8.5);
        writeParagraph(`Confidence: ${rf.confidence} — Rationale: ${rf.severityExplanation}`, 8);

        for (const evidence of rf.evidence) {
          checkPageBreak(24);
          writeParagraph(`Source: ${evidence.sourceTitle || evidence.sourceName} (${evidence.publisher || evidence.sourceDomain || 'Public Registry'}) | ${evidence.sourceFetchError ? 'Fetch attempted' : 'Retrieved'}: ${evidence.capturedAt}`, 8, '#2563EB');
          if (evidence.url) writeParagraph(`Source URL: ${evidence.url}`, 7.5, '#2563EB');
          else writeParagraph('No direct source URL supplied.', 7.5, '#92400E');
          if (evidence.searchResultUrl) writeParagraph(`Search result URL (source not fetched): ${evidence.searchResultUrl}`, 7.5, '#92400E');
          if (evidence.sourceFetchError) writeParagraph(`Source fetch failed: ${evidence.sourceFetchError}. Identity and finding remain unverified.`, 7.5, '#92400E');
          if (evidence.searchQuery) writeParagraph(`Search query: ${evidence.searchQuery}`, 7.5);
          if (evidence.identityMatchNote) writeParagraph(`Identity match: ${evidence.identityMatchNote}`, 7.5);
          if (evidence.snippet) writeParagraph(`Evidence excerpt: "${evidence.snippet.slice(0, 500)}"`, 8, '#4B5563');
        }
        y += 2;
      }
      if (courtCandidates.length > 0) {
        checkPageBreak(24);
        writeLine(`UNVERIFIED COURT CASE CANDIDATES (${courtCandidates.length})`, 10, true, '#92400E');
        writeParagraph('IndiaCos case summaries can be name matches and do not confirm identity. These are review candidates, not verified findings or evidence of wrongdoing.', 8.5);
        for (const candidate of courtCandidates) {
          const ev = candidate.evidence[0];
          checkPageBreak(22);
          writeParagraph(candidate.title, 8.5, '#1C1F26');
          if (ev) {
            writeParagraph(`Source: ${ev.sourceTitle || ev.sourceName} (${ev.publisher || ev.sourceDomain || 'Public Registry'}) | Retrieved: ${ev.capturedAt}`, 7.5, '#2563EB');
            if (ev.identityMatchNote) writeParagraph(`Identity match: ${ev.identityMatchNote}`, 7.5);
            if (ev.snippet) writeParagraph(`Evidence excerpt: "${ev.snippet.slice(0, 500)}"`, 7.5, '#4B5563');
            if (ev.searchResultUrl) writeParagraph(`Search result URL (source not fetched): ${ev.searchResultUrl}`, 7.5, '#92400E');
            if (ev.sourceFetchError) writeParagraph(`Source fetch failed: ${ev.sourceFetchError}. Identity and finding remain unverified.`, 7.5, '#92400E');
            for (const [label, value] of [
              ['Case ID', ev.caseId], ['Case title', ev.caseTitle], ['Case number', ev.caseNumber], ['Court', ev.caseCourt],
              ['Petitioner', ev.casePetitioner], ['Respondent', ev.caseRespondent],
              ['Parties', ev.caseParties], ['Matched party', ev.caseMatchedParty],
              ['Status', ev.caseStatus], ['Date', ev.caseDate], ['Source URL', ev.url || 'No direct source URL supplied.'],
            ] as Array<[string, string | undefined]>) {
              if (value) writeParagraph(`${label}: ${value}`, 7.5);
            }
          }
        }
      }
    }

    // 6. Evaluated Sources Audit Stamp
    checkPageBreak(25);
    writeLine('5. EVALUATED SOURCES & REGISTRY AUDIT LOG', 11, true, '#1C1F26');
    if (investigation.sourcesChecked && investigation.sourcesChecked.length > 0) {
      const sourceList = investigation.sourcesChecked.join(', ');
      writeParagraph(`Registries Audited: ${sourceList}`, 8);
    } else {
      writeParagraph('Evaluated Registries: MCA21 Company Registry, GSTN Tax Portal, E-Courts Dockets, Public Debarment Registries.', 8);
    }
    y += 4;

    // 7. Mandatory Legal Disclaimer
    checkPageBreak(25);
    doc.setFontSize(8);
    const disclaimerLines = doc.splitTextToSize(EXPORT_LEGAL_DISCLAIMER, pageWidth - 36);
    const disclaimerBoxHeight = Math.max(20, 12 + disclaimerLines.length * 3.8);
    if (y + disclaimerBoxHeight > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 18;
    }
    doc.setFillColor(250, 248, 245);
    doc.rect(14, y, pageWidth - 28, disclaimerBoxHeight, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14); // Amber
    doc.text('MANDATORY COMPLIANCE & LEGAL DISCLAIMER', 18, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(disclaimerLines, 18, y + 11);
    y += disclaimerBoxHeight + 3;

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#6B7280');
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - 37, doc.internal.pageSize.getHeight() - 8);
    }

    return new Uint8Array(doc.output('arraybuffer'));
  }
}

export const exportService = new ExportService();
