import React, { useMemo, useState } from 'react';
import { Investigation } from '../../types/vendor.js';
import { InvestigationSearchFilter, FilterState } from './InvestigationSearchFilter.js';
import { investigationFilterService } from '../../server/services/investigationFilterService.js';
import { getAssessmentDisplayValues } from '../../utils/assessmentDisplay.js';
import { Card } from '../common/Card.js';
import { EmptyState } from '../common/EmptyState.js';
import { FileText, ArrowRight, Download, History, Trash2 } from 'lucide-react';
import { keepLatestInvestigationPerIdentity } from '../../utils/investigationIdentity.js';

interface InvestigationHistoryViewProps {
  investigations: Investigation[];
  onSelectInvestigation: (id: string) => void;
  onStartInvestigation: () => void;
  onDeleteInvestigation: (id: string) => Promise<void>;
}

const initialFilters: FilterState = { vendor: '', identifier: '', status: '', reviewPriority: '', dimension: '', dateFrom: '', dateTo: '' };

export const InvestigationHistoryView: React.FC<InvestigationHistoryViewProps> = ({ investigations, onSelectInvestigation, onStartInvestigation, onDeleteInvestigation }) => {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [exporting, setExporting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const uniqueInvestigations = useMemo(() => keepLatestInvestigationPerIdentity(investigations), [investigations]);
  const rows = useMemo(() => investigationFilterService.filterInvestigations(uniqueInvestigations, filters).items, [uniqueInvestigations, filters]);

  const deleteReport = async (inv: Investigation) => {
    const prompt = `Delete ${inv.targetName} from report history? This removes its saved report and duplicate runs for the same identifier.`;
    if (!window.confirm(prompt)) return;
    setDeleting(inv.id);
    try { await onDeleteInvestigation(inv.id); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Unable to delete this report.'); }
    finally { setDeleting(null); }
  };

  const exportReport = async (inv: Investigation, format: 'pdf' | 'csv') => {
    const id = inv.id;
    setExporting(`${format}-${id}`);
    try {
      const response = await fetch(`/api/reports/${id}/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation: inv }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Unable to export ${format.toUpperCase()} report.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'pdf' ? `VendorTrace_${id}.pdf` : `VendorTrace_Evidence_${id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Report export failed.');
    } finally { setExporting(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAE6DF]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1F26] flex items-center gap-2"><History className="w-5 h-5" /> Investigation History</h1>
          <p className="mt-1 text-xs text-[#5F6572]">Saved investigation runs and audit summaries. Browsing, filtering, and exporting reports here never starts provider checks.</p>
        </div>
        <span className="px-2.5 py-1 rounded bg-white border border-[#EAE6DF] text-xs text-[#5F6572]">{uniqueInvestigations.length} unique vendor{uniqueInvestigations.length === 1 ? '' : 's'}</span>
      </div>

      <InvestigationSearchFilter onFilterChange={setFilters} totalResults={rows.length} />
      <Card header={`Latest Reports (${rows.length})`} headerAction={<span className="text-[11px] text-[#5F6572]">One latest report per vendor</span>}>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="w-5 h-5" />} title={investigations.length ? 'No reports match these filters' : 'No investigation history yet'} description={investigations.length ? 'Adjust or clear the search filters to see more reports.' : 'Completed investigations will appear here with their original report details.'} action={!investigations.length ? <button className="text-xs font-semibold underline" onClick={onStartInvestigation}>Start an investigation</button> : undefined} />
        ) : (
          <div className="divide-y divide-[#EAE6DF]">
            {rows.map((inv) => {
              const display = getAssessmentDisplayValues(inv.assessmentReport);
              return <div key={inv.id} className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 hover:bg-[#FAF8F5]">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-xs text-[#1C1F26]">{inv.targetName}</strong>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#EAE6DF]">{inv.identifierType}: {inv.identifierValue || 'Not provided'}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{inv.status === 'PARTIAL_FAILURE' ? 'PARTIAL COVERAGE' : inv.status}</span>
                    {inv.executionMode && <span className={`text-[10px] px-1.5 py-0.5 rounded ${inv.executionMode === 'DEMO' ? 'bg-purple-50 text-purple-800' : 'bg-blue-50 text-blue-800'}`}>{inv.executionMode === 'DEMO' ? 'Demo' : 'Live'}</span>}
                  </div>
                  <div className="text-[11px] text-[#5F6572] flex flex-wrap gap-x-3 gap-y-1">
                    <span>{new Date(inv.createdAt).toLocaleString()}</span><span>Report: <span className="font-mono">{inv.id}</span></span>
                    <span>Review: <strong>{display.priorityLabel}</strong></span><span>Score: <strong>{display.riskScore ?? 'Not calculated'}{display.riskScore === null ? '' : ' / 100'}</strong></span>
                    {inv.providerLabels?.length ? <span>Providers: {inv.providerLabels.join(', ')}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onSelectInvestigation(inv.id)} className="px-3 py-1.5 bg-[#1C1F26] text-white rounded text-[11px] font-semibold hover:bg-[#2D323E] flex items-center gap-1">View Report <ArrowRight className="w-3 h-3" /></button>
                  <button disabled={exporting === `pdf-${inv.id}`} onClick={() => exportReport(inv, 'pdf')} className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold flex items-center gap-1"><Download className="w-3 h-3" />PDF</button>
                  <button disabled={exporting === `csv-${inv.id}`} onClick={() => exportReport(inv, 'csv')} className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
                  <button type="button" aria-label={`Delete ${inv.targetName} from report history`} title="Delete report and its duplicate runs" disabled={deleting === inv.id} onClick={() => void deleteReport(inv)} className="ml-1 flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>;
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
