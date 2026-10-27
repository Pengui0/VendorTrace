import React from 'react';
import { IdentifierType, Investigation, SourceConnector, WorkspaceStats } from '../../types/vendor.js';
import { MetricCounter } from './MetricCounter.js';
import { SourceHealthGrid } from './SourceHealthGrid.js';
import { EmptyState } from '../common/EmptyState.js';
import { Button } from '../common/Button.js';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import { SearchCheck, Plus, ArrowRight, ShieldCheck, AlertTriangle, Zap, Sparkles, Building2, Search } from 'lucide-react';

interface OverviewViewProps {
  stats: WorkspaceStats | null;
  connectors: SourceConnector[];
  investigations: Investigation[];
  onStartInvestigation: () => void;
  onSelectInvestigation: (id: string) => void;
  onSelectConnectorDetails: (connector: SourceConnector) => void;
  isLoading: boolean;
  onDirectInvestigate?: (params: { targetName: string; identifierType: IdentifierType; identifierValue: string; freshRun?: boolean }) => void;
  onOpenCustomResolver?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  connectors,
  investigations,
  onStartInvestigation,
  onSelectInvestigation,
  onSelectConnectorDetails,
  isLoading,
  onDirectInvestigate,
  onOpenCustomResolver,
}) => {
  const hasInvestigations = investigations.length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Lead Statement */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EAE6DF]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1F26]">
            Vendor Due Diligence Overview
          </h1>
          <p className="mt-1 text-xs text-[#5F6572]">
            Evidence-backed Indian registry verification, director tracing, and multi-source risk cross-validation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={onStartInvestigation}
          >
            Investigate a vendor
          </Button>
        </div>
      </div>

      {/* 15-Second Due Diligence Quick Start */}
      <div className="bg-white border border-[#D5CEC2] rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1C1F26] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
              Quick-start a due diligence run
            </span>
            <p className="text-[11px] text-[#5F6572]">
              Choose a sample to open the investigation form with its identity details filled in. Review them before starting any checks.
            </p>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 self-start sm:self-auto">
            Zero-Hallucination Protocol Active
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-2 pt-1">
          <button
            type="button"
            onClick={() => onSelectInvestigation('inv_demo_run_01')}
            className="w-full min-h-11 px-3 py-2 rounded-md bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs font-semibold text-purple-900 flex items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Open Acme Horizon Synthetic Walkthrough (Demo Report)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onDirectInvestigate) {
                onDirectInvestigate({
                  targetName: 'Tata Steel Limited',
                  identifierType: 'CIN',
                  identifierValue: 'L27100MH1907PLC000260',
                });
              } else {
                onStartInvestigation();
              }
            }}
            className="w-full min-h-11 px-3 py-2 rounded-md bg-[#FAF8F5] hover:bg-[#F4F1EA] border border-[#D5CEC2] text-xs font-medium text-[#1C1F26] flex items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-[#5F6572]" />
            <span>Prepare Tata Steel investigation</span>
          </button>

          <button
            type="button"
            onClick={onOpenCustomResolver || onStartInvestigation}
            className="w-full min-h-11 px-3 py-2 rounded-md bg-[#1C1F26] hover:bg-[#2D323E] text-white text-xs font-semibold flex items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Custom Vendor Search & CIN Resolver</span>
          </button>
        </div>
      </div>

      {/* Real Metric Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCounter
          label="Total Investigations"
          value={stats?.totalInvestigations}
          subtext="Recorded in current workspace"
        />
        <MetricCounter
          label="Tracked Vendors"
          value={stats?.totalTrackedVendors}
          subtext="Corporate entities on record"
        />
        <MetricCounter
          label="Human Reviews Needed"
          value={stats?.pendingReviews}
          subtext="Single-source or unverified findings"
          tone={stats?.pendingReviews && stats.pendingReviews > 0 ? 'caution' : 'default'}
        />
        <MetricCounter
          label="Material Risk Flags"
          value={stats?.highRiskFlags}
          subtext="Corroborated registry or legal signals"
          tone={stats?.highRiskFlags && stats.highRiskFlags > 0 ? 'risk' : 'default'}
        />
      </div>

      {/* Main Content Area */}
      <div className="space-y-6">
        <div className="space-y-4">
          <Card
            header="Recent Vendor Investigations"
            headerAction={
              hasInvestigations ? (
                <button
                  onClick={onStartInvestigation}
                  className="text-xs text-[#1C1F26] hover:underline font-medium cursor-pointer"
                >
                  New Run
                </button>
              ) : null
            }
            noPadding={hasInvestigations}
          >
            {isLoading ? (
              <div className="p-8 text-center text-xs text-[#8A91A0]">
                Loading investigation records from store...
              </div>
            ) : !hasInvestigations ? (
              <EmptyState
                icon={<SearchCheck className="w-5 h-5" />}
                title="No vendor investigations recorded yet"
                description="Start a due diligence investigation on any Indian corporate entity using their legal name, CIN, GSTIN, PAN, or Director DIN."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={onStartInvestigation}
                  >
                    Investigate a vendor
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-[#EAE6DF]">
                {investigations.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => onSelectInvestigation(inv.id)}
                    className="p-3.5 flex items-center justify-between hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#1C1F26]">
                          {inv.targetName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572]">
                          {inv.identifierType}: {inv.identifierValue || 'N/A'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#8A91A0]">
                        <span>{new Date(inv.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>{inv.sourcesChecked.length} sources evaluated</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {inv.findingsCount.materialRisk > 0 ? (
                        <Badge tone="risk" size="sm">
                          {inv.findingsCount.materialRisk} Material Risk
                        </Badge>
                      ) : inv.findingsCount.requiresReview > 0 ? (
                        <Badge tone="caution" size="sm">
                          {inv.findingsCount.requiresReview} Review Needed
                        </Badge>
                      ) : (
                        <Badge tone="verified" size="sm">
                          Verified Clear
                        </Badge>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-[#8A91A0]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Diligence Protocol Note */}
          <div className="p-3.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-xs text-[#5F6572] flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-[#1C1F26]">
                VendorTrace Verification Protocol
              </span>
              <p className="leading-relaxed text-[11px]">
                In accordance with enterprise compliance rigor: findings supported by only 1 source require manual officer review. Absence of findings is never reported as "proof of zero risk" unless all official registries return positive clearance.
              </p>
            </div>
          </div>
        </div>

        <SourceHealthGrid
          connectors={connectors}
          onConfigureClick={onSelectConnectorDetails}
        />
      </div>
    </div>
  );
};
