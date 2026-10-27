import React, { useState } from 'react';
import { Card } from '../common/Card.js';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Building2,
  Layers,
  Scale,
  Network,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  FICTIONAL_VENDOR_NAME,
  FICTIONAL_CIN,
  FICTIONAL_GSTIN,
} from '../../server/demo/demoDataset.js';

interface DemoScenarioWalkthroughProps {
  onLoadScenarioStep: (stepNumber: number) => void;
  onSwitchToLive: () => void;
  isDemoMode: boolean;
}

export const DemoScenarioWalkthrough: React.FC<DemoScenarioWalkthroughProps> = ({
  onLoadScenarioStep,
  onSwitchToLive,
  isDemoMode,
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);

  const steps = [
    {
      step: 1,
      title: '1. Target Selection & Identifier Verification',
      badge: 'Step 1 of 6',
      summary: `Begin due diligence on synthetic vendor "${FICTIONAL_VENDOR_NAME}". Inspect validated Corporate Identification Number (${FICTIONAL_CIN}) and GSTIN.`,
      actionLabel: 'Load Target Profile & Registry Resolution',
      icon: <Building2 className="w-4 h-4 text-blue-600" />,
    },
    {
      step: 2,
      title: '2. Parallel 4-Dimension Registry Audit',
      badge: 'Step 2 of 6',
      summary: 'VendorTrace audits MCA21, GSTN, High Court commercial dockets, and GeM debarment simultaneously with failure-isolated workers.',
      actionLabel: 'View Parallel Discovery Results',
      icon: <Layers className="w-4 h-4 text-purple-600" />,
    },
    {
      step: 3,
      title: '3. Contested High Court Docket Evidence Chain',
      badge: 'Step 3 of 6',
      summary: 'Drill into commercial recovery claim (CNR: MHCC01-999999-2025). Observe how conflicting plaintiff/defense filings are honestly flagged as conflicting evidence.',
      actionLabel: 'Inspect Evidence Chain & Docket Claims',
      icon: <Scale className="w-4 h-4 text-amber-600" />,
    },
    {
      step: 4,
      title: '4. Evidence-Backed Related Entity Tracing (Layer 2)',
      badge: 'Step 4 of 6',
      summary: 'Explore director DIN 99999999 and shared tech-park office. Notice that co-located entities are candidate leads only, adhering to the Zero-Guilt Rule.',
      actionLabel: 'Open Related-Entity Network Graph',
      icon: <Network className="w-4 h-4 text-emerald-600" />,
    },
    {
      step: 5,
      title: '5. Single-Source Low-Confidence Safeguard',
      badge: 'Step 5 of 6',
      summary: 'Review an informal grievance post. Observe how deterministic scoring leaves this as a gray "Needs Human Review" badge rather than fabricating guilt.',
      actionLabel: 'Review Single-Source Finding Rationale',
      icon: <HelpCircle className="w-4 h-4 text-slate-600" />,
    },
    {
      step: 6,
      title: '6. Re-check & Deterministic Signal Delta (Diff)',
      badge: 'Step 6 of 6',
      summary: 'Execute a scheduled re-check. Detect the new arbitration consent award (ARB/999/2026) resolved by source without volatile hash drift.',
      actionLabel: 'Inspect Change Detection Report & Diff',
      icon: <RefreshCw className="w-4 h-4 text-blue-600" />,
    },
  ];

  return (
    <div className="bg-white border-2 border-amber-300 rounded-lg p-5 shadow-sm space-y-4">
      {/* Scripted Presentation Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-amber-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              GUIDED HACKATHON DEMO WALKTHROUGH
            </span>
            <span className="text-xs font-semibold text-[#5F6572]">
              Offline-Safe Deterministic Scenario
            </span>
          </div>
          <h3 className="text-base font-bold text-[#1C1F26] mt-1">
            VendorTrace End-to-End Enterprise Due Diligence Scenario
          </h3>
          <p className="text-xs text-[#5F6572] mt-0.5">
            Follow this 6-step scripted scenario during live demonstration. Every fact and link is 100% synthetic, verified, and preloaded locally.
          </p>
        </div>

        <button
          type="button"
          onClick={onSwitchToLive}
          className="px-3 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-xs font-semibold text-[#1C1F26] hover:bg-white cursor-pointer shrink-0"
        >
          Switch to Live Investigation
        </button>
      </div>

      {/* Step Stepper Progress Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {steps.map((s) => {
          const isCurrent = activeStep === s.step;
          const isPassed = activeStep > s.step;

          return (
            <button
              key={s.step}
              type="button"
              onClick={() => {
                setActiveStep(s.step);
                onLoadScenarioStep(s.step);
              }}
              className={`p-2.5 rounded text-left border cursor-pointer transition-all ${
                isCurrent
                  ? 'bg-amber-50/90 border-amber-500 shadow-xs ring-1 ring-amber-400'
                  : isPassed
                  ? 'bg-[#FAF8F5] border-emerald-300 text-emerald-900'
                  : 'bg-white border-[#EAE6DF] text-[#5F6572] hover:bg-[#FAF8F5]'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                <span>Step {s.step}</span>
                {isPassed && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
              </div>
              <div className="text-[11px] font-semibold text-[#1C1F26] line-clamp-1">
                {s.title.split('. ')[1]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Step Details & Action Bar */}
      {(() => {
        const curr = steps.find((s) => s.step === activeStep)!;
        return (
          <div className="p-4 bg-[#FAF8F5] border border-amber-200 rounded-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded bg-white border border-amber-200 mt-0.5">
                {curr.icon}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  {curr.badge} — Presentation Talking Point
                </span>
                <h4 className="text-sm font-bold text-[#1C1F26]">{curr.title}</h4>
                <p className="text-xs text-[#5F6572] mt-0.5 max-w-2xl leading-relaxed">
                  {curr.summary}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onLoadScenarioStep(curr.step);
                if (activeStep < 6) setActiveStep(activeStep + 1);
              }}
              className="max-w-full px-4 py-2 bg-[#1C1F26] text-white rounded text-xs font-semibold hover:bg-[#2D323E] cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>{curr.actionLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}
    </div>
  );
};
