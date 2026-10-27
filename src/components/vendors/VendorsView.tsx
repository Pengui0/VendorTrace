import React, { useState, useEffect } from 'react';
import { Vendor } from '../../types/domain.js';
import { EmptyState } from '../common/EmptyState.js';
import { Button } from '../common/Button.js';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import { VendorProfileView } from './VendorProfileView.js';
import { Building2, Plus, Search, ShieldCheck, MapPin, Tag, ArrowLeft, ExternalLink } from 'lucide-react';
import { Investigation } from '../../types/vendor.js';
import { loadWorkspace } from '../../persistence/localStore.js';

interface VendorsViewProps {
  onStartInvestigation: () => void;
  onSelectInvestigation?: (invId: string) => void;
  onCompareInvestigations?: (prevId: string, currId: string) => void;
  investigations?: Investigation[];
}

export const VendorsView: React.FC<VendorsViewProps> = ({
  onStartInvestigation,
  onSelectInvestigation,
  onCompareInvestigations,
  investigations = [],
}) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const fetchVendors = (query = '') => {
    setIsLoading(true);
    const url = query ? `/api/vendors?q=${encodeURIComponent(query)}` : '/api/vendors';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        const fromServer: Vendor[] = data.vendors || [];
        const sourceReports = investigations.length ? investigations : loadWorkspace().investigations;
        const fromReports: Vendor[] = sourceReports.map((inv) => ({
          id: `local-${inv.identifierType}-${inv.identifierValue}`,
          canonicalName: inv.targetName,
          inputNames: [inv.targetName],
          cin: inv.identifierType === 'CIN' ? inv.identifierValue : null,
          gstins: inv.identifierType === 'GSTIN' ? [inv.identifierValue] : [],
          pan: inv.identifierType === 'PAN' ? inv.identifierValue : null,
          companyStatus: 'UNKNOWN',
          registeredAddress: null,
          sourceReference: 'Saved investigation report',
          firstSeenAt: inv.createdAt,
          lastCheckedAt: inv.completedAt || inv.createdAt,
          latestRiskStatus: inv.findingsCount.materialRisk ? 'MATERIAL_RISK' : inv.findingsCount.caution ? 'CAUTION' : inv.findingsCount.verifiedClear ? 'VERIFIED_CLEAR' : 'UNKNOWN',
        }));
        const merged = new Map<string, Vendor>();
        [...fromReports, ...fromServer].forEach((vendor) => merged.set(vendor.id, vendor));
        const all = [...merged.values()];
        setVendors(query ? all.filter((v) => `${v.canonicalName} ${v.cin || ''} ${v.gstins.join(' ')}`.toLowerCase().includes(query.toLowerCase())) : all);
        if (data.storageStatus) setStorageStatus(data.storageStatus);
      })
      .catch((err) => console.error('Error fetching vendors:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchVendors();
  }, [investigations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVendors(searchQuery);
  };

  const getRiskBadge = (status: Vendor['latestRiskStatus']) => {
    switch (status) {
      case 'MATERIAL_RISK':
        return <Badge tone="risk" size="sm">Material Risk</Badge>;
      case 'CAUTION':
        return <Badge tone="caution" size="sm">Caution</Badge>;
      case 'VERIFIED_CLEAR':
        return <Badge tone="verified" size="sm">Verified Clear</Badge>;
      case 'UNKNOWN':
      default:
        return <Badge tone="neutral" size="sm">Status Unknown</Badge>;
    }
  };

  // If a vendor is selected, drill down into full Vendor Profile with report history
  if (selectedVendorId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedVendorId(null)}
          className="text-xs font-semibold text-[#5F6572] hover:text-[#1C1F26] flex items-center gap-1.5 cursor-pointer pb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Vendor Directory
        </button>
        <VendorProfileView
          vendorId={selectedVendorId}
          investigations={investigations.length ? investigations : loadWorkspace().investigations}
          onSelectInvestigation={(invId) => {
            if (onSelectInvestigation) onSelectInvestigation(invId);
          }}
          onCompareInvestigations={onCompareInvestigations}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#EAE6DF]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1F26]">
            Vendor Master Directory
          </h1>
          <p className="mt-1 text-xs text-[#5F6572]">
            Corporate entities verified and under procurement due diligence in this workspace. Click any vendor to inspect historical audit reports and trends.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={onStartInvestigation}
        >
          Add & Investigate Vendor
        </Button>
      </div>

      {/* Persistence State Banner */}
      <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#8A91A0]">Repository Storage:</span>
          <span className="font-mono text-[#1C1F26] text-[11px]">
            {storageStatus?.activeAdapterName || 'DevInMemoryRepositoryAdapter'}
          </span>
          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            {storageStatus?.isDurable ? 'Durable Firestore' : 'Non-Durable In-Memory Adapter'}
          </span>
        </div>
        <span className="text-[11px] text-[#5F6572]">
          {vendors.length} Vendor{vendors.length === 1 ? '' : 's'} on record
        </span>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8A91A0] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by legal name, CIN, GSTIN, or alias..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D5CEC2] rounded text-[#1C1F26] focus:outline-none focus:border-[#1C1F26]"
          />
        </div>
        <Button type="submit" variant="secondary" size="md">
          Search
        </Button>
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setSearchQuery('');
              fetchVendors('');
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {/* Vendor Table or Empty State */}
      <Card
        header="Tracked Corporate Entities"
        headerAction={
          <span className="text-xs text-[#5F6572]">
            Click any row to open Vendor Profile & Report History
          </span>
        }
        noPadding={vendors.length > 0}
      >
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#8A91A0]">
            Loading vendor records from repository...
          </div>
        ) : vendors.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-5 h-5" />}
            title="No vendors tracked in this workspace yet"
            description="Vendors are automatically registered upon running due diligence investigations. Use the primary action to run an investigation."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={onStartInvestigation}
              >
                Investigate a vendor
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-[#EAE6DF]">
            {vendors.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelectedVendorId(v.id)}
                className="p-4 space-y-2 hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#1C1F26] hover:underline flex items-center gap-1.5">
                      {v.canonicalName}
                      <ExternalLink className="w-3 h-3 text-[#5F6572]" />
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572]">
                      ID: {v.id}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      RoC: {v.companyStatus}
                    </span>
                  </div>
                  <div>{getRiskBadge(v.latestRiskStatus)}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[#5F6572]">
                  <div>
                    <span className="text-[#8A91A0]">CIN: </span>
                    <span className="font-mono text-[#1C1F26]">{v.cin || 'Not Available'}</span>
                  </div>
                  <div>
                    <span className="text-[#8A91A0]">GSTINs: </span>
                    <span className="font-mono text-[#1C1F26]">
                      {v.gstins.length > 0 ? v.gstins.join(', ') : 'None on record'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A91A0]">Last Checked: </span>
                    <span className="text-[#1C1F26]">{new Date(v.lastCheckedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {v.inputNames.length > 1 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#8A91A0]">
                    <Tag className="w-3 h-3" />
                    <span>Aliases: {v.inputNames.join(' · ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
