import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card.js';
import { Button } from '../common/Button.js';
import { Badge } from '../common/Badge.js';
import { CandidateSelectionModal } from './CandidateSelectionModal.js';
import { buildCustomResolverPayload, isValidCandidate, profileMatchesCandidate, resolutionModeLabel, CustomVendorSearchInput } from '../overview/customVendorSearch.js';
import { CompanyProfileCard } from './CompanyProfileCard.js';
import {
  detectIdentifierKind,
  IdentifierDetectionResult,
} from '../../server/providers/identifierDetector.js';
import {
  CandidateEntity,
  ResolvedCompanyProfile,
} from '../../server/providers/types.js';
import {
  Search,
  Building2,
  Sparkles,
  Database,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface LiveLookupWorkflowProps {
  onEntityResolved?: (profile: ResolvedCompanyProfile) => void;
  isDemoMode: boolean;
}

export const LiveLookupWorkflow: React.FC<LiveLookupWorkflowProps> = ({
  onEntityResolved,
  isDemoMode,
}) => {
  const [searchInput, setSearchInput] = useState<CustomVendorSearchInput>({ legalName: '', cin: '', gstin: '', websiteUrl: '' });
  const queryInput = searchInput.cin.trim() || searchInput.gstin.trim() || searchInput.legalName.trim();
  const useMock = isDemoMode;
  const [isLoading, setIsLoading] = useState(false);
  const [detection, setDetection] = useState<IdentifierDetectionResult>(() =>
    detectIdentifierKind('L27100MH1907PLC000260')
  );
  const [resolvedProfile, setResolvedProfile] = useState<ResolvedCompanyProfile | null>(null);
  const [candidates, setCandidates] = useState<CandidateEntity[]>([]);
  const [isDisambiguationOpen, setIsDisambiguationOpen] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [unitTestReport, setUnitTestReport] = useState<any | null>(null);
  const [isRunningUnitTests, setIsRunningUnitTests] = useState(false);
  const [resolvedMode, setResolvedMode] = useState<'Demo fixture' | 'Live provider' | null>(null);

  useEffect(() => setDetection(detectIdentifierKind(queryInput)), [queryInput]);

  const fetchCacheStats = async () => {
    try {
      const res = await fetch('/api/integrations/indiacos/cache-stats');
      if (res.ok) setCacheStats(await res.json());
    } catch (e) {
      console.error('Error fetching cache stats:', e);
    }
  };

  useEffect(() => {
    fetchCacheStats();
  }, [resolvedProfile]);

  const handleResolve = async (candidateToConfirm?: CandidateEntity) => {
    setIsLoading(true);
    setResolutionMessage(null);
    setResolvedProfile(null);

    try {
      const payload = buildCustomResolverPayload(searchInput, useMock, candidateToConfirm);
      const res = await fetch('/api/integrations/indiacos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Resolution failed');
      }

      if (Boolean(data.isMock) !== useMock) throw new Error('Resolver mode did not match the selected Demo/Live mode. No result was accepted.');
      if (data.profile && payload.cin && String(data.profile.cin || '').toUpperCase() !== payload.cin) throw new Error('Resolved company CIN does not match the CIN you entered. Review the result before continuing.');
      if (data.profile && payload.gstin && !(data.profile.gstins || []).some((identifier: string) => identifier.toUpperCase() === payload.gstin)) throw new Error('Resolved company GSTIN does not match the GSTIN you entered. Review the result before continuing.');
      if (data.profile && candidateToConfirm && !profileMatchesCandidate(data.profile, candidateToConfirm)) throw new Error('The resolver response does not match the company candidate you selected. Please retry the search.');

      if (data.requiresDisambiguation || (data.profile?.identityMatchMethod === 'NAME_MATCH' && !candidateToConfirm)) {
        const rawCandidates = data.candidates || (data.profile ? [{
          id: `profile-${data.profile.canonicalName}-${data.profile.cin || data.profile.gstins?.[0] || ''}`,
          canonicalName: data.profile.canonicalName,
          tradeName: data.profile.tradeName || undefined,
          identifierType: data.profile.cin ? 'CIN' : data.profile.gstins?.length ? 'GSTIN' : data.profile.llpin ? 'LLPIN' : 'PAN',
          identifierValue: data.profile.cin || data.profile.gstins?.[0] || data.profile.llpin || data.profile.pan,
          companyStatus: data.profile.companyStatus,
          entityType: data.profile.entityType,
          registeredAddress: data.profile.registeredOffice,
          sourceUrl: data.profile.sourceUrl,
          identityMatchMethod: 'NAME_MATCH',
          ambiguityNote: 'Name-only result. Confirm the legal entity before continuing.',
        }] : []);
        if (!Array.isArray(rawCandidates) || rawCandidates.length === 0 || !rawCandidates.every(isValidCandidate)) {
          throw new Error('Resolver returned invalid company candidate data. Please retry or check provider availability.');
        }
        setCandidates(rawCandidates);
        setIsDisambiguationOpen(true);
        setResolutionMessage('Identity match needs your review. Select the correct legal entity to confirm it.');
      } else if (data.profile) {
        setResolvedProfile(data.profile);
        setResolvedMode(resolutionModeLabel(Boolean(data.isMock)));
        setIsDisambiguationOpen(false);
        setResolutionMessage(data.message);
        if (onEntityResolved) onEntityResolved(data.profile);
      } else {
        const status = String(data.status || '').toUpperCase();
        if (['NOT_CONFIGURED', 'UNAVAILABLE', 'RATE_LIMITED', 'UPSTREAM_FAILURE'].includes(status)) {
          throw new Error(useMock ? 'Demo resolver fixtures are unavailable.' : `Live resolver provider is unavailable${data.message ? `: ${data.message}` : '.'}`);
        }
        throw new Error(data.message || 'Company could not be resolved. Check the legal name or identifier and try again.');
      }
    } catch (e: any) {
      setResolutionMessage(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunIndiacosSuite = async () => {
    setIsRunningUnitTests(true);
    try {
      const res = await fetch('/api/integrations/indiacos/verify-suite', { method: 'POST' });
      const data = await res.json();
      setUnitTestReport(data);
      fetchCacheStats();
    } catch (e: any) {
      alert(`Unit test suite failed: ${e.message}`);
    } finally {
      setIsRunningUnitTests(false);
    }
  };

  const loadPreset = (query: string) => {
    const detected = detectIdentifierKind(query);
    setSearchInput({ legalName: detected.kind === 'COMPANY_NAME' ? query : '', cin: detected.kind === 'CIN' ? detected.normalizedValue : '', gstin: detected.kind === 'GSTIN' ? detected.normalizedValue : '', websiteUrl: '' });
    setResolvedProfile(null);
    setResolvedMode(null);
    setCandidates([]);
    setResolutionMessage(null);
  };

  return (
    <div className="space-y-4">
      {/* Test Lookup Controls Card */}
      <Card
        header="IndiaCos Vendor Identity Resolution Workflow"
        headerAction={
          <span className={`text-[11px] font-semibold px-2 py-1 rounded ${useMock ? 'bg-purple-50 text-purple-800' : 'bg-blue-50 text-blue-800'}`}>Current mode: {useMock ? 'Demo fixtures' : 'Live provider'}</span>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Quick Scenario Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-[#8A91A0] mr-1">Official Test Scenarios:</span>
            <button
              type="button"
              onClick={() => loadPreset('L27100MH1907PLC000260')}
              className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
            >
              Tata Steel (CIN)
            </button>
            <button
              type="button"
              onClick={() => loadPreset('07AAAAA0000A1Z5')}
              className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
            >
              Sharma Fasteners (Proprietor GSTIN - No CIN)
            </button>
            <button
              type="button"
              onClick={() => loadPreset('AAA-1234')}
              className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
            >
              Apex Digital (LLPIN)
            </button>
            <button
              type="button"
              onClick={() => loadPreset('Apex Infra')}
              className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
            >
              Apex Infra (Multi-Match Ambiguity)
            </button>
          </div>

          {/* Input & Live Format Detector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#1C1F26]">Company search details</label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#8A91A0]">Detected Format:</span>
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-[#1C1F26] border border-slate-200">
                  {detection.kind}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={searchInput.legalName} onChange={(e) => setSearchInput({ ...searchInput, legalName: e.target.value })} placeholder="Company legal name" className="px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded" />
              <input value={searchInput.cin} onChange={(e) => setSearchInput({ ...searchInput, cin: e.target.value })} placeholder="CIN (optional)" className="px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#D5CEC2] rounded" />
              <input value={searchInput.gstin} onChange={(e) => setSearchInput({ ...searchInput, gstin: e.target.value })} placeholder="GSTIN (optional)" className="px-3 py-2 text-xs font-mono bg-[#FAF8F5] border border-[#D5CEC2] rounded" />
              <input value={searchInput.websiteUrl} onChange={(e) => setSearchInput({ ...searchInput, websiteUrl: e.target.value })} placeholder="Public website URL (optional)" className="px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                isLoading={isLoading}
                onClick={() => handleResolve()}
                className="shrink-0"
              >
                Resolve Entity
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#5F6572] pt-0.5">
              <span>{queryInput ? detection.helperMessage : 'Enter a legal name, CIN, or GSTIN. Website is optional.'}</span>
              {cacheStats && (
                <span className="text-[10px] text-[#8A91A0] font-mono">
                  Registry Cache: {cacheStats.hits} Hits · {cacheStats.size} Items (24h TTL)
                </span>
              )}
            </div>
          </div>

          {/* Feedback narrative */}
          {resolutionMessage && (
            <div className="p-2.5 rounded bg-[#FCFBF9] border border-[#EAE6DF] text-[11px] text-[#5F6572] flex items-center justify-between">
              <span>{resolutionMessage}</span>
              {resolvedProfile && (
                <span className="font-semibold text-emerald-700">
                  {resolvedMode || (resolvedProfile.isCached ? (useMock ? 'Demo fixture cache' : 'Live provider cache') : useMock ? 'Demo fixture result' : 'Live provider result')}
                </span>
              )}
            </div>
          )}

          {/* Footer Actions: Run Test Suite */}
          <div className="pt-2 border-t border-[#EAE6DF] flex items-center justify-between text-[11px]">
            <span className="text-[#8A91A0]">
              In accordance with official IndiaCos schema: Propagates verified identifiers and timestamps.
            </span>
            <Button
              variant="outline"
              size="sm"
              isLoading={isRunningUnitTests}
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={handleRunIndiacosSuite}
            >
              Run IndiaCos Unit Tests (29 Paths)
            </Button>
          </div>
        </div>
      </Card>

      {/* Unit Test Report Banner if run */}
      {unitTestReport && (
        <Card
          header="IndiaCos Vendor Resolution Unit Test Report"
          headerAction={
            <Badge tone={unitTestReport.success ? 'verified' : 'risk'}>
              {unitTestReport.assertionsPassed} Assertions Passed ({unitTestReport.assertionsFailed} Failed)
            </Badge>
          }
        >
          <div className="space-y-2 text-xs">
            <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[10px] text-[#5F6572] bg-[#FCFBF9] p-2.5 rounded border border-[#EAE6DF]">
              {unitTestReport.details.map((d: string, i: number) => (
                <div key={i} className={d.includes('[FAIL]') ? 'text-red-700 font-bold' : ''}>
                  {d}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Disambiguation Modal */}
      <CandidateSelectionModal
        isOpen={isDisambiguationOpen}
        query={queryInput}
        candidates={candidates}
        onSelectCandidate={(chosen) => {
          handleResolve(chosen);
        }}
        onCancel={() => setIsDisambiguationOpen(false)}
        isLoading={isLoading}
      />

      {/* Resolved Company Profile */}
      {resolvedProfile && (
        <>
          <div className={`p-2 rounded text-xs font-semibold ${resolvedMode === 'Demo fixture' ? 'bg-purple-50 text-purple-900' : 'bg-blue-50 text-blue-900'}`}>Resolution source: {resolvedMode}. {resolvedMode === 'Demo fixture' ? 'Synthetic fixtures; not a live registry result.' : 'Live provider response.'}</div>
          <CompanyProfileCard profile={resolvedProfile} />
        </>
      )}
    </div>
  );
};
