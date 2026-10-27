import React from 'react';
import { CandidateEntity } from '../../server/providers/types.js';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { Badge } from '../common/Badge.js';
import { Building2, MapPin, ExternalLink, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CandidateSelectionModalProps {
  isOpen: boolean;
  query: string;
  candidates: CandidateEntity[];
  onSelectCandidate: (candidate: CandidateEntity) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const CandidateSelectionModal: React.FC<CandidateSelectionModalProps> = ({
  isOpen,
  query,
  candidates,
  onSelectCandidate,
  onCancel,
  isLoading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Candidate Entity Disambiguation Required"
      description={`Found ${candidates.length} registered entities matching "${query}". In accordance with procurement compliance rigor, manual officer confirmation is required.`}
      maxWidth="lg"
      footer={
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel Search
        </Button>
      }
    >
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {/* Compliance Notice */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed text-[11px]">
            <strong className="font-semibold text-amber-950">Zero-Assumption Mandate: </strong>
            IndiaCos registry returned multiple corporate candidates sharing root keywords. VendorTrace will not silently guess or auto-select an entity based on similar names. Please confirm the exact legal entity.
          </div>
        </div>

        {/* Candidate List */}
        <div className="space-y-2.5">
          {candidates.map((cand) => (
            <div
              key={cand.id}
              className="p-3.5 bg-white border border-[#EAE6DF] hover:border-[#1C1F26] rounded transition-all space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#1C1F26]">
                      {cand.canonicalName}
                    </span>
                    <Badge
                      tone={
                        cand.companyStatus.toUpperCase().includes('ACTIVE')
                          ? 'verified'
                          : cand.companyStatus.toUpperCase().includes('STRIKE')
                          ? 'risk'
                          : 'caution'
                      }
                      size="sm"
                    >
                      {cand.companyStatus}
                    </Badge>
                  </div>
                  {cand.tradeName && (
                    <span className="text-[11px] text-[#5F6572] block">
                      Trade Name: {cand.tradeName}
                    </span>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isLoading}
                  icon={<Check className="w-3.5 h-3.5" />}
                  onClick={() => onSelectCandidate(cand)}
                  className="shrink-0"
                >
                  Confirm Entity
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#5F6572] pt-1 border-t border-[#EAE6DF]/60">
                <div className="flex items-center gap-1 font-mono">
                  <span className="text-[#8A91A0]">{cand.identifierType}:</span>
                  <span className="text-[#1C1F26] font-semibold">{cand.identifierValue}</span>
                </div>
                {cand.state && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#8A91A0]" />
                    <span>Jurisdiction: {cand.state}</span>
                  </div>
                )}
              </div>

              {cand.registeredAddress && (
                <p className="text-[10px] text-[#8A91A0] line-clamp-1">
                  Address: {cand.registeredAddress}
                </p>
              )}

              {cand.ambiguityNote && (
                <div className="text-[10px] text-amber-800 italic">
                  Note: {cand.ambiguityNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
