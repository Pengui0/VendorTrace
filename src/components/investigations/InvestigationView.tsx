import React, { useState, useEffect } from 'react';
import { IdentifierType, Investigation } from '../../types/vendor.js';
import { IdentifierInput } from './IdentifierInput.js';
import { InvestigationProgress } from './InvestigationProgress.js';
import { InvestigationSummary } from './InvestigationSummary.js';
import { EvidenceList } from './EvidenceList.js';
import { RelatedEntityNetworkGraph } from './RelatedEntityNetworkGraph.js';
import { LiveLookupWorkflow } from './LiveLookupWorkflow.js';
import { InvestigationLayerSummary } from './InvestigationLayerSummary.js';
import { CompanyProfileCard } from './CompanyProfileCard.js';
import { Tabs } from '../common/Tabs.js';
import { Card } from '../common/Card.js';
import { FileText, Network, CheckCircle2, Building2, SearchCheck, Layers, ExternalLink } from 'lucide-react';
import { ResolvedCompanyProfile } from '../../server/providers/types.js';

interface InvestigationViewProps {
  currentInvestigation: Investigation | null;
  investigationDraft?: { targetName: string; identifierType: IdentifierType; identifierValue: string } | null;
  onInvestigate: (params: {
    targetName: string;
    identifierType: IdentifierType;
    identifierValue: string;
    gstin?: string;
    freshRun?: boolean;
  }) => void;
  onCancelInvestigation: () => void;
  isLoading: boolean;
  isDemoMode: boolean;
  activeSubTab?: 'resolution' | 'evidence' | 'graph' | 'sources';
  onSubTabChange?: (tab: 'resolution' | 'evidence' | 'graph' | 'sources') => void;
  onOpenMonitoring?: () => void;
}

