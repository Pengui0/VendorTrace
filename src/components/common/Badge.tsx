import React from 'react';

export type BadgeTone = 'verified' | 'caution' | 'risk' | 'neutral' | 'subtle';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  tone = 'neutral',
  dot = true,
  className = '',
  size = 'md',
}) => {
  const toneClasses: Record<BadgeTone, { bg: string; text: string; border: string; dotColor: string }> = {
    verified: {
      bg: 'bg-[#F0FDF4]',
      text: 'text-[#15803D]',
      border: 'border-[#BBF7D0]',
      dotColor: 'bg-[#15803D]',
    },
    caution: {
      bg: 'bg-[#FFFBEB]',
      text: 'text-[#B45309]',
      border: 'border-[#FDE68A]',
      dotColor: 'bg-[#B45309]',
    },
    risk: {
      bg: 'bg-[#FEF2F2]',
      text: 'text-[#B91C1C]',
      border: 'border-[#FECACA]',
      dotColor: 'bg-[#B91C1C]',
    },
    neutral: {
      bg: 'bg-[#F1F5F9]',
      text: 'text-[#475569]',
      border: 'border-[#E2E8F0]',
      dotColor: 'bg-[#64748B]',
    },
    subtle: {
      bg: 'bg-[#FAF8F5]',
      text: 'text-[#5F6572]',
      border: 'border-[#EAE6DF]',
      dotColor: 'bg-[#8A91A0]',
    },
  };

  const sizeClasses = {
    sm: 'text-[11px] px-1.5 py-0.5 font-medium',
    md: 'text-xs px-2 py-0.5 font-medium',
  };

  const { bg, text, border, dotColor } = toneClasses[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border ${bg} ${text} ${border} ${sizeClasses[size]} select-none ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
      <span>{children}</span>
    </span>
  );
};
