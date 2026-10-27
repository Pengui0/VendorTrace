import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  EntityGraph,
  EntityGraphNode,
  EntityGraphEdge,
  RelationshipStrength,
} from '../../types/entityTracing.js';
import { RelatedEntityLead } from '../../types/vendor.js';
import { Card } from '../common/Card.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  Network,
  Building,
  UserCheck,
  MapPin,
  ExternalLink,
  Info,
  Table as TableIcon,
  RotateCcw,
  X,
} from 'lucide-react';

export const TRACING_DISCLAIMER_TEXT =
  'Connections represent documented registry relationships or candidates; they are not proof of wrongdoing or joint liability.';

// Custom React Flow Node: Primary Investigated Vendor
const PrimaryVendorCustomNode = ({ data }: { data: any }) => (
  <div title={data.name} className="cursor-grab active:cursor-grabbing select-none px-4 py-3 bg-blue-50/95 border-2 border-blue-600 rounded-lg shadow-sm min-w-[220px] max-w-[260px]">
    <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 bg-blue-600 border-2 border-white" />
    <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 bg-blue-600 border-2 border-white" />
    <div className="flex items-center gap-2 mb-1.5">
      <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white shrink-0">
        <Building className="w-3 h-3" />
      </div>
      <span className="text-[10px] font-bold tracking-wider uppercase text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
        Target Vendor
      </span>
    </div>
    <div className="font-bold text-xs text-[#1C1F26] leading-snug line-clamp-2">
      {data.name}
    </div>
    {data.cin && (
      <div className="mt-1 font-mono text-[10px] text-[#5F6572]">
        CIN: {data.cin}
      </div>
    )}
  </div>
);