export const InvestigationView: React.FC<InvestigationViewProps> = ({
  currentInvestigation,
  investigationDraft,
  onInvestigate,
  onCancelInvestigation,
  isLoading,
  isDemoMode,
  activeSubTab,
  onSubTabChange,
  onOpenMonitoring,
}) => {
  const [activeTab, setActiveTabState] = useState<'resolution' | 'evidence' | 'graph' | 'sources'>('resolution');

  const setActiveTab = (tab: 'resolution' | 'evidence' | 'graph' | 'sources') => {
    setActiveTabState(tab);
    onSubTabChange?.(tab);
  };

  useEffect(() => {
    if (activeSubTab) {
      setActiveTabState(activeSubTab);
    }
  }, [activeSubTab]);
  const [activeProfile, setActiveProfile] = useState<ResolvedCompanyProfile | null>(null);
  const [selectedGSTIN, setSelectedGSTIN] = useState('');
  // When an investigation starts running, switch to evidence tab so live progress and workstreams are visible
  React.useEffect(() => {
    if (isLoading) {
      setActiveTab('evidence');
    }
  }, [isLoading]);

  const handleEntityResolved = (profile: ResolvedCompanyProfile) => {
    setActiveProfile(profile);
    setSelectedGSTIN(profile.gstins?.length === 1 ? profile.gstins[0] : '');
  };

  const launchInvestigation = (params: { targetName: string; identifierType: IdentifierType; identifierValue: string; gstin?: string; freshRun?: boolean }) => {
    setActiveProfile(null);
    onInvestigate(params);
  };

  const handleLaunchFromProfile = (profile: ResolvedCompanyProfile) => {
    const idType: IdentifierType = profile.cin
      ? 'CIN'
      : profile.gstins.length > 0
      ? 'GSTIN'
      : 'NAME';

    const idValue = profile.cin || profile.gstins[0] || '';

    launchInvestigation({
      targetName: profile.canonicalName,
      identifierType: idType,
      identifierValue: idValue,
      ...(selectedGSTIN ? { gstin: selectedGSTIN } : {}),
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#EAE6DF]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A91A0]">
            {currentInvestigation ? 'Investigation report' : 'New investigation'}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1F26]">
            {currentInvestigation?.targetName || 'Vendor due diligence'}
          </h1>
          <p className="mt-1 text-xs text-[#5F6572]">
            {currentInvestigation
              ? `${currentInvestigation.identifierType}: ${currentInvestigation.identifierValue || 'Name-only'} · Report ${currentInvestigation.id}`
              : 'Start by resolving the legal entity. Review identity details before running source checks.'}
          </p>
        </div>

      </div>

      {/* Primary Investigation Stepper & Tabs */}
      <Tabs
        variant="segmented"
        items={[
          {
            id: 'resolution',
            label: 'Resolve entity',
            icon: <Building2 className="w-3.5 h-3.5" />,
          },
          {
            id: 'evidence',
            label: 'Findings & evidence',
            count: currentInvestigation?.findings.length,
            icon: <FileText className="w-3.5 h-3.5" />,
          },
          {
            id: 'graph',
            label: 'Entity network',
            count: currentInvestigation?.relatedLeads.length,
            icon: <Network className="w-3.5 h-3.5" />,
          },
          {
            id: 'sources',
            label: 'Sources & audit',
            count: currentInvestigation?.sourcesChecked.length,
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Live Lookup & Candidate Disambiguation Workflow */}
      {activeTab === 'resolution' && (
        <div className="space-y-6">
          <LiveLookupWorkflow onEntityResolved={handleEntityResolved} isDemoMode={isDemoMode} />

          {activeProfile && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-emerald-950">
                  Ready to execute full 4-layer due diligence on {activeProfile.canonicalName}
                </span>
                <p className="text-[11px] text-emerald-800">
                  Canonical identifier: {activeProfile.cin ? `CIN ${activeProfile.cin}` : `GSTIN ${activeProfile.gstins[0] || 'N/A'}`} Â· Status: {activeProfile.companyStatus}
                </p>
                {activeProfile.gstins.length > 0 && (
                  <label className="block pt-2 text-[11px] text-emerald-900">
                    GSTIN to verify
                    <select value={selectedGSTIN} onChange={(event) => setSelectedGSTIN(event.target.value)} className="ml-2 rounded border border-emerald-300 bg-white px-2 py-1">
                      <option value="">Select a verified GSTIN</option>
                      {activeProfile.gstins.map((gstin) => <option key={gstin} value={gstin}>{gstin}</option>)}
                    </select>
                  </label>
                )}
                {activeProfile.gstins.length === 0 && <p className="pt-1 text-[11px] text-amber-800">GSTIN needed for GST compliance verification. Supply one before running that check.</p>}
              </div>
              <button
                type="button"
                onClick={() => handleLaunchFromProfile(activeProfile)}
                disabled={activeProfile.gstins.length > 1 && !selectedGSTIN}
                title={activeProfile.gstins.length > 1 && !selectedGSTIN ? 'Select the verified GSTIN to include in bounded tax checks.' : undefined}
                className="px-4 py-2 bg-[#1C1F26] text-white rounded text-xs font-semibold hover:bg-[#2D323E] cursor-pointer shrink-0"
              >
                Launch Investigation
              </button>
            </div>
          )}

          {/* Quick Manual Input Shell */}
          <div className="pt-4 border-t border-[#EAE6DF]">
            <h3 className="text-xs font-bold text-[#8A91A0] uppercase tracking-wider mb-2">
              Direct Due Diligence Execution Shell
            </h3>
            <IdentifierInput initialValues={investigationDraft} onInvestigate={launchInvestigation} isLoading={isLoading} />
          </div>
        </div>
      )}

      {/* Tab 2: Findings & Evidence */}
      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <InvestigationProgress
            isActive={isLoading}
            dimensionResults={currentInvestigation?.dimensionResults}
            coverageGaps={currentInvestigation?.coverageGaps}
            totalDurationMs={currentInvestigation?.totalDurationMs}
            coverageStatus={currentInvestigation?.coverageStatus}
            terminationReason={currentInvestigation?.terminationReason}
            onCancel={onCancelInvestigation}
          />
          {currentInvestigation && (
            <InvestigationLayerSummary investigation={currentInvestigation} onOpenMonitoring={onOpenMonitoring} />
          )}
          <InvestigationSummary investigation={currentInvestigation} />
          <EvidenceList
            findings={currentInvestigation?.findings || []}
            normalizedFindings={currentInvestigation?.normalizedFindings}
            isLoading={isLoading}
            isPartial={Boolean(currentInvestigation?.coverageGaps && currentInvestigation.coverageGaps.length > 0)}
            isStale={Boolean(currentInvestigation?.assessmentReport?.isStale)}
            coverageGaps={currentInvestigation?.coverageGaps}
          />
        </div>
      )}

      {/* Tab 3: Entity Graph & Director Tracing */}
      {activeTab === 'graph' && (
        <div className="space-y-6">
          <RelatedEntityNetworkGraph
            relatedLeads={currentInvestigation?.relatedLeads || []}
            entityGraph={currentInvestigation?.entityGraph}
            targetName={currentInvestigation?.targetName}
          />
        </div>
      )}

      {/* Tab 4: Audit Sources & Registry Logs */}
      {activeTab === 'sources' && (
        <Card header="Evaluated Source Metadata & Timestamp Ledger">
          {!currentInvestigation ? (
            <div className="text-xs text-[#8A91A0] p-4 text-center">
              Execute an investigation or resolve an entity to view registry audit stamps.
            </div>
          ) : currentInvestigation.sourcesChecked.length === 0 ? (
            <div className="p-5 text-center space-y-1">
              <p className="text-sm font-semibold text-[#1C1F26]">No source records are attached to this investigation yet.</p>
              <p className="text-xs text-[#5F6572]">Run an investigation to populate this audit ledger. Missing source records do not indicate a clear result.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAE6DF] text-xs">
              {currentInvestigation.sourcesChecked.map((src, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between">
                  <span className="font-medium text-[#1C1F26]">{src}</span>
                  <span className="text-[11px] font-mono text-[#8A91A0]">
                    Status: Logged Â· Timestamp: {new Date(currentInvestigation.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

    </div>
  );
};
