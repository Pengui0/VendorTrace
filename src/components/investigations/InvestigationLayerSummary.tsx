import React from 'react';
import { ArrowRight, Activity, CheckCircle2, CircleDashed, Network, ShieldCheck } from 'lucide-react';
import type { Investigation } from '../../types/vendor.js';

interface InvestigationLayerSummaryProps {
  investigation: Investigation;
  onOpenMonitoring?: () => void;
}

export const InvestigationLayerSummary: React.FC<InvestigationLayerSummaryProps> = ({ investigation, onOpenMonitoring }) => {
  const tasks = Object.values(investigation.dimensionResults || {});
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const graph = investigation.entityGraph;
  const relatedEntities = graph?.stats?.totalRelatedEntities ?? Math.max(0, (graph?.nodes.length || 0) - 1);
  const directorCount = graph?.stats?.totalDirectors ?? graph?.nodes.filter((node) => node.nodeType === 'DIRECTOR').length ?? 0;
  const assessment = investigation.assessmentReport;

  const cards = [
    {
      label: 'Layer 1 · Discovery',
      state: investigation.coverageStatus ? `${investigation.coverageStatus} · ${completedTasks}/${tasks.length || 5} tasks` : 'No discovery results attached',
      detail: `${investigation.coverageGaps?.length || 0} coverage gap(s). Open the task cards above for provider, source, and failure details.`,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      label: 'Layer 2 · Entity tracing',
      state: graph ? `${relatedEntities} related entities · ${directorCount} directors` : 'Not run / no graph attached',
      detail: graph
        ? `${graph.anchorsUsed?.length || 0} tracing anchor(s) examined. ${relatedEntities === 0 ? 'No relationship links were returned; this does not prove none exist.' : 'Review every relationship and its provenance in the graph tab.'}`
        : 'This report does not contain an entity-tracing result.',
      icon: <Network className="h-4 w-4" />,
    },
    {
      label: 'Layer 3 · Cross-validation',
      state: assessment ? `${assessment.coverageStatus} · ${assessment.reviewPriority || assessment.overallReviewPriority || 'Assessment generated'}` : 'Not run / no assessment attached',
      detail: assessment
        ? `${assessment.totalSourcesEvaluated ?? assessment.sourcesChecked?.length ?? 0} source(s) evaluated. ${assessment.priorityHeadline || assessment.briefSummary.text}`
        : 'This report does not contain a cross-validation assessment.',
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: 'Layer 4 · Monitoring',
      state: 'Separate comparison workflow',
      detail: 'Monitoring compares saved reports over time; it is not run as part of a one-off investigation.',
      icon: <Activity className="h-4 w-4" />,
    },
  ];

  return (
    <section className="rounded-lg border border-[#EAE6DF] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <CircleDashed className="h-4 w-4 text-[#5F6572]" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#1C1F26]">Investigation pipeline coverage</h3>
        <span className="text-[10px] text-[#8A91A0]">Four layers have different execution scopes</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <div key={card.label} className="rounded border border-[#EAE6DF] bg-[#FCFBF9] p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#5F6572]">
              {card.icon}<span>{card.label}</span>
            </div>
            <div className="mt-2 text-xs font-bold text-[#1C1F26]">{card.state}</div>
            <p className="mt-1 text-[10px] leading-relaxed text-[#5F6572]">{card.detail}</p>
            {index === 3 && onOpenMonitoring && (
              <button type="button" onClick={onOpenMonitoring} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#1C1F26] hover:underline">
                Open Monitoring <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
