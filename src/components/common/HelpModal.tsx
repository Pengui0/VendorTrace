import React from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { ShieldCheck, Layers, GitFork, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="VendorTrace Verification & Due Diligence Methodology"
      description="Operational standards governing Indian procurement compliance and risk tracing."
      maxWidth="lg"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Acknowledge & Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs text-[#5F6572] max-h-[60vh] overflow-y-auto pr-1">
        <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded space-y-1">
          <span className="font-bold text-[#1C1F26] block">Core Diligence Promise</span>
          <p className="leading-relaxed">
            &ldquo;We don't just find risk signals. We trace who is behind them, prove every claim across independent sources, and clearly separate verified evidence from findings that need human review.&rdquo;
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-[#1C1F26] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#1C1F26]">Layer 1: Discovery</strong>
              <p className="mt-0.5 leading-relaxed">
                Queries MCA21 for company status and director list, GSTN for active tax registrations, court dockets for litigation, government procurement debarment lists, and adverse regulatory press.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <GitFork className="w-4 h-4 text-[#1C1F26] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#1C1F26]">Layer 2: Entity Tracing</strong>
              <p className="mt-0.5 leading-relaxed">
                Traces lawful corporate connections via Director DINs, registered addresses, and parent/subsidiary filings. Related entities are labeled as leads for review, not evidence of wrongdoing.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#1C1F26]">Layer 3: Cross-Validation</strong>
              <p className="mt-0.5 leading-relaxed">
                Every finding attaches source URLs, short snippets, timestamps, and match confidence. Findings corroborated by 2+ independent sources are marked verified; single-source findings route to officer review.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-[#1C1F26] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#1C1F26]">Layer 4: Truthful Monitoring</strong>
              <p className="mt-0.5 leading-relaxed">
                Deterministic comparison of subsequent investigation runs against baseline reports, highlighting new, changed, resolved, and unresolved signals without claiming fictitious unattended cron monitoring.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
