import React from 'react';

export interface MetricCounterProps {
  label: string;
  value: number | null | undefined;
  subtext: string;
  tone?: 'default' | 'verified' | 'caution' | 'risk';
}

export const MetricCounter: React.FC<MetricCounterProps> = ({
  label,
  value,
  subtext,
  tone = 'default',
}) => {
  const isPresent = typeof value === 'number';

  const toneTextClasses = {
    default: 'text-[#1C1F26]',
    verified: 'text-[#15803D]',
    caution: 'text-[#B45309]',
    risk: 'text-[#B91C1C]',
  };

  return (
    <div className="bg-white border border-[#EAE6DF] rounded p-4 flex flex-col justify-between">
      <div className="text-xs font-medium text-[#5F6572]">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`text-2xl font-bold tabular-nums tracking-tight ${
            isPresent ? toneTextClasses[tone] : 'text-[#8A91A0]'
          }`}
        >
          {isPresent ? value : '—'}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-[#8A91A0]">{subtext}</div>
    </div>
  );
};
