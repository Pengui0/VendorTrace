import React, { useState } from 'react';
import { Search, Filter, X, Calendar, Layers, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { RiskDimension } from '../../types/riskFinding.js';
import { loadWorkspace, updateWorkspace } from '../../persistence/localStore.js';

export interface FilterState {
  vendor: string;
  identifier: string;
  status: string;
  reviewPriority: string;
  dimension: string;
  dateFrom: string;
  dateTo: string;
}

interface InvestigationSearchFilterProps {
  onFilterChange: (filters: FilterState) => void;
  totalResults: number;
}

export const InvestigationSearchFilter: React.FC<InvestigationSearchFilterProps> = ({
  onFilterChange,
  totalResults,
}) => {
  const [filters, setFilters] = useState<FilterState>(() => (loadWorkspace().preferences.investigationFilters as FilterState | undefined) || {
    vendor: '',
    identifier: '',
    status: '',
    reviewPriority: '',
    dimension: '',
    dateFrom: '',
    dateTo: '',
  });

  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const handleInputChange = (field: keyof FilterState, value: string) => {
    const updated = { ...filters, [field]: value };
    setFilters(updated);
    updateWorkspace((saved) => ({ ...saved, preferences: { ...saved.preferences, investigationFilters: updated } }));
    if (field === 'vendor' && value.trim()) updateWorkspace((saved) => ({ ...saved, searchHistory: [value.trim(), ...saved.searchHistory.filter((term) => term !== value.trim())].slice(0, 50) }));
    onFilterChange(updated);
  };

  const handleClear = () => {
    const cleared: FilterState = {
      vendor: '',
      identifier: '',
      status: '',
      reviewPriority: '',
      dimension: '',
      dateFrom: '',
      dateTo: '',
    };
    setFilters(cleared);
    updateWorkspace((saved) => ({ ...saved, preferences: { ...saved.preferences, investigationFilters: cleared } }));
    onFilterChange(cleared);
  };

  const activeCount = Object.values(filters).filter((v) => v.trim().length > 0).length;

  return (
    <div className="bg-white border border-[#D5CEC2] rounded-lg p-3.5 shadow-xs space-y-3">
      {/* Primary Search Bar Row */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8A91A0] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search investigations by vendor name, officer..."
            value={filters.vendor}
            onChange={(e) => handleInputChange('vendor', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] placeholder-[#8A91A0] focus:bg-white focus:outline-none focus:border-[#1C1F26]"
          />
        </div>

        <div className="w-full sm:w-56 relative">
          <input
            type="text"
            placeholder="CIN / GSTIN / PAN..."
            value={filters.identifier}
            onChange={(e) => handleInputChange('identifier', e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] placeholder-[#8A91A0] focus:bg-white focus:outline-none focus:border-[#1C1F26]"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-3 py-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            activeCount > 0 || isExpanded
              ? 'bg-[#1C1F26] text-white border-[#1C1F26]'
              : 'bg-[#FAF8F5] text-[#5F6572] border-[#D5CEC2] hover:bg-white'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters {activeCount > 0 && `(${activeCount})`}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2.5 py-2 text-xs font-semibold text-red-700 hover:text-red-900 cursor-pointer flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded Multi-Attribute Filters Drawer */}
      {isExpanded && (
        <div className="pt-3 border-t border-[#EAE6DF] grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-[#5F6572] mb-1">
              Investigation Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PARTIAL_FAILURE">Partial Coverage</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F6572] mb-1">
              Review Priority
            </label>
            <select
              value={filters.reviewPriority}
              onChange={(e) => handleInputChange('reviewPriority', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none"
            >
              <option value="">All Priorities</option>
              <option value="ELEVATED_REVIEW_PRIORITY">Elevated Review</option>
              <option value="REVIEW_RECOMMENDED">Review Recommended</option>
              <option value="STANDARD_PERIODIC_REVIEW">Standard Periodic Review</option>
              <option value="INSUFFICIENT_COVERAGE">Insufficient Coverage</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F6572] mb-1">
              Risk Dimension
            </label>
            <select
              value={filters.dimension}
              onChange={(e) => handleInputChange('dimension', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none"
            >
              <option value="">All Dimensions</option>
              <option value="company_registry">Company Registry / MCA</option>
              <option value="gst_compliance">GST Compliance</option>
              <option value="court_litigation">Court & Litigation</option>
              <option value="blacklist_debarment">Blacklist / Debarment</option>
              <option value="negative_news">Negative News & Media</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F6572] mb-1">
              Date Range (From)
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleInputChange('dateFrom', e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Result Tally Banner */}
      <div className="flex items-center justify-between text-[11px] text-[#5F6572] pt-1">
        <span>Showing {totalResults} matching report(s)</span>
        {activeCount > 0 && (
          <span className="font-medium text-[#1C1F26]">
            {activeCount} active filter criterion applied
          </span>
        )}
      </div>
    </div>
  );
};
