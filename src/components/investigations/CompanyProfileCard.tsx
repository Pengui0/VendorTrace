import React from 'react';
import { ResolvedCompanyProfile } from '../../server/providers/types.js';
import { Card } from '../common/Card.js';
import { Badge } from '../common/Badge.js';
import {
  Building2,
  Calendar,
  MapPin,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  FileCheck,
  AlertCircle,
  Database,
  Clock,
} from 'lucide-react';

interface CompanyProfileCardProps {
  profile: ResolvedCompanyProfile;
  className?: string;
}

export const CompanyProfileCard: React.FC<CompanyProfileCardProps> = ({
  profile,
  className = '',
}) => {
  const isProprietorship = profile.entityType === 'PROPRIETORSHIP';
  const isLlp = profile.entityType === 'LLP';

  const getMatchTone = (method: ResolvedCompanyProfile['identityMatchMethod']) => {
    switch (method) {
      case 'EXACT_CIN':
      case 'EXACT_LLPIN':
      case 'EXACT_GSTIN':
        return 'verified';
      case 'CONFIRMED_SELECTION':
        return 'verified';
      case 'NAME_MATCH':
      default:
        return 'caution';
    }
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amt);
  };

  return (
    <Card
      header="Official Corporate & Tax Entity Profile"
      headerAction={
        <div className="flex items-center gap-2">
          {profile.isCached && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800">
              Cached (24h TTL)
            </span>
          )}
          <Badge tone={getMatchTone(profile.identityMatchMethod)} size="sm">
            {profile.identityMatchMethod.replace('_', ' ')}
          </Badge>
        </div>
      }
      className={`space-y-4 ${className}`}
    >
      <div className="space-y-4 text-xs">
        {/* Title & Core Identifiers */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[#EAE6DF]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#1C1F26]">
                {profile.canonicalName}
              </h2>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[#5F6572]">
                {profile.entityType}
              </span>
              <Badge
                tone={
                  profile.companyStatus.toUpperCase().includes('ACTIVE')
                    ? 'verified'
                    : 'risk'
                }
                size="sm"
              >
                {profile.companyStatus}
              </Badge>
            </div>

            {profile.tradeName && (
              <p className="mt-0.5 text-xs text-[#5F6572]">
                Trade Name: <strong>{profile.tradeName}</strong>
              </p>
            )}
          </div>

          {/* Source Link */}
          {profile.sourceUrl && (
            <a
              href={profile.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-[#1C1F26] hover:underline shrink-0"
            >
              <span>Verify Official Registry Source</span>
              <ExternalLink className="w-3 h-3 text-[#8A91A0]" />
            </a>
          )}
        </div>

        {/* Identity & Ambiguity Guidance Banner */}
        {profile.ambiguityNotes && (
          <div className="p-2.5 rounded bg-[#FCFBF9] border-l-2 border-[#1C1F26] border-y border-r border-[#EAE6DF] text-[11px] text-[#5F6572] leading-relaxed">
            <strong className="text-[#1C1F26]">Identity Verification Note: </strong>
            {profile.ambiguityNotes}
          </div>
        )}

        {/* Core Metadata Grid: Render only fields actually returned by provider */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* CIN or LLPIN or GSTIN */}
          {profile.cin && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Corporate ID (CIN)
              </span>
              <span className="font-mono text-xs font-bold text-[#1C1F26] block mt-0.5">
                {profile.cin}
              </span>
            </div>
          )}

          {profile.llpin && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                LLP Identification (LLPIN)
              </span>
              <span className="font-mono text-xs font-bold text-[#1C1F26] block mt-0.5">
                {profile.llpin}
              </span>
            </div>
          )}

          {profile.gstins.length > 0 && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Goods & Services Tax (GSTIN)
              </span>
              <span className="font-mono text-xs font-bold text-[#1C1F26] block mt-0.5 truncate">
                {profile.gstins.join(', ')}
              </span>
            </div>
          )}

          {profile.pan && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Income Tax PAN
              </span>
              <span className="font-mono text-xs font-bold text-[#1C1F26] block mt-0.5">
                {profile.pan}
              </span>
            </div>
          )}

          {profile.incorporationDate && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                {isProprietorship ? 'Registration Date' : 'Incorporation Date'}
              </span>
              <div className="flex items-center gap-1 text-xs text-[#1C1F26] mt-0.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-[#8A91A0]" />
                <span>{profile.incorporationDate}</span>
              </div>
            </div>
          )}

          {profile.businessCategory && (
            <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded sm:col-span-2">
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                Business Category / Constitution
              </span>
              <span className="text-xs text-[#1C1F26] block mt-0.5 font-medium">
                {profile.businessCategory}
              </span>
            </div>
          )}
        </div>

        {/* Registered Office Address if returned */}
        {profile.registeredOffice && (
          <div className="p-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded flex items-start gap-2">
            <MapPin className="w-4 h-4 text-[#5F6572] shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#8A91A0] block">
                {isProprietorship ? 'Principal Place of Business' : 'RoC Registered Office Address'}
              </span>
              <p className="text-xs text-[#1C1F26] mt-0.5 leading-relaxed">
                {profile.registeredOffice}
              </p>
            </div>
          </div>
        )}

        {/* Directors List if accessible */}
        {profile.directors && profile.directors.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#EAE6DF]">
            <span className="text-xs font-bold text-[#1C1F26] flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#5F6572]" />
              <span>Registered Directors / Partners ({profile.directors.length})</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profile.directors.map((d, i) => (
                <div key={i} className="p-2.5 bg-[#FCFBF9] border border-[#EAE6DF] rounded flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#1C1F26]">{d.name}</span>
                    <span className="font-mono text-[10px] text-[#5F6572]">DIN: {d.din}</span>
                  </div>
                  {d.designation && (
                    <span className="text-[10px] text-[#8A91A0] mt-0.5">
                      {d.designation} {d.appointmentDate ? `· Appointed: ${d.appointmentDate}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Registered Charges & Filings if accessible */}
        {profile.charges && profile.charges.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#EAE6DF]">
            <span className="text-xs font-bold text-[#1C1F26] flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-[#5F6572]" />
              <span>Registered Charges & Filings ({profile.charges.length})</span>
            </span>

            <div className="divide-y divide-[#EAE6DF] border border-[#EAE6DF] rounded bg-white">
              {profile.charges.map((c, i) => (
                <div key={i} className="p-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#1C1F26]">{c.holderName}</span>
                    <div className="text-[10px] text-[#8A91A0]">
                      Charge ID: {c.chargeId} {c.creationDate ? `· Created: ${c.creationDate}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-semibold text-[#1C1F26]">
                      {formatCurrency(c.amountInr)}
                    </span>
                    <div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp & Registry Provenance Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-2 border-t border-[#EAE6DF] text-[10px] text-[#8A91A0]">
          <div>
            <span>Retrieved via IndiaCos Registry Engine · Fetched: {new Date(profile.lastFetchedAt).toLocaleString()}</span>
          </div>
          {profile.sourceUpdatedAt && (
            <div>
              <span>Source Last Updated: {new Date(profile.sourceUpdatedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
