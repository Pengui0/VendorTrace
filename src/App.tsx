/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { Sidebar, NavigationTab } from './components/layout/Sidebar.js';
import { Topbar } from './components/layout/Topbar.js';
import { OverviewView } from './components/overview/OverviewView.js';
import { InvestigationView } from './components/investigations/InvestigationView.js';
import { VendorsView } from './components/vendors/VendorsView.js';
import { MonitoringView } from './components/monitoring/MonitoringView.js';
import { SettingsView } from './components/settings/SettingsView.js';
import { HelpModal } from './components/common/HelpModal.js';
import { ConnectorModal } from './components/common/ConnectorModal.js';
import { IdentifierType, Investigation, SourceConnector, WorkspaceStats } from './types/vendor.js';
import {
  DEMO_INVESTIGATION_RUN_1,
  DEMO_INVESTIGATION_RUN_2,
} from './server/demo/demoDataset.js';
import { DemoScenarioWalkthrough } from './components/investigations/DemoScenarioWalkthrough.js';
import { InvestigationHistoryView } from './components/investigations/InvestigationHistoryView.js';
import { getInvestigationIdentityKey, keepLatestInvestigationPerIdentity } from './utils/investigationIdentity.js';
import { LiveEvidenceView } from './components/investigations/LiveEvidenceView.js';
import { openCustomVendorSearch } from './components/overview/customVendorSearch.js';
import { getStorageReadError, loadWorkspace, updateWorkspace, WorkspaceSnapshot } from './persistence/localStore.js';

