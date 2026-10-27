import React, { useState, useEffect } from 'react';
import { Investigation } from '../../types/vendor.js';
import { getAssessmentDisplayValues, getAssessmentTrend, AssessmentTrend } from '../../utils/assessmentDisplay.js';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  Building2,
  Calendar,
  FileText,
  Download,
  GitCompareArrows,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface VendorProfileData {
  vendorId: string;
  vendorName: string;
  canonicalIdentifier: string;
  identifierType: string | null;
  identifierValue: string | null;
  lastCheckedAt: string | null;
  totalReports: number;
  latestRiskPriority: string;
  latestRiskScore: number | null;
  trend: AssessmentTrend;
  reportHistory: Array<{
    id: string;
    date: string;
    status: string;
    reviewPriority: string;
    riskScore: number | null;
    findingsCount: {
      verifiedClear: number;
      caution: number;
      materialRisk: number;
      requiresReview: number;
    };
  }>;
}

interface VendorProfileViewProps {
  vendorId: string;
  investigations?: Investigation[];
  onSelectInvestigation: (invId: string) => void;
  onCompareInvestigations?: (prevId: string, currId: string) => void;
}

export const VendorProfileView: React.FC<VendorProfileViewProps> = ({
  vendorId,
  investigations = [],
  onSelectInvestigation,
  onCompareInvestigations,
}) => {
  const [profile, setProfile] = useState<VendorProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/vendors/${vendorId}/profile`)
      .then((res) => res.json())
      .then((data: VendorProfileData) => {
        const localReports = investigations.filter((inv) => `local-${inv.identifierType}-${inv.identifierValue}` === vendorId);
        if (data.totalReports > 0 || localReports.length === 0) setProfile(data);
        else setProfile({
          vendorId,
          vendorName: localReports[0].targetName,
          canonicalIdentifier: `${localReports[0].identifierType}: ${localReports[0].identifierValue}`,
          identifierType: localReports[0].identifierType,
          identifierValue: localReports[0].identifierValue,
          lastCheckedAt: localReports[0].completedAt || localReports[0].createdAt,
          totalReports: localReports.length,
          latestRiskPriority: localReports[0].assessmentReport?.reviewPriority || 'REVIEW_RECOMMENDED',
          latestRiskScore: getAssessmentDisplayValues(localReports[0].assessmentReport).riskScore,
          trend: getAssessmentTrend(localReports[0].assessmentReport, localReports[1]?.assessmentReport, localReports.length),
          reportHistory: localReports.map((inv) => ({
            id: inv.id, date: inv.completedAt || inv.createdAt, status: inv.status,
            reviewPriority: getAssessmentDisplayValues(inv.assessmentReport).priority || 'REVIEW_RECOMMENDED',
            riskScore: getAssessmentDisplayValues(inv.assessmentReport).riskScore,
            findingsCount: inv.findingsCount,
          })),
        });
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load vendor profile:', err);
        setIsLoading(false);
      });
  }, [vendorId, investigations]);

  const handleExportPdf = async (invId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(`pdf_${invId}`);
    try {
      const res = await fetch(`/api/reports/${invId}/export/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation: investigations.find((item) => item.id === invId) }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Export failed: ${err.error || 'Server error'}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VendorTrace_${invId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleExportCsv = async (invId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(`csv_${invId}`);
    try {
      const res = await fetch(`/api/reports/${invId}/export/csv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigation: investigations.find((item) => item.id === invId) }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Export failed: ${err.error || 'Server error'}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VendorTrace_Evidence_${invId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleToggleCompare = (invId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedForCompare.includes(invId)) {
      setSelectedForCompare(selectedForCompare.filter((id) => id !== invId));
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], invId]);
      } else {
        setSelectedForCompare([...selectedForCompare, invId]);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-xs text-[#5F6572]">
        Loading verified vendor profile and historical audit ledger...
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={<Building2 className="w-6 h-6 text-[#5F6572]" />}
        title="Vendor Profile Not Found"
        description="No historical due diligence investigations recorded for this vendor."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Profile Card */}
      <div className="bg-white border border-[#D5CEC2] rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[#1C1F26]">{profile.vendorName}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                Verified Vendor
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5F6572]">
              Canonical Identifier: <span className="font-mono font-semibold text-[#1C1F26]">{profile.canonicalIdentifier}</span>
            </p>
          </div>

          {/* Risk Score & Trend Badge */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-semibold text-[#5F6572] uppercase block">
                Latest Risk Score
              </span>
              <span className="text-2xl font-bold text-[#1C1F26]">
                {profile.latestRiskScore !== null ? `${profile.latestRiskScore} / 100` : 'Not calculated'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-center min-w-[100px]">
              <span className="text-[10px] font-semibold text-[#5F6572] uppercase block">
                Risk Trend
              </span>
              <div className="mt-0.5 flex items-center justify-center gap-1 text-xs font-bold">
                {profile.trend === 'IMPROVING' ? (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" /> Improving
                  </span>
                ) : profile.trend === 'DETERIORATING' ? (
                  <span className="text-red-700 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Elevated
                  </span>
                ) : profile.trend === 'BASELINE' ? (
                  <span className="text-slate-700 flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> Baseline
                  </span>
                ) : profile.trend === 'NOT_AVAILABLE' ? (
                  <span className="text-slate-500 flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> Unavailable
                  </span>
                ) : (
                  <span className="text-slate-700 flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> Stable
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Meta Row */}
        <div className="pt-3 border-t border-[#EAE6DF] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[#8A91A0] block text-[11px]">Total Reports</span>
            <span className="font-semibold text-[#1C1F26]">{profile.totalReports}</span>
          </div>
          <div>
            <span className="text-[#8A91A0] block text-[11px]">Last Checked</span>
            <span className="font-semibold text-[#1C1F26]">
              {profile.lastCheckedAt ? new Date(profile.lastCheckedAt).toLocaleDateString() : 'Never'}
            </span>
          </div>
          <div>
            <span className="text-[#8A91A0] block text-[11px]">Latest Priority</span>
            <span className="font-semibold text-[#1C1F26]">{profile.latestRiskPriority.replace(/_/g, ' ')}</span>
          </div>
          <div>
            <span className="text-[#8A91A0] block text-[11px]">Registry Status</span>
            <span className="font-semibold text-emerald-700">Verified Active</span>
          </div>
        </div>
      </div>

      {/* Compare Floating Bar if 2 selected */}
      {selectedForCompare.length === 2 && onCompareInvestigations && (
        <div className="p-3 bg-[#1C1F26] text-white rounded-lg flex items-center justify-between text-xs shadow-md">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-emerald-400" />
            <span>2 investigation reports selected for comparative delta analysis</span>
          </div>
          <button
            type="button"
            onClick={() => onCompareInvestigations(selectedForCompare[0], selectedForCompare[1])}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded cursor-pointer"
          >
            Compare Selected Reports
          </button>
        </div>
      )}

      {/* Historical Reports Timeline & Evidence Registers */}
      <Card
        header={`Due Diligence Report History (${profile.reportHistory.length})`}
        headerAction={
          <span className="text-[11px] text-[#5F6572]">
            Select any 2 reports to compare signal delta
          </span>
        }
      >
        {profile.reportHistory.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-5 h-5" />}
            title="No past reports found"
            description="Execute a fresh investigation on this vendor to populate report history."
          />
        ) : (
          <div className="divide-y divide-[#EAE6DF]">
            {profile.reportHistory.map((report) => {
              const isSelected = selectedForCompare.includes(report.id);
              const isExportingPdf = exportingId === `pdf_${report.id}`;
              const isExportingCsv = exportingId === `csv_${report.id}`;

              return (
                <div
                  key={report.id}
                  onClick={() => onSelectInvestigation(report.id)}
                  className={`py-3 px-3 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/80 border border-blue-200' : 'hover:bg-[#FAF8F5]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleToggleCompare(report.id, e as any)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-[#D5CEC2] text-[#1C1F26] cursor-pointer"
                        title="Select for comparison"
                      />
                      <span className="font-bold text-xs text-[#1C1F26]">
                        Report #{report.id}
                      </span>
                      <span className="text-[11px] font-mono text-[#8A91A0]">
                        {new Date(report.date).toLocaleString()}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {report.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#5F6572]">
                      <span>Priority: <strong className="text-[#1C1F26]">{report.reviewPriority.replace(/_/g, ' ')}</strong></span>
                      <span>·</span>
                      <span>Risk Score: <strong className="text-[#1C1F26]">{report.riskScore !== null ? `${report.riskScore} / 100` : 'Not calculated'}</strong></span>
                      <span>·</span>
                      <span>Flags: {report.findingsCount.materialRisk} Risk · {report.findingsCount.caution} Caution · {report.findingsCount.requiresReview} Review</span>
                    </div>
                  </div>

                  {/* Export and Action Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleExportPdf(report.id, e)}
                      disabled={isExportingPdf}
                      className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold text-[#1C1F26] hover:bg-[#FAF8F5] cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Download PDF report with methodology, sources, and disclaimer"
                    >
                      <Download className={`w-3 h-3 ${isExportingPdf ? 'animate-spin' : ''}`} />
                      {isExportingPdf ? 'Exporting...' : 'PDF'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleExportCsv(report.id, e)}
                      disabled={isExportingCsv}
                      className="px-2.5 py-1.5 bg-white border border-[#D5CEC2] rounded text-[11px] font-semibold text-[#1C1F26] hover:bg-[#FAF8F5] cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Download CSV evidence register with RFC 4180 escaping"
                    >
                      <Download className={`w-3 h-3 ${isExportingCsv ? 'animate-spin' : ''}`} />
                      {isExportingCsv ? 'Exporting...' : 'CSV Register'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
