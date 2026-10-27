import React from 'react';
import {
  LayoutDashboard,
  SearchCheck,
  Building2,
  GitCompareArrows,
  SlidersHorizontal,
  ShieldCheck,
  HelpCircle,
  History,
  Radio,
  Plus,
  PanelLeftClose,
} from 'lucide-react';

export type NavigationTab = 'overview' | 'investigations' | 'live-search' | 'history' | 'vendors' | 'monitoring' | 'settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  investigationCount?: number | null;
  activeConnectorsCount: number;
  totalConnectorsCount: number;
  onOpenHelp: () => void;
  onStartInvestigation: () => void;
  isNewInvestigation: boolean;
  isInvestigating: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  investigationCount,
  activeConnectorsCount,
  totalConnectorsCount,
  onOpenHelp,
  onStartInvestigation,
  isNewInvestigation,
  isInvestigating,
  onToggleCollapse,
}) => {
  const navGroups = [
    { label: 'Workspace', items: [
    {
      id: 'overview' as NavigationTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'investigations' as NavigationTab,
      label: 'Investigation workspace',
      icon: SearchCheck,
      badge: null,
    },
    {
      id: 'live-search' as NavigationTab,
      label: 'Live source search',
      icon: Radio,
      badge: 'LIVE',
      isLive: true,
    },
    ] },
    { label: 'Records', items: [
    {
      id: 'vendors' as NavigationTab,
      label: 'Vendors',
      icon: Building2,
      badge: null,
    },
    ] },
    { label: 'Review', items: [
    {
      id: 'history' as NavigationTab,
      label: 'Investigation history',
      icon: History,
      badge: investigationCount ? String(investigationCount) : null,
    },
    {
      id: 'monitoring' as NavigationTab,
      label: 'Compare reports',
      icon: GitCompareArrows,
      badge: null,
    },
    ] },
    { label: 'Administration', items: [
    {
      id: 'settings' as NavigationTab,
      label: 'Settings',
      icon: SlidersHorizontal,
      badge: null,
    },
    ] },
  ];

  return (
    <aside className="w-64 h-full shrink-0 bg-[#FCFBF9] border-r border-[#EAE6DF] flex flex-col">
      {/* Top Brand Identity */}
      <div className="h-14 min-h-14 shrink-0 px-4 border-b border-[#EAE6DF] flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded bg-[#1C1F26] flex items-center justify-center text-white shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-[#1C1F26]">
            VendorTrace
          </span>
          <span className="text-[10px] text-[#5F6572] leading-none uppercase tracking-wider font-medium">
            Due Diligence & Tracing
          </span>
        </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#EAE6DF] bg-white/80 text-[#5F6572] transition hover:border-[#D5CEC2] hover:bg-[#F4F1EA] hover:text-[#1C1F26]"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation List */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onStartInvestigation}
          disabled={isInvestigating}
          title={isInvestigating ? 'Finish or cancel the active investigation before starting another.' : undefined}
          className={`w-full min-h-10 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${isNewInvestigation ? 'bg-[#2D323E] ring-2 ring-[#D5CEC2]' : 'bg-[#1C1F26] hover:bg-[#2D323E]'} text-white disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Plus className="h-4 w-4" /> New investigation
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto" aria-label="Main navigation">
        {navGroups.map((group) => <section key={group.label} className="space-y-1">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[#8A91A0]">{group.label}</div>
          {group.items.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          const isLive = 'isLive' in item && item.isLive;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer select-none text-left ${
                isActive
                  ? 'bg-[#1C1F26] text-white font-semibold'
                  : 'text-[#5F6572] hover:bg-[#F4F1EA] hover:text-[#1C1F26]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-white' : 'text-[#8A91A0]'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : isLive ? 'bg-[#EAE6DF] text-[#5F6572]'
                      : 'bg-[#EAE6DF] text-[#1C1F26]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
          })}
        </section>)}
      </nav>

      {/* Bottom Workspace & Connector Health summary */}
      <div className="p-3 border-t border-[#EAE6DF] space-y-2">
        {/* Source connectors indicator */}
        <div className="p-2.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded text-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-[#1C1F26]">
            <span>Connector Probes</span>
            <span className="text-[#15803D] font-mono tabular-nums text-[10px]">
              {activeConnectorsCount}/{totalConnectorsCount} healthy
            </span>
          </div>
          <p className="text-[10px] text-[#8A91A0] leading-snug">
            Successful connection probes only. Configured credentials and completed investigations are tracked separately.
          </p>
        </div>

        {/* Help & Documentation trigger */}
        <button
          onClick={onOpenHelp}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-[#5F6572] hover:text-[#1C1F26] hover:bg-[#F4F1EA] rounded transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[#8A91A0]" />
            Diligence Methodology
          </span>
          <span className="text-[10px] text-[#8A91A0]">Rules</span>
        </button>
      </div>
    </aside>
  );
};