export default function App() {
  const [savedWorkspace] = useState<WorkspaceSnapshot>(() => loadWorkspace());
  const [currentTab, setCurrentTab] = useState<NavigationTab>(() => {
    const savedId = savedWorkspace.preferences.currentInvestigationId;
    return typeof savedId === 'string' && savedWorkspace.investigations.some((item) => item.id === savedId) ? 'investigations' : 'overview';
  });
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => savedWorkspace.preferences.executionMode !== 'LIVE');
  const [workspace] = useState('Tata Steel Ltd. • Vendor Due Diligence');
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [connectors, setConnectors] = useState<SourceConnector[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>(() => savedWorkspace.investigations);
  // Restore only the report explicitly marked active in this browser workspace. Starting a fresh
  // investigation clears this preference, so an unrelated historical report is never selected.
  const [currentInvestigation, setCurrentInvestigation] = useState<Investigation | null>(() => {
    const savedId = savedWorkspace.preferences.currentInvestigationId;
    return typeof savedId === 'string' ? savedWorkspace.investigations.find((item) => item.id === savedId) || null : null;
  });
  const [investigationSubTab, setInvestigationSubTab] = useState<'resolution' | 'evidence' | 'graph' | 'sources'>('evidence');
  const [investigationDraft, setInvestigationDraft] = useState<{ targetName: string; identifierType: IdentifierType; identifierValue: string } | null>(null);
  const [monitoringSelection, setMonitoringSelection] = useState<{ baselineId: string; latestId: string } | null>(null);
  const [investigationWorkspaceKey, setInvestigationWorkspaceKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackendHealthy, setIsBackendHealthy] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<SourceConnector | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => savedWorkspace.preferences.sidebarCollapsed === true);
  const [notification, setNotification] = useState<string | null>(null);
  const activeInvestigationRunIdRef = useRef<string | null>(null);
  const openNewInvestigation = (draft: { targetName: string; identifierType: IdentifierType; identifierValue: string } | null = null) => {
    setCurrentInvestigation(null);
    setInvestigationDraft(draft);
    updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, currentInvestigationId: null } }));
    setInvestigationSubTab('resolution');
    setInvestigationWorkspaceKey((key) => key + 1);
    setCurrentTab('investigations');
  };
  const handleNavigation = (tab: NavigationTab) => {
    setCurrentTab(tab);
  };
  const toggleSidebar = () => {
    const collapsed = !isSidebarCollapsed;
    setIsSidebarCollapsed(collapsed);
    updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, sidebarCollapsed: collapsed } }));
  };
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    if (getStorageReadError()) setStorageWarning(getStorageReadError());
    const onStorageError = (event: Event) => setStorageWarning((event as CustomEvent<string>).detail);
    window.addEventListener('vendortrace-storage-error', onStorageError);
    return () => window.removeEventListener('vendortrace-storage-error', onStorageError);
  }, []);

  useEffect(() => {
    updateWorkspace((current) => ({ ...current, investigations }));
  }, [investigations]);

  // Fetch initial system state
  const loadWorkspaceData = async () => {
    try {
      // 1. Health check
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        setIsBackendHealthy(true);
      }

      // 2. Connectors
      const connRes = await fetch('/api/connectors');
      if (connRes.ok) {
        const connData = await connRes.json();
        setConnectors(connData.connectors || []);
      }

      // 3. Stats (real counts, no mock numbers)
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // 4. Historical investigations
      const invRes = await fetch('/api/investigations');
      if (invRes.ok) {
        const invData = await invRes.json();
        // An empty dev-server repository is not authoritative over browser history.
        if (invData.investigations?.length) {
          setInvestigations((previous) => {
            const merged = new Map(previous.map((item) => [item.id, item]));
            invData.investigations.forEach((item: Investigation) => merged.set(item.id, item));
            return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        }
      }
    } catch (err) {
      console.error('Error loading initial workspace data:', err);
      setIsBackendHealthy(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  // Handle new due diligence run
  const handleInvestigate = async (params: {
    targetName: string;
    identifierType: IdentifierType;
    identifierValue: string;
    gstin?: string;
  }) => {
    setIsLoading(true);
    setNotification(null);
    setCurrentTab('investigations');
    setCurrentInvestigation(null);
    setInvestigationSubTab('resolution');
    const clientRunId = crypto.randomUUID();
    activeInvestigationRunIdRef.current = clientRunId;

    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...params, useMock: isDemoMode, clientRunId }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to execute investigation');
      }

      const newInv: Investigation = await res.json();
      setCurrentInvestigation(newInv);
      updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, currentInvestigationId: newInv.id } }));
      setInvestigations((prev) => [newInv, ...prev]);
      setCurrentTab('investigations');
      setNotification(newInv.status === 'CANCELLED'
        ? `Investigation cancelled for ${newInv.targetName}. Completed task results and coverage gaps were saved.`
        : newInv.status === 'PARTIAL_FAILURE'
        ? `Partial investigation completed for ${newInv.targetName}. Coverage gaps are included in the saved report.`
        : newInv.status === 'FAILED'
        ? `Investigation failed for ${newInv.targetName}. The report includes available task results and failure details.`
        : `Investigation completed for ${newInv.targetName}. Report saved to workspace.`);

      // Refresh real stats
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (err: any) {
      const message = err instanceof TypeError && /fetch/i.test(err.message)
        ? 'VendorTrace could not reach its investigation API. Check that the backend server is running, then retry. Your investigation was not confirmed as saved.'
        : `Investigation failed: ${err?.message || 'The server returned an unexpected response.'}`;
      alert(message);
    } finally {
      if (activeInvestigationRunIdRef.current === clientRunId) {
        activeInvestigationRunIdRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const handleCancelInvestigation = async () => {
    const runId = activeInvestigationRunIdRef.current;
    if (!runId) return;
    try {
      const response = await fetch('/api/investigations/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
      setNotification(result.message);
    } catch (error: any) {
      setNotification(`Cancellation could not be confirmed: ${error.message}`);
    }
  };

  const handleSelectInvestigation = (id: string) => {
    const found = investigations.find((i) => i.id === id)
      || (id === DEMO_INVESTIGATION_RUN_1.id ? DEMO_INVESTIGATION_RUN_1 : id === DEMO_INVESTIGATION_RUN_2.id ? DEMO_INVESTIGATION_RUN_2 : undefined);
    if (found) {
      setInvestigationDraft(null);
      setMonitoringSelection(null);
      setCurrentInvestigation(found);
      updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, currentInvestigationId: found.id } }));
      setCurrentTab('investigations');
      setInvestigationSubTab('evidence');
    }
  };

  const handleDeleteInvestigation = async (id: string) => {
    const target = investigations.find((item) => item.id === id);
    if (!target) throw new Error('This report is no longer in the workspace. Refresh the page and try again.');
    const response = await fetch(`/api/investigations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: {
        targetName: target.targetName,
        identifierType: target.identifierType,
        identifierValue: target.identifierValue,
      } }),
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const error = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};
      if (response.status === 404) {
        throw new Error('Report deletion is not available in the running server yet. Restart the VendorTrace server, refresh this page, and try again.');
      }
      throw new Error(error.error || `Report history could not be deleted (server returned HTTP ${response.status}).`);
    }
    const result = await response.json();
    const deletedIds = new Set<string>(result.deletedIds || [id]);
    const identityKey = getInvestigationIdentityKey(target);
    setInvestigations((previous) => previous.filter((item) =>
      !deletedIds.has(item.id) && getInvestigationIdentityKey(item) !== identityKey
    ));
    setCurrentInvestigation((current) => current && getInvestigationIdentityKey(current) === identityKey ? null : current);
    setNotification(`Removed ${target.targetName} and its duplicate runs from report history.`);
  };

  const handleTriggerReRun = (inv: Investigation) => {
    handleInvestigate({
      targetName: inv.targetName,
      identifierType: inv.identifierType,
      identifierValue: inv.identifierValue,
    });
  };

  const handleLoadScenarioStep = (stepNumber: number) => {
    if (stepNumber === 1) {
      setCurrentInvestigation(DEMO_INVESTIGATION_RUN_1);
      setCurrentTab('investigations');
      setInvestigationSubTab('resolution');
    } else if (stepNumber === 4) {
      setCurrentInvestigation(DEMO_INVESTIGATION_RUN_1);
      setCurrentTab('investigations');
      setInvestigationSubTab('graph');
    } else if (stepNumber <= 5) {
      setCurrentInvestigation(DEMO_INVESTIGATION_RUN_1);
      setCurrentTab('investigations');
      setInvestigationSubTab('evidence');
    } else {
      setCurrentInvestigation(DEMO_INVESTIGATION_RUN_2);
      setCurrentTab('monitoring');
    }
  };

  const activeConnectorsCount = connectors.filter((c) => c.status === 'HEALTHY').length;
  const uniqueInvestigationCount = keepLatestInvestigationPerIdentity(investigations).length;
  const displayStats = stats && investigations.length > 0 ? {
    ...stats,
    totalInvestigations: investigations.length,
    totalTrackedVendors: uniqueInvestigationCount,
    pendingReviews: investigations.reduce((total, item) => total + (item.findingsCount.requiresReview || 0), 0),
    highRiskFlags: investigations.reduce((total, item) => total + (item.findingsCount.materialRisk || 0), 0),
  } : stats;

  return (
    <div className="h-screen flex overflow-hidden bg-[#FAF8F5] text-[#1C1F26]">
      {/* Desktop Sidebar */}
      <div className={`hidden md:block h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0' : 'w-64'}`}>
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleNavigation}
          investigationCount={uniqueInvestigationCount > 0 ? uniqueInvestigationCount : null}
          activeConnectorsCount={activeConnectorsCount}
          totalConnectorsCount={connectors.length}
          onOpenHelp={() => setIsHelpModalOpen(true)}
          onStartInvestigation={() => openNewInvestigation()}
          isNewInvestigation={currentTab === 'investigations' && currentInvestigation === null}
          isInvestigating={isLoading}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      {isSidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
          title="Open navigation"
          className="fixed left-3 top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/70 bg-white/65 text-[#26313F] shadow-[0_8px_30px_rgba(28,31,38,0.18)] backdrop-blur-xl transition duration-200 hover:scale-105 hover:bg-white/85 hover:shadow-[0_12px_36px_rgba(28,31,38,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:flex"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
      )}

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#1C1F26]/40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative z-10">
            <Sidebar
              currentTab={currentTab}
              onSelectTab={(tab) => {
                handleNavigation(tab);
                setIsMobileMenuOpen(false);
              }}
              investigationCount={uniqueInvestigationCount > 0 ? uniqueInvestigationCount : null}
              activeConnectorsCount={activeConnectorsCount}
              totalConnectorsCount={connectors.length}
              onOpenHelp={() => {
                setIsHelpModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              onStartInvestigation={() => {
                openNewInvestigation();
                setIsMobileMenuOpen(false);
              }}
              isNewInvestigation={currentTab === 'investigations' && currentInvestigation === null}
              isInvestigating={isLoading}
              onToggleCollapse={() => undefined}
            />
          </div>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-y-auto">
        <Topbar
          currentWorkspace={workspace}
          onOpenHelp={() => setIsHelpModalOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          isBackendHealthy={isBackendHealthy}
          isDemoMode={isDemoMode}
          onToggleMode={(mode) => {
            const demoMode = mode === 'DEMO';
            setIsDemoMode(demoMode);
            updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, executionMode: mode } }));
          }}
        />

        {/* Global Notification Banner if present */}
        {notification && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 text-xs text-emerald-800 flex items-center justify-between">
            <span>{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content View */}
        {storageWarning && <div role="alert" className="px-5 py-2 text-xs bg-amber-100 text-amber-950 border-b border-amber-300 flex justify-between">{storageWarning}<button onClick={() => setCurrentTab('settings')} className="underline font-semibold">Open backup options</button></div>}
        <main className="flex-1 p-5 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Guided Demo Walkthrough Banner when Demo Mode is active */}
          {isDemoMode && currentTab === 'overview' && (
            <DemoScenarioWalkthrough
              isDemoMode={isDemoMode}
              onLoadScenarioStep={handleLoadScenarioStep}
              onSwitchToLive={() => {
                setIsDemoMode(false);
                updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, executionMode: 'LIVE' } }));
              }}
            />
          )}
          {currentTab === 'overview' && (
            <OverviewView
              stats={displayStats}
              connectors={connectors}
              investigations={investigations}
              onStartInvestigation={openNewInvestigation}
              onSelectInvestigation={handleSelectInvestigation}
              onSelectConnectorDetails={(conn) => setSelectedConnector(conn)}
              isLoading={isLoading}
              onDirectInvestigate={(draft) => openNewInvestigation(draft)}
              onOpenCustomResolver={() => openCustomVendorSearch(
                (tab) => handleNavigation(tab),
                (tab) => setInvestigationSubTab(tab),
              )}
            />
          )}

          {currentTab === 'investigations' && (
            <InvestigationView
              key={investigationWorkspaceKey}
              currentInvestigation={currentInvestigation}
              investigationDraft={investigationDraft}
              onInvestigate={handleInvestigate}
              onCancelInvestigation={handleCancelInvestigation}
              isLoading={isLoading}
              isDemoMode={isDemoMode}
              activeSubTab={investigationSubTab}
              onSubTabChange={setInvestigationSubTab}
              onOpenMonitoring={() => setCurrentTab('monitoring')}
            />
          )}

          <div className={currentTab === 'live-search' ? 'block' : 'hidden'}>
            <LiveEvidenceView
              investigation={currentInvestigation}
              investigations={investigations}
              isDemoMode={isDemoMode}
              isInvestigating={isLoading}
              onRunFullInvestigation={handleInvestigate}
            />
          </div>

          {currentTab === 'history' && (
            <InvestigationHistoryView
              investigations={investigations}
              onSelectInvestigation={handleSelectInvestigation}
              onStartInvestigation={openNewInvestigation}
              onDeleteInvestigation={handleDeleteInvestigation}
            />
          )}

          {currentTab === 'vendors' && (
            <VendorsView
              investigations={investigations}
              onStartInvestigation={openNewInvestigation}
              onSelectInvestigation={(invId) => {
                handleSelectInvestigation(invId);
                setCurrentTab('investigations');
              }}
              onCompareInvestigations={(_prevId, _currId) => {
                const selection = { baselineId: _prevId, latestId: _currId };
                setMonitoringSelection(selection);
                const latest = investigations.find((item) => item.id === _currId);
                if (latest) {
                  setCurrentInvestigation(latest);
                  updateWorkspace((current) => ({ ...current, preferences: { ...current.preferences, currentInvestigationId: latest.id } }));
                }
                setCurrentTab('monitoring');
              }}
            />
          )}

          {currentTab === 'monitoring' && (
            <MonitoringView
              investigations={investigations}
              selectedInvestigation={currentInvestigation}
              comparisonSelection={monitoringSelection}
              isDemoMode={isDemoMode}
              onTriggerReRun={handleTriggerReRun}
              isLoading={isLoading}
              onInvestigationUpdated={(updated) => {
                setInvestigations((prev) => [updated, ...prev.filter((i) => i.id !== updated.id)]);
                setCurrentInvestigation(updated);
                loadWorkspaceData();
              }}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView connectors={connectors} />
          )}
        </main>
      </div>

      {/* Methodological Standards Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      {/* Connector Details Modal */}
      <ConnectorModal
        connector={selectedConnector}
        onClose={() => setSelectedConnector(null)}
      />
    </div>
  );
}