// Custom React Flow Node: Related Company (Strictly colored by its OWN evidence, NEVER red by association!)
const RelatedCompanyCustomNode = ({ data }: { data: any }) => {
  const isMaterialRisk = data.lightweightReviewStatus === 'MATERIAL_RISK';
  const isCaution = data.lightweightReviewStatus === 'CAUTION';
  const isClean = data.lightweightReviewStatus === 'CLEAN';

  const borderColor = isMaterialRisk
    ? 'border-red-500'
    : isCaution
    ? 'border-amber-500'
    : isClean
    ? 'border-emerald-500'
    : 'border-slate-300';

  const bgColor = isMaterialRisk
    ? 'bg-red-50/90'
    : isCaution
    ? 'bg-amber-50/90'
    : isClean
    ? 'bg-emerald-50/90'
    : 'bg-white';

  const badgeColor = isMaterialRisk
    ? 'bg-red-100 text-red-800 border-red-200'
    : isCaution
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : isClean
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div title={data.name} className={`cursor-grab active:cursor-grabbing select-none px-3.5 py-3 ${bgColor} border ${borderColor} rounded-lg shadow-sm min-w-[210px] max-w-[250px]`}>
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 bg-slate-400 border-2 border-white" />
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 bg-slate-400 border-2 border-white" />
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] font-semibold text-[#5F6572] flex items-center gap-1">
          <Building className="w-3 h-3 text-[#5F6572]" />
          Related Entity
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${badgeColor}`}>
          {isMaterialRisk ? 'Direct Risk' : isCaution ? 'Caution' : isClean ? 'Clear' : 'Unverified'}
        </span>
      </div>
      <div className="font-semibold text-xs text-[#1C1F26] leading-snug line-clamp-2">
        {data.name}
      </div>
      {data.cin && (
        <div className="mt-1 font-mono text-[10px] text-[#8A91A0]">
          CIN: {data.cin}
        </div>
      )}
    </div>
  );
};

// Custom React Flow Node: Director (DIN)
const DirectorCustomNode = ({ data }: { data: any }) => (
  <div title={data.name} className="cursor-grab active:cursor-grabbing select-none px-3.5 py-2.5 bg-purple-50/90 border border-purple-300 rounded-lg shadow-sm min-w-[190px] max-w-[230px]">
    <Handle type="target" position={Position.Top} className="w-2 h-2 bg-purple-400 border-2 border-white" />
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-purple-400 border-2 border-white" />
    <div className="flex items-center gap-1.5 mb-1">
      <UserCheck className="w-3 h-3 text-purple-700 shrink-0" />
      <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">
        Director / KMP
      </span>
    </div>
    <div className="font-semibold text-xs text-[#1C1F26] leading-tight">
      {data.name}
    </div>
    {data.din && (
      <div className="mt-0.5 font-mono text-[10px] text-purple-700">
        DIN: {data.din}
      </div>
    )}
  </div>
);

// Custom React Flow Node: Registered Office Address
const AddressCustomNode = ({ data }: { data: any }) => (
  <div title={data.name} className="cursor-grab active:cursor-grabbing select-none px-3.5 py-2.5 bg-amber-50/90 border border-amber-300 rounded-lg shadow-sm min-w-[200px] max-w-[240px]">
    <Handle type="target" position={Position.Top} className="w-2 h-2 bg-amber-500 border-2 border-white" />
    <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-amber-500 border-2 border-white" />
    <div className="flex items-center gap-1.5 mb-1">
      <MapPin className="w-3 h-3 text-amber-700 shrink-0" />
      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
        Registered Office
      </span>
    </div>
    <div className="text-[11px] text-[#1C1F26] leading-tight line-clamp-2">
      {data.name}
    </div>
  </div>
);

const nodeTypes = {
  PRIMARY_VENDOR: PrimaryVendorCustomNode,
  RELATED_COMPANY: RelatedCompanyCustomNode,
  DIRECTOR: DirectorCustomNode,
  REGISTERED_ADDRESS: AddressCustomNode,
};

interface RelatedEntityNetworkGraphProps {
  relatedLeads: RelatedEntityLead[];
  entityGraph?: EntityGraph | null;
  targetName?: string;
  onRefreshGraph?: () => void;
}

const FlowInner: React.FC<{
  graphData: EntityGraph;
  targetName?: string;
  onSelectNode: (node: EntityGraphNode) => void;
  onSelectEdge: (edge: EntityGraphEdge) => void;
  maxDisplayCount: number;
}> = ({ graphData, targetName, onSelectNode, onSelectEdge, maxDisplayCount }) => {
  const { fitView } = useReactFlow();

  const { initialNodes, edges, canvasHeight } = useMemo(() => {
    const rawNodes = graphData.nodes.slice(0, maxDisplayCount);
    const displayedNodeIds = new Set(rawNodes.map((n) => n.id));

    const primaryNode = rawNodes.find((n) => n.nodeType === 'PRIMARY_VENDOR');
    const otherNodes = rawNodes.filter((n) => n.id !== primaryNode?.id);
    const typeColumn: Record<string, number> = { RELATED_COMPANY: 0, DIRECTOR: 1, REGISTERED_ADDRESS: 2 };
    const grouped = new Map<string, EntityGraphNode[]>();
    otherNodes.forEach((node) => grouped.set(node.nodeType, [...(grouped.get(node.nodeType) || []), node]));
    const rowCount = Math.max(1, ...[...grouped.values()].map((group) => group.length));
    const height = Math.max(520, rowCount * 180 + 120);
    const rootY = Math.max(40, (height - 120) / 2);
    const flowNodes: Node[] = primaryNode ? [{
        id: primaryNode.id,
        type: primaryNode.nodeType,
        position: { x: 40, y: rootY },
        data: primaryNode as unknown as Record<string, unknown>,
      }] : [];

    otherNodes.forEach((node) => {
      const group = grouped.get(node.nodeType) || [];
      const index = group.findIndex((item) => item.id === node.id);
      const x = 330 + (typeColumn[node.nodeType] ?? 1) * 300;
      const y = 40 + index * 180;

      flowNodes.push({
        id: node.id,
        type: node.nodeType,
        position: { x, y: primaryNode && node.nodeType === 'PRIMARY_VENDOR' ? rootY : y },
        data: node as unknown as Record<string, unknown>,
      });
    });

    const flowEdges: Edge[] = graphData.edges
      .filter((e) => displayedNodeIds.has(e.source) && displayedNodeIds.has(e.target))
      .map((e) => {
        const isCandidate = e.strength === 'same_address_candidate' || e.strength === 'same_name_candidate' || e.strength === 'unverified';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: isCandidate,
          style: {
            stroke: isCandidate ? '#94A3B8' : '#3B82F6',
            strokeWidth: isCandidate ? 1.5 : 2,
            strokeDasharray: isCandidate ? '4 4' : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isCandidate ? '#94A3B8' : '#3B82F6',
            width: 16,
            height: 16,
          },
          type: 'smoothstep',
          data: e as unknown as Record<string, unknown>,
        };
      });

    return { initialNodes: flowNodes, edges: flowEdges, canvasHeight: height };
  }, [graphData, maxDisplayCount, targetName]);

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes]);
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => fitView({ padding: 0.18, duration: 250 }));
    return () => cancelAnimationFrame(frame);
  }, [initialNodes, fitView]);

  return (
    <div className="w-full bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg relative overflow-hidden" style={{ height: canvasHeight }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => onSelectNode(node.data as unknown as EntityGraphNode)}
        onEdgeClick={(_event, edge) => {
          if (edge.data) onSelectEdge(edge.data as unknown as EntityGraphEdge);
        }}
        fitView
        nodesDraggable
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#CBD5E1" />
        <Controls showInteractive={false} className="bg-white border border-[#D5CEC2] rounded shadow-sm text-xs" />
      </ReactFlow>

      {/* Quick Reset Layout Button */}
      <button
        type="button"
        onClick={() => fitView({ duration: 400 })}
        className="absolute top-3 right-3 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm border border-[#D5CEC2] rounded text-[11px] font-semibold text-[#1C1F26] hover:bg-white shadow-sm flex items-center gap-1.5 cursor-pointer z-10"
        title="Reset layout and fit graph to viewport"
      >
        <RotateCcw className="w-3 h-3 text-[#5F6572]" />
        Fit View
      </button>
    </div>
  );
};

export const RelatedEntityNetworkGraph: React.FC<RelatedEntityNetworkGraphProps> = ({
  relatedLeads,
  entityGraph,
  targetName,
}) => {
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [selectedNode, setSelectedNode] = useState<EntityGraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EntityGraphEdge | null>(null);
  const [maxNodesLimit, setMaxNodesLimit] = useState<number>(10);
  useEffect(() => { setSelectedNode(null); setSelectedEdge(null); }, [entityGraph, relatedLeads]);

  const activeGraph = useMemo<EntityGraph>(() => {
    if (entityGraph) return entityGraph;
    if (!relatedLeads.length) return { nodes: [], edges: [], anchorsUsed: [], disclaimer: TRACING_DISCLAIMER_TEXT, stats: { totalRelatedEntities: 0, totalDirectors: 0, strongIdentifierMatches: 0, candidateMatches: 0, depth: 0, maxCandidatesLimit: 0 } };
    const rootId = `target-${targetName || 'investigation'}`;
    const relatedNodes: EntityGraphNode[] = relatedLeads.map((lead) => ({ id: lead.id, name: lead.legalName, nodeType: 'RELATED_COMPANY', cin: lead.cin, companyStatus: lead.companyStatus, matchConfidence: lead.sharedDin ? 'DIN candidate' : 'Unverified lead', provenance: lead.leadDisclaimer, lightweightReviewStatus: 'UNKNOWN', lightweightReviewNote: lead.leadDisclaimer }));
    const edges: EntityGraphEdge[] = relatedLeads.map((lead) => ({ id: `edge-${lead.id}`, source: rootId, target: lead.id, relationshipType: lead.relationType === 'SHARED_DIRECTOR' ? 'SHARED_DIRECTOR' : lead.relationType === 'REGISTERED_ADDRESS' ? 'SHARED_ADDRESS' : 'PARENT_SUBSIDIARY', strength: lead.sharedDin ? 'strong_identifier' : lead.relationType === 'REGISTERED_ADDRESS' ? 'same_address_candidate' : 'unverified', label: lead.relationType.replace(/_/g, ' '), evidenceIds: [], sourceUrls: [], provenance: 'Investigation related-entity lead', disclaimer: lead.leadDisclaimer }));
    return { nodes: [{ id: rootId, name: targetName || 'Investigated vendor', nodeType: 'PRIMARY_VENDOR', matchConfidence: 'Investigation target', provenance: 'Saved investigation report' }, ...relatedNodes], edges, anchorsUsed: [], disclaimer: TRACING_DISCLAIMER_TEXT, stats: { totalRelatedEntities: relatedNodes.length, totalDirectors: 0, strongIdentifierMatches: edges.filter((edge) => edge.strength === 'strong_identifier').length, candidateMatches: edges.filter((edge) => edge.strength !== 'strong_identifier').length, depth: 1, maxCandidatesLimit: relatedNodes.length } };
  }, [entityGraph, relatedLeads, targetName]);

  const totalGraphNodes = activeGraph.nodes.length;
  const isDenseGraph = totalGraphNodes > 10;

  return (
    <div className="space-y-4">
      {/* Disclaimer Banner: Mandatory Zero-Guilt-by-Association */}
      <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-amber-950">
            Compliance & Due-Diligence Tracing Disclaimer
          </span>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            {TRACING_DISCLAIMER_TEXT} Connected entities are candidate leads identified through public MCA21 filings and director DIN associations for human review.
          </p>
        </div>
      </div>

      <Card
        header="Layer 2 Related-Entity Tracing & Director Network"
        headerAction={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Graph vs Accessible Table */}
            <div className="flex items-center bg-[#FAF8F5] p-0.5 rounded border border-[#D5CEC2] text-xs">
              <button
                type="button"
                onClick={() => setViewMode('graph')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                  viewMode === 'graph' ? 'bg-white shadow-xs text-[#1C1F26]' : 'text-[#5F6572] hover:text-[#1C1F26]'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                Network Graph
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-white shadow-xs text-[#1C1F26]' : 'text-[#5F6572] hover:text-[#1C1F26]'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                Accessible Table
              </button>
            </div>

          </div>
        }
      >
        {/* Network Metrics & Complexity Limiter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EAE6DF] text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[#1C1F26]">
              Discovered Entities: {activeGraph.stats?.totalRelatedEntities ?? activeGraph.nodes.length}
            </span>
            <span className="text-[#8A91A0]">·</span>
            <span className="text-[#5F6572]">
              Anchors Audited: {activeGraph.anchorsUsed?.length || 0}
            </span>
            <span className="text-[#8A91A0]">·</span>
            <span className="text-[#5F6572]">
              Depth: {activeGraph.nodes.length ? (activeGraph.stats?.depth || 1) : '—'}
            </span>
          </div>

          {isDenseGraph && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#5F6572]">
                Showing {Math.min(maxNodesLimit, totalGraphNodes)} of {totalGraphNodes} nodes
              </span>
              <button
                type="button"
                onClick={() => setMaxNodesLimit(maxNodesLimit === 10 ? 50 : 10)}
                className="px-2 py-1 text-[11px] font-semibold bg-white border border-[#D5CEC2] rounded text-[#1C1F26] hover:bg-[#FAF8F5] cursor-pointer"
              >
                {maxNodesLimit === 10 ? 'Show More Nodes' : 'Show Compact (10)'}
              </button>
            </div>
          )}
        </div>

        {/* View 1: Interactive Network Flow */}
        {activeGraph.nodes.length <= 1 || activeGraph.edges.length === 0 ? (
          <div className="pt-4">
            <EmptyState icon={<Network className="w-5 h-5" />} title="No related entities were returned" description="This report has no documented company or director relationships to draw. The check is limited to the sources and identifiers available for this investigation; an empty graph does not prove that no relationships exist." />
          </div>
        ) : viewMode === 'graph' ? (
          <div className="pt-3">
            <ReactFlowProvider>
              <FlowInner
                graphData={activeGraph}
                targetName={targetName}
                onSelectNode={(node) => {
                  setSelectedNode(node);
                  setSelectedEdge(null);
                }}
                onSelectEdge={(edge) => {
                  setSelectedEdge(edge);
                  setSelectedNode(null);
                }}
                maxDisplayCount={maxNodesLimit}
              />
            </ReactFlowProvider>

            {/* Legend & Guidance */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6572] bg-[#FAF8F5] p-2.5 rounded border border-[#EAE6DF]">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-semibold text-[#1C1F26]">Visual Key:</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Target Vendor
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Director / KMP (DIN)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Registered Office
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Related Entity (Clear / Neutral)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Related Entity (Own Risk Finding)
                </span>
              </div>
              <span className="italic text-[#8A91A0]">Drag nodes to arrange the graph. Click a node or link for relationship details; scroll to zoom and drag the canvas to pan.</span>
            </div>
          </div>
        ) : (
          /* View 2: Accessible Fallback Table */
          <div className="pt-3 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] border-b border-[#D5CEC2] text-[#5F6572] font-semibold">
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Verified Relationship</th>
                  <th className="py-2.5 px-3">Match Strength</th>
                  <th className="py-2.5 px-3">Evidence Count</th>
                  <th className="py-2.5 px-3">Public Provenance</th>
                  <th className="py-2.5 px-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE6DF]">
                {activeGraph.edges.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-xs text-[#8A91A0]">The investigation returned no documented relationship links.</td></tr>}
                {activeGraph.edges.map((edge) => {
                  const targetNode = activeGraph.nodes.find((n) => n.id === edge.target);
                  const isStrong = edge.strength === 'strong_identifier' || edge.strength === 'registry_link';

                  return (
                    <tr key={edge.id} className="hover:bg-[#FAF8F5]/80">
                      <td className="py-2.5 px-3 font-semibold text-[#1C1F26]">
                        {targetNode?.name || edge.target}
                        {targetNode?.cin && (
                          <div className="font-mono text-[10px] text-[#8A91A0]">CIN: {targetNode.cin}</div>
                        )}
                        {targetNode?.din && (
                          <div className="font-mono text-[10px] text-purple-700">DIN: {targetNode.din}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {targetNode?.nodeType || 'ENTITY'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#1C1F26]">
                        {edge.label}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isStrong
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {edge.strength}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#5F6572]">
                        {edge.evidenceIds.length} ID(s)
                      </td>
                      <td className="py-2.5 px-3 text-[#5F6572]">
                        {edge.provenance}
                      </td>
                      <td className="py-2.5 px-3">
                        {edge.sourceUrls[0] ? (
                          <a
                            href={edge.sourceUrls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                          >
                            Verify <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[#8A91A0]">Registry Internal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 bg-white border border-[#D5CEC2] rounded-lg shadow-sm space-y-3 relative">
          <button
            type="button"
            onClick={() => setSelectedNode(null)}
            className="absolute top-3 right-3 text-[#8A91A0] hover:text-[#1C1F26] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              {selectedNode.nodeType}
            </span>
            <h4 className="text-sm font-bold text-[#1C1F26]">{selectedNode.name}</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#FAF8F5] p-3 rounded border border-[#EAE6DF]">
            <div>
              <span className="text-[#5F6572] block text-[11px]">Match Confidence</span>
              <span className="font-semibold text-[#1C1F26]">{selectedNode.matchConfidence}</span>
            </div>
            <div>
              <span className="text-[#5F6572] block text-[11px]">Identifier</span>
              <span className="font-mono text-[#1C1F26]">
                {selectedNode.cin ? `CIN ${selectedNode.cin}` : selectedNode.din ? `DIN ${selectedNode.din}` : 'None recorded'}
              </span>
            </div>
            <div>
              <span className="text-[#5F6572] block text-[11px]">Provenance</span>
              <span className="font-medium text-[#1C1F26]">{selectedNode.provenance}</span>
            </div>
          </div>
          {selectedNode.lightweightReviewNote && (
            <p className="text-xs text-[#5F6572] italic">
              Note: {selectedNode.lightweightReviewNote}
            </p>
          )}

          {/* Connected Relationship Evidence & Source Records */}
          {(() => {
            const connectedEdges = activeGraph.edges.filter(
              (e) => e.source === selectedNode.id || e.target === selectedNode.id
            );
            if (connectedEdges.length === 0) return null;

            return (
              <div className="pt-2 border-t border-[#EAE6DF] space-y-2">
                <span className="text-[11px] font-bold text-[#1C1F26] uppercase tracking-wide block">
                  Evidentiary Tracing Links & Source Records ({connectedEdges.length})
                </span>
                <div className="space-y-2">
                  {connectedEdges.map((edge) => {
                    const otherNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
                    const otherNode = activeGraph.nodes.find((n) => n.id === otherNodeId);
                    const isCandidate =
                      edge.strength === 'same_address_candidate' ||
                      edge.strength === 'same_name_candidate' ||
                      edge.strength === 'unverified';

                    return (
                      <div
                        key={edge.id}
                        className="p-2.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="font-semibold text-[#1C1F26]">
                            {edge.label} {otherNode ? `↔ ${otherNode.name}` : ''}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isCandidate
                                ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {edge.strength.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-[#5F6572] flex-wrap">
                          <span>
                            Evidence ID:{' '}
                            <strong className="font-mono text-[#1C1F26]">
                              {edge.evidenceIds.join(', ')}
                            </strong>
                          </span>
                          <span>·</span>
                          <span>Provenance: {edge.provenance}</span>
                        </div>

                        {edge.sourceUrls && edge.sourceUrls.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            <span className="text-[10px] text-[#8A91A0]">Verified Source URLs:</span>
                            {edge.sourceUrls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-mono"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {url}
                              </a>
                            ))}
                          </div>
                        )}

                        <p className="text-[10px] text-amber-900 bg-amber-50/70 p-1.5 rounded border border-amber-200/60 leading-snug">
                          {edge.disclaimer || TRACING_DISCLAIMER_TEXT}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Selected Edge / Relationship Details Drawer */}
      {selectedEdge && (
        <div className="p-4 bg-white border border-blue-200 rounded-lg shadow-sm space-y-3 relative">
          <button
            type="button"
            onClick={() => setSelectedEdge(null)}
            className="absolute top-3 right-3 text-[#8A91A0] hover:text-[#1C1F26] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Relationship Evidence Ledger
            </span>
            <h4 className="text-sm font-bold text-[#1C1F26]">{selectedEdge.label}</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#FAF8F5] p-3 rounded border border-[#EAE6DF]">
            <div>
              <span className="text-[#5F6572] block text-[11px]">Relationship Type</span>
              <span className="font-semibold text-[#1C1F26]">{selectedEdge.relationshipType}</span>
            </div>
            <div>
              <span className="text-[#5F6572] block text-[11px]">Match Strength</span>
              <span className="font-semibold text-blue-700">{selectedEdge.strength}</span>
            </div>
            <div>
              <span className="text-[#5F6572] block text-[11px]">Evidence Reference IDs</span>
              <span className="font-mono text-[#1C1F26]">{selectedEdge.evidenceIds.join(', ')}</span>
            </div>
          </div>
          {selectedEdge.sourceUrls.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[#5F6572]">Verified Upstream Source URLs:</span>
              <div className="space-y-1">
                {selectedEdge.sourceUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline break-all"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-100">
            {selectedEdge.disclaimer || TRACING_DISCLAIMER_TEXT}
          </p>
        </div>
      )}
    </div>
  );
};
