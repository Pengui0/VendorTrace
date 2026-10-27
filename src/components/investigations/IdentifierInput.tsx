import React, { useState } from 'react';
import { IdentifierType } from '../../types/vendor.js';
import { Button } from '../common/Button.js';
import { SearchCheck, HelpCircle, Sparkles } from 'lucide-react';

interface IdentifierInputProps {
  initialValues?: { targetName: string; identifierType: IdentifierType; identifierValue: string } | null;
  onInvestigate: (params: {
    targetName: string;
    identifierType: IdentifierType;
    identifierValue: string;
    freshRun?: boolean;
  }) => void;
  isLoading: boolean;
}

export const IdentifierInput: React.FC<IdentifierInputProps> = ({
  initialValues,
  onInvestigate,
  isLoading,
}) => {
  const [targetName, setTargetName] = useState(initialValues?.targetName || '');
  const [identifierType, setIdentifierType] = useState<IdentifierType>(initialValues?.identifierType || 'CIN');
  const [identifierValue, setIdentifierValue] = useState(initialValues?.identifierValue || '');
  const [freshRun, setFreshRun] = useState(false);

  const identifierGuides: Record<IdentifierType, { label: string; placeholder: string; hint: string; regex?: RegExp }> = {
    CIN: {
      label: 'Corporate Identification Number (CIN)',
      placeholder: 'e.g. L27100MH1907PLC000260',
      hint: '21-digit alphanumeric code issued by MCA to registered companies.',
      regex: /^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/,
    },
    GSTIN: {
      label: 'Goods & Services Tax ID (GSTIN)',
      placeholder: 'e.g. 27AAACW1234F1Z5',
      hint: '15-digit alphanumeric identifier assigned under the GST regime.',
      regex: /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[1-9A-Za-z]{1}[Zz][0-9A-Za-z]{1}$/,
    },
    PAN: {
      label: 'Permanent Account Number (PAN)',
      placeholder: 'e.g. AAACW1234F',
      hint: '10-character code issued by the Indian Income Tax Department.',
      regex: /^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/,
    },
    DIN: {
      label: 'Director Identification Number (DIN)',
      placeholder: 'e.g. 08219432',
      hint: '8-digit unique number assigned to registered directors by MCA.',
      regex: /^[0-9]{8}$/,
    },
    NAME: {
      label: 'Company Legal Trade Name',
      placeholder: 'e.g. Acme Infra & Power Private Limited',
      hint: 'Exact corporate name as registered in Ministry of Corporate Affairs.',
    },
  };

  const currentGuide = identifierGuides[identifierType];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName.trim()) return;
    onInvestigate({
      targetName: targetName.trim(),
      identifierType,
      identifierValue: identifierValue.trim().toUpperCase(),
      freshRun,
    });
  };

  const handleQuickLoad = (name: string, type: IdentifierType, val: string) => {
    setTargetName(name);
    setIdentifierType(type);
    setIdentifierValue(val);
  };

  return (
    <div className="bg-white border border-[#EAE6DF] rounded p-5 space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1C1F26] uppercase tracking-wider">
            Initiate Vendor Due Diligence Run
          </h2>
          <p className="text-xs text-[#5F6572] mt-0.5">
            Query verified Indian registries across MCA21, GSTN, litigation databases, and adverse news.
          </p>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-[#5F6572]">
          <input type="checkbox" checked={freshRun} onChange={(event) => setFreshRun(event.target.checked)} />
          Fetch fresh evidence (bypass cached provider results)
        </label>

        {/* Quick test scenarios */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-[#5F6572]">
          <span className="text-[11px] text-[#8A91A0]">Test Presets:</span>
          <button
            type="button"
            onClick={() => handleQuickLoad('Tata Steel Limited', 'CIN', 'L27100MH1907PLC000260')}
            className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
          >
            Tata Steel (CIN)
          </button>
          <button
            type="button"
            onClick={() => handleQuickLoad('Larsen & Toubro Ltd', 'GSTIN', '27AAACL0140P1ZM')}
            className="px-2 py-1 rounded bg-[#FAF8F5] border border-[#EAE6DF] text-[11px] text-[#1C1F26] hover:bg-[#F4F1EA] cursor-pointer"
          >
            L&T (GSTIN)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Target Company Name */}
          <div className="lg:col-span-5 space-y-1">
            <label className="block text-xs font-semibold text-[#1C1F26]">
              Target Entity Legal Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g. Bharat Heavy Electricals Limited"
              required
              className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none focus:border-[#1C1F26] transition-colors"
            />
          </div>

          {/* Identifier Type Selector */}
          <div className="lg:col-span-3 space-y-1">
            <label className="block text-xs font-semibold text-[#1C1F26]">
              Registry Key Type
            </label>
            <select
              value={identifierType}
              onChange={(e) => setIdentifierType(e.target.value as IdentifierType)}
              className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none focus:border-[#1C1F26] transition-colors cursor-pointer"
            >
              <option value="CIN">CIN (MCA21 Corporate ID)</option>
              <option value="GSTIN">GSTIN (15-digit GST Code)</option>
              <option value="PAN">PAN (Income Tax Permanent ID)</option>
              <option value="DIN">DIN (Director Director ID)</option>
              <option value="NAME">Trade Name Only (Fuzzy Match)</option>
            </select>
          </div>

          {/* Identifier Value */}
          <div className="lg:col-span-4 space-y-1">
            <label className="block text-xs font-semibold text-[#1C1F26]">
              {currentGuide.label}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={identifierValue}
                onChange={(e) => setIdentifierValue(e.target.value)}
                placeholder={currentGuide.placeholder}
                className="min-w-0 flex-1 px-3 py-2 text-xs font-mono uppercase bg-[#FAF8F5] border border-[#D5CEC2] rounded text-[#1C1F26] focus:bg-white focus:outline-none focus:border-[#1C1F26] transition-colors"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                disabled={!targetName.trim()}
                icon={<SearchCheck className="w-4 h-4" />}
                className="shrink-0"
              >
                Investigate
              </Button>
            </div>
          </div>
        </div>

        {/* Format Guidance */}
        <div className="flex flex-col gap-1 text-[11px] text-[#5F6572] pt-1 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[#8A91A0]" />
            <span>{currentGuide.hint}</span>
          </div>
          <span className="text-[#8A91A0] text-[10px]">
            Strict Rule: Verified identifiers reduce false positive risk matching by 94%.
          </span>
        </div>
      </form>
    </div>
  );
};
