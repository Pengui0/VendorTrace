import React, { useState } from 'react';
import { RelatedEntityLead } from '../../types/vendor.js';
import { EntityGraph, EntityGraphNode, EntityGraphEdge, RelationshipStrength } from '../../types/entityTracing.js';
import { Card } from '../common/Card.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  Network,
  GitFork,
  UserCheck,
  MapPin,
  Building,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2,
  Filter,
} from 'lucide-react';

interface EntityGraphProps {
  relatedLeads: RelatedEntityLead[];
  entityGraph?: EntityGraph | null;
  targetName?: string;
}

export const EntityGraphPlaceholder: React.FC<EntityGraphProps> = ({
  relatedLeads,
  entityGraph,
  targetName,
}) => {
  const [selectedNode, setSelectedNode] = useState<EntityGraphNode | null>(null);
  const [filterStrength, setFilterStrength] = useState<RelationshipStrength | 'ALL'>('ALL');

  const nodes = entityGraph?.nodes || [];
  const edges = entityGraph?.edges || [];

  const filteredEdges = filterStrength === 'ALL'
    ? edges
    : edges.filter((e) => e.strength === filterStrength);

  const filteredNodes = filterStrength === 'ALL'
    ? nodes
    : nodes.filter((n) => {
        if (n.nodeType === 'PRIMARY_VENDOR') return true;
        return filteredEdges.some((e) => e.source === n.id || e.target === n.id);
      });

  if (relatedLeads.length === 0 && nodes.length === 0) {
    return (
      <Card
        header="Layer 2 Entity Tracing & Corporate Relationship Graph"
        headerAction={
          <span className="text-[11px] text-[#5F6572]">
            Evidence-Backed Registry Tracing (Depth 1)
          </span>
        }
      >
        <EmptyState
          icon={<Network className="w-5 h-5" />}
          title="Entity relationship graph awaiting investigation data"
          description="When an investigation is executed, lawful Ministry of Corporate Affairs linkages (directors by DIN, registered office addresses, and linked GSTINs) will be mapped here as review leads."
        />
        <div className="mt-4 p-3 rounded bg-[#FCFBF9] border border-[#EAE6DF] text-xs text-[#5F6572] flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <strong className="text-[#1C1F26]">Enterprise Compliance Policy: </strong>
            Related entities discovered via shared directors or addresses are leads for manual audit, not proof of wrongdoing. Never infer illicit behavior merely because two entities share a lawful registered office or common non-executive director.
          </div>
        </div>
      </Card>
    );
  }

  const getStrengthBadge = (strength: RelationshipStrength) => {
    switch (strength) {
      case 'strong_identifier':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Strong Identifier (CIN/DIN)
          </span>
        );
      case 'registry_link':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
            Official Registry Link
          </span>
        );
      case 'same_address_candidate':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
            <MapPin className="w-2.5 h-2.5 text-amber-600" /> Shared Address Candidate
          </span>
        );
      case 'same_name_candidate':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            <UserCheck className="w-2.5 h-2.5 text-purple-600" /> Name Match (Unconfirmed DIN)
          </span>
        );
      case 'unverified':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Unverified
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Zero-Guilt-by-Association Banner */}
      <div className="p-3.5 bg-amber-50/70 border border-amber-300/80 rounded-lg text-xs flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1 text-amber-950">
          <strong className="block text-xs font-bold text-amber-950">
            Zero-Guilt-by-Association Policy & Evidence Standards
          </strong>
          <p className="text-[11px] leading-relaxed text-amber-900">
            Under Indian corporate law, corporate entities are separate legal personalities. Shared directors or registered offices are leads for audit, never automatic proof of joint liability, control, or wrongdoing. Director names without an 8-digit DIN are never merged.
          </p>
        </div>
      </div>

      {/* Main Interactive Graph & Relationship Visualizer Card */}
      <Card
        header="Entity Tracing & Director Linkage Graph"
        headerAction={
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-[#5F6572]">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
              <select
                value={filterStrength}
                onChange={(e) => setFilterStrength(e.target.value as any)}
                className="px-2 py-1 bg-white border border-[#D5CEC2] rounded text-xs text-[#1C1F26] focus:outline-none focus:border-[#1C1F26] cursor-pointer"
              >
                <option value="ALL">All Strengths ({edges.length})</option>
                <option value="strong_identifier">Strong Identifiers (CIN/DIN)</option>
                <option value="same_address_candidate">Same Address Candidates</option>
                <option value="same_name_candidate">Same Name Candidates</option>
              </select>
            </div>
            <span className="text-[11px] font-mono text-[#8A91A0]">
              Max Depth: 1
            </span>
          </div>
        }
        noPadding
      >
        {/* Visual Graph Layout Area */}
        <div className="p-5 bg-[#FAF8F5]/60 border-b border-[#EAE6DF] min-h-64 flex flex-col justify-center">
          <div className="flex items-center justify-between text-[11px] text-[#8A91A0] mb-3 pb-2 border-b border-[#EAE6DF]/60">
            <span>Visual Graph Canvas (Direct Depth-1 Network)</span>
            <span>Click any node to inspect provenance</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 py-2">
            {filteredNodes.map((node) => {
              const isPrimary = node.nodeType === 'PRIMARY_VENDOR';
              const isDirector = node.nodeType === 'DIRECTOR';
              const isSelected = selectedNode?.id === node.id;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer shadow-xs max-w-xs ${
                    isPrimary
                      ? 'bg-[#1C1F26] text-white border-[#1C1F26] ring-2 ring-emerald-500/40'
                      : isDirector
                      ? 'bg-amber-50/80 text-amber-950 border-amber-300'
                      : 'bg-white text-[#1C1F26] border-[#EAE6DF] hover:border-[#1C1F26]'
                  } ${isSelected ? 'ring-2 ring-offset-2 ring-[#1C1F26]' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isPrimary ? (
                      <Building className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isDirector ? (
                      <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                    ) : (
                      <GitFork className="w-3.5 h-3.5 text-sky-600" />
                    )}
                    <span className="text-[9px] uppercase font-mono tracking-wider opacity-80">
                      {node.nodeType.replace('_', ' ')}
                    </span>
                  </div>

                  <h5 className="text-xs font-bold leading-tight">
                    {node.name}
                  </h5>

                  {node.cin && (
                    <span className="text-[10px] font-mono opacity-80 block mt-1">
                      CIN: {node.cin}
                    </span>
                  )}
                  {node.din && (
                    <span className="text-[10px] font-mono opacity-80 block mt-1">
                      DIN: {node.din}
                    </span>
                  )}

                  {node.lightweightReviewStatus && (
                    <div className="mt-1.5 pt-1 border-t border-current/20 text-[9px] flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      <span>Related-entity review: {node.lightweightReviewStatus}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Node Inspection Drawer */}
        {selectedNode && (
          <div className="p-4 bg-emerald-50/40 border-b border-emerald-200 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-700" />
                Selected Entity Node: {selectedNode.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="text-[11px] text-emerald-800 hover:underline cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
            <div className="text-[11px] text-emerald-900 space-y-0.5">
              <p>Provenance: {selectedNode.provenance} · Match Confidence: {selectedNode.matchConfidence}</p>
              {selectedNode.lightweightReviewNote && (
                <p className="font-medium text-emerald-950">Audit Note: {selectedNode.lightweightReviewNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Structured Relationship Ledger */}
        <div className="divide-y divide-[#EAE6DF]">
          {filteredEdges.map((edge) => (
            <div key={edge.id} className="p-4 space-y-2 hover:bg-[#FAF8F5]/60 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1C1F26]">{edge.label}</span>
                  {getStrengthBadge(edge.strength)}
                </div>

                <span className="text-[10px] font-mono text-[#8A91A0]">
                  Type: {edge.relationshipType}
                </span>
              </div>

              <div className="text-[11px] text-[#5F6572] flex items-center gap-4 flex-wrap">
                <span>Provenance: <strong>{edge.provenance}</strong></span>
                {edge.sourceUrls.length > 0 && (
                  <a
                    href={edge.sourceUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1C1F26] hover:underline flex items-center gap-1"
                  >
                    <span>Inspect Registry Proof</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              <p className="text-[10px] text-[#8A91A0] italic">
                {edge.disclaimer}
              </p>
            </div>
          ))}

          {/* Fallback to relatedLeads if edges not yet populated */}
          {edges.length === 0 &&
            relatedLeads.map((lead) => (
              <div key={lead.id} className="p-4 space-y-1.5 hover:bg-[#FAF8F5]/60 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="w-3.5 h-3.5 text-[#5F6572]" />
                    <span className="text-xs font-semibold text-[#1C1F26]">{lead.legalName}</span>
                    {lead.cin && (
                      <span className="text-[10px] font-mono px-1 py-0.5 bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572] rounded">
                        CIN: {lead.cin}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Status: {lead.companyStatus}
                  </span>
                </div>

                <div className="text-[11px] text-[#5F6572] flex items-center gap-4">
                  {lead.sharedDirectorName && (
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-[#8A91A0]" />
                      Common Director: {lead.sharedDirectorName} {lead.sharedDin ? `(DIN ${lead.sharedDin})` : ''}
                    </span>
                  )}
                  {lead.sharedAddress && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#8A91A0]" />
                      Shared Reg. Address
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-[#8A91A0] italic">{lead.leadDisclaimer}</p>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
};
