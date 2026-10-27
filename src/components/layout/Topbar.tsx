import React, { useState } from 'react';
import {
  Building,
  ShieldCheck,
  Activity,
  HelpCircle,
  Menu,
  AlertTriangle,
  Sparkles,
  Zap,
  Info,
  X,
} from 'lucide-react';

interface TopbarProps {
  currentWorkspace: string;
  onOpenHelp: () => void;
  onOpenMobileMenu?: () => void;
  isBackendHealthy: boolean;
  isDemoMode: boolean;
  onToggleMode: (mode: 'DEMO' | 'LIVE') => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentWorkspace,
  onOpenHelp,
  onOpenMobileMenu,
  isBackendHealthy,
  isDemoMode,
  onToggleMode,
}) => {
  const [showConnectorWarningModal, setShowConnectorWarningModal] = useState<boolean>(false);
  const [connectorHealth, setConnectorHealth] = useState<any>(null);

  const handleSelectLiveMode = async () => {
    try {
      const res = await fetch('/api/health/integrations');
      if (res.ok) {
        const data = await res.json();
        setConnectorHealth(data);
        const hasUnconfigured = data.integrations?.some((i: any) => !i.configured);
        if (hasUnconfigured) {
          setShowConnectorWarningModal(true);
          return;
        }
      }
    } catch {
      // Ignore network failure and proceed with warning
    }
    onToggleMode('LIVE');
  };

  return (
    <>
      {/* Persistent Prominent Header Banner when in Demo Mode */}
      {isDemoMode && (
        <div className="bg-amber-400 text-amber-950 px-4 py-1.5 text-center font-bold text-xs tracking-wide flex items-center justify-center gap-2 border-b border-amber-500 shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-900" />
          <span>
            DEMO DATA — SYNTHETIC EXAMPLE: Entirely fictional company and evidence for demonstration. Not real findings or allegations.
          </span>
          <button
            type="button"
            onClick={handleSelectLiveMode}
            className="ml-2 px-2 py-0.5 bg-amber-900 text-white rounded text-[10px] font-bold hover:bg-black cursor-pointer uppercase"
          >
            Switch to Live Mode
          </button>
        </div>
      )}

      <header className="h-14 min-h-14 shrink-0 bg-white border-b border-[#EAE6DF] px-5 flex items-center justify-between sticky top-0 z-30">
        {/* Left: Mobile trigger & Workspace Indicator */}
        <div className="h-full min-w-0 flex items-center gap-3">
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="md:hidden p-1.5 text-[#5F6572] hover:text-[#1C1F26] rounded hover:bg-[#F4F1EA]"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="h-full flex items-center gap-2 text-xs">
            <span className="text-[#8A91A0] font-medium hidden sm:inline">Workspace:</span>
            <div className="min-h-9 flex items-center gap-1.5 px-2 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#1C1F26] font-medium">
              <Building className="w-3.5 h-3.5 text-[#5F6572]" />
              <span>{currentWorkspace}</span>
            </div>
          </div>
        </div>

        {/* Center/Right: Mode Switcher & Health */}
        <div className="h-full shrink-0 flex items-center gap-3 text-xs">
          {/* Mode Switcher Pill */}
          <div className="min-h-9 flex items-center bg-[#FAF8F5] p-0.5 rounded border border-[#D5CEC2]">
            <button
              type="button"
              onClick={() => onToggleMode('DEMO')}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 text-[11px] font-bold cursor-pointer transition-colors ${
                isDemoMode
                  ? 'bg-amber-400 text-amber-950 shadow-xs'
                  : 'text-[#5F6572] hover:text-[#1C1F26]'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-800" />
              Demo (Synthetic)
            </button>
            <button
              type="button"
              onClick={handleSelectLiveMode}
              className={`px-2.5 py-1 rounded flex items-center gap-1.5 text-[11px] font-bold cursor-pointer transition-colors ${
                !isDemoMode
                  ? 'bg-[#1C1F26] text-white shadow-xs'
                  : 'text-[#5F6572] hover:text-[#1C1F26]'
              }`}
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              Live Mode
            </button>
          </div>

          <div className="h-4 w-px bg-[#EAE6DF] hidden sm:block" />

          {/* Backend health status badge */}
          <div className="flex items-center gap-1.5 text-[#5F6572]">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendHealthy ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
              }`}
            />
            <span className="hidden sm:inline text-[11px] font-mono">
              {isBackendHealthy ? 'Engine Online' : 'Connecting...'}
            </span>
          </div>

          <div className="h-4 w-px bg-[#EAE6DF] hidden sm:block" />

          {/* Methodology popup trigger */}
          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 text-[#5F6572] hover:text-[#1C1F26] px-2 py-1 rounded hover:bg-[#F4F1EA] transition-colors cursor-pointer text-xs font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#8A91A0]" />
            <span className="hidden sm:inline">Verification Standards</span>
          </button>
        </div>
      </header>

      {/* Live Mode Connector Confirmation Modal */}
      {showConnectorWarningModal && (
        <div className="fixed inset-0 bg-[#1C1F26]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-[#D5CEC2] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 rounded-md">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1F26]">
                    Live Connector Readiness Check
                  </h3>
                  <span className="text-[11px] text-[#5F6572]">
                    Truthful Provider State Verification
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectorWarningModal(false)}
                className="text-[#8A91A0] hover:text-[#1C1F26] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#5F6572] leading-relaxed">
              In accordance with VendorTrace zero-fabrication guarantees: Live investigations require authentic upstream registry access. The current server environment reports:
            </p>

            <div className="bg-[#FAF8F5] p-3 rounded border border-[#EAE6DF] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#1C1F26]">IndiaCos Registry API:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  {connectorHealth?.integrations?.find((i: any) => i.providerId === 'indiacos')?.configured ? 'Configured' : 'Key Not Set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#1C1F26]">TinyFish Web Agent:</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  {connectorHealth?.integrations?.find((i: any) => i.providerId === 'tinyfish')?.configured ? 'Configured' : 'Key Not Set'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#8A91A0]">
              If keys are absent, Live Mode will honestly report unconfigured connector statuses rather than inventing synthetic findings.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EAE6DF]">
              <button
                type="button"
                onClick={() => setShowConnectorWarningModal(false)}
                className="px-3 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-xs font-semibold text-[#5F6572] hover:bg-white cursor-pointer"
              >
                Stay in Demo Mode
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConnectorWarningModal(false);
                  onToggleMode('LIVE');
                }}
                className="px-3.5 py-1.5 bg-[#1C1F26] text-white rounded text-xs font-semibold hover:bg-[#2D323E] cursor-pointer"
              >
                Proceed to Live Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
