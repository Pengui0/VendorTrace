import React from 'react';
import { Investigation } from '../../types/vendor.js';
import { InvestigationDiffView } from './InvestigationDiffView.js';

interface MonitoringViewProps {
  investigations: Investigation[];
  selectedInvestigation: Investigation | null;
  comparisonSelection?: { baselineId: string; latestId: string } | null;
  isDemoMode: boolean;
  onTriggerReRun: (inv: Investigation) => void;
  isLoading: boolean;
  onInvestigationUpdated?: (updatedInv: Investigation) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  investigations,
  selectedInvestigation,
  comparisonSelection,
  isDemoMode,
  onTriggerReRun,
  isLoading,
  onInvestigationUpdated,
}) => {
  const currentInvestigation = selectedInvestigation && investigations.some((item) => item.id === selectedInvestigation.id)
    ? selectedInvestigation
    : investigations[0] || null;

  return (
    <div className="space-y-6">
      <InvestigationDiffView
        currentInvestigation={currentInvestigation}
        comparisonSelection={comparisonSelection}
        allInvestigations={investigations}
        isDemoMode={isDemoMode}
        onInvestigationUpdated={(updated) => {
          if (onInvestigationUpdated) {
            onInvestigationUpdated(updated);
          } else {
            onTriggerReRun(updated);
          }
        }}
      />
    </div>
  );
};
