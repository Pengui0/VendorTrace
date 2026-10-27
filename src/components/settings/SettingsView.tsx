import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import { Button } from '../common/Button.js';
import { Tabs } from '../common/Tabs.js';
import { IntegrationsView } from './IntegrationsView.js';
import { clearWorkspace, exportWorkspaceBackup, loadWorkspace } from '../../persistence/localStore.js';
import { readSavedSettings, saveSettings } from '../../persistence/settingsPersistence.js';
import {
  ShieldCheck,
  Key,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Database,
  Play,
  Sliders,
  Radio,
} from 'lucide-react';

interface SettingsViewProps {
  connectors: Array<{
    id: string;
    name: string;
    isConfigured: boolean;
    status: string;
  }>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ connectors }) => {
  const [activeTab, setActiveTab] = useState<'integrations' | 'persistence' | 'rules'>(() => {
    const saved = readSavedSettings().activeTab;
    return saved === 'persistence' || saved === 'rules' ? saved : 'integrations';
  });

  const [storageStatus, setStorageStatus] = useState<{
    mode: string;
    isDurable: boolean;
    activeAdapterName: string;
    warning?: string;
  } | null>(null);

  const [testReport, setTestReport] = useState<{
    success: boolean;
    storageMode: string;
    isDurable: boolean;
    assertionsPassed: number;
    assertionsFailed: number;
    details: string[];
    error?: string;
  } | null>(() => readSavedSettings().repositoryVerificationReport || null);

  const [isRunningTest, setIsRunningTest] = useState(false);
  const [savedCount, setSavedCount] = useState(() => loadWorkspace().investigations.length);

  useEffect(() => {
    saveSettings({ activeTab });
  }, [activeTab]);

  useEffect(() => {
    fetch('/api/repository/status')
      .then((res) => res.json())
      .then((data) => setStorageStatus(data.status))
      .catch((err) => console.error('Error fetching storage status:', err));
  }, []);

  const handleRunVerification = async () => {
    setIsRunningTest(true);
    try {
      const res = await fetch('/api/repository/verify-persistence', { method: 'POST' });
      const data = await res.json();
      setTestReport(data);
      saveSettings({ repositoryVerificationReport: data });
    } catch (e: any) {
      alert(`Test execution failed: ${e.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#EAE6DF]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1F26]">
            Workspace Settings & System Governance
          </h1>
          <p className="mt-1 text-xs text-[#5F6572]">
            API integration configuration, secret isolation, repository durability, and due-diligence rules.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <Tabs
        variant="segmented"
        items={[
          {
            id: 'integrations',
            label: 'External Integrations (TinyFish & IndiaCos)',
            icon: <Radio className="w-3.5 h-3.5" />,
          },
          {
            id: 'persistence',
            label: 'Persistence & Repository Durability',
            icon: <Database className="w-3.5 h-3.5" />,
          },
          {
            id: 'rules',
            label: 'Diligence Standards & Invariants',
            icon: <ShieldCheck className="w-3.5 h-3.5" />,
          },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Integrations */}
      {activeTab === 'integrations' && <IntegrationsView />}

      {/* Tab 2: Persistence & Repository Audit */}
      {activeTab === 'persistence' && (
        <div className="space-y-4">
          <Card header="Browser Workspace Backup">
            <div className="space-y-3 text-xs text-[#5F6572]">
              <p>Investigation reports and evidence are saved in this browser profile using localStorage. This data is specific to this browser and device; clearing browser site data can erase it. Provider credentials and API keys are never stored here.</p>
              <p>{savedCount} investigation report(s) currently saved in this browser.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => exportWorkspaceBackup()}>Export workspace backup</Button>
                <Button variant="outline" size="sm" onClick={() => {
                  if (window.confirm('Clear all VendorTrace data saved in this browser? This cannot be undone unless you exported a backup.')) {
                    clearWorkspace(); setSavedCount(0); window.location.reload();
                  }
                }}>Clear local application data</Button>
              </div>
            </div>
          </Card>
          <Card
            header="Persistence & Repository Durability Audit"
            headerAction={
              <Button
                variant="outline"
                size="sm"
                isLoading={isRunningTest}
                icon={<Play className="w-3.5 h-3.5 text-[#1C1F26]" />}
                onClick={handleRunVerification}
              >
                Run Synthetic CRUD Test
              </Button>
            }
          >
            <div className="space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-[#5F6572]" />
                  <div>
                    <span className="font-semibold text-[#1C1F26]">Active Repository Adapter:</span>
                    <span className="font-mono text-[11px] text-[#5F6572] ml-1.5">
                      {storageStatus?.activeAdapterName || 'DevInMemoryRepositoryAdapter'}
                    </span>
                  </div>
                </div>
                <div>
                  {storageStatus?.isDurable ? (
                    <Badge tone="verified">Durable (Cloud Firestore)</Badge>
                  ) : (
                    <Badge tone="caution">Development-Only (Non-Durable)</Badge>
                  )}
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded text-amber-900 text-[11px] leading-relaxed flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Explicit Durability Transparency Notice:</strong>
                  {storageStatus?.warning ||
                    'This application is currently using the Development-Only In-Memory Adapter. Entity state resides in server memory and resets on server reload. When Google Cloud Firestore is provisioned, records persist durably.'}
                </div>
              </div>

              {testReport && (
                <div className="mt-4 p-4 bg-white border border-[#D5CEC2] rounded space-y-3">
                  <div className="flex items-center justify-between border-b border-[#EAE6DF] pb-2">
                    <span className="font-bold text-[#1C1F26]">
                      Repository CRUD Persistence Verification Report
                    </span>
                    <Badge tone={testReport.success ? 'verified' : 'risk'}>
                      {testReport.assertionsPassed} Assertions Passed ({testReport.assertionsFailed} Failed)
                    </Badge>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px] text-[#5F6572] bg-[#FCFBF9] p-2.5 rounded border border-[#EAE6DF]">
                    {testReport.details.map((d, i) => (
                      <div key={i} className={d.includes('[FAIL]') ? 'text-red-700 font-bold' : ''}>
                        {d}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Diligence Invariants */}
      {activeTab === 'rules' && (
        <Card header="Enforced Diligence Invariants & Ethics">
          <div className="space-y-3 text-xs text-[#5F6572]">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#1C1F26]">Two-Source Corroboration Rule: </strong>
                Any finding corroborated across &ge; 2 independent registries is marked as verified. Single-source findings automatically route to the compliance officer review queue.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#1C1F26]">Zero-Fabrication Mandate: </strong>
                Unchecked or unconfigured sources are never presumed clean. Absence of findings without verified registry confirmation is labeled as "Source Unavailable / Not Checked".
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#1C1F26]">Lawful Tracing Safeguard: </strong>
                Shared directorships, registered office addresses, or common holding entities represent investigation leads, never prima facie evidence of wrongdoing.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#1C1F26]">Secret Governance Protocol: </strong>
                Secrets are entered in platform Secret manager environments only. UI inputs for API tokens are prohibited to prevent browser exposure.
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
