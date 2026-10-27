import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  headerAction,
  footer,
  noPadding = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white rounded border border-[#EAE6DF] shadow-none overflow-hidden ${className}`}
      {...props}
    >
      {(header || headerAction) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 bg-[#FCFBF9] border-b border-[#EAE6DF]">
          <div className="min-w-0 flex-1 text-sm font-semibold text-[#1C1F26]">{header}</div>
          {headerAction && <div className="min-w-0 max-w-full">{headerAction}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
      {footer && (
        <div className="px-4 py-3 bg-[#FCFBF9] border-t border-[#EAE6DF] text-xs text-[#5F6572]">
          {footer}
        </div>
      )}
    </div>
  );
};
