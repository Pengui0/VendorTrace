import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 bg-[#FAF8F5] border border-dashed border-[#D5CEC2] rounded ${className}`}
    >
      {icon && (
        <div className="w-10 h-10 mb-3 flex items-center justify-center rounded bg-[#F4F1EA] text-[#5F6572] border border-[#EAE6DF]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[#1C1F26]">{title}</h3>
      <p className="mt-1 text-xs text-[#5F6572] max-w-md leading-relaxed">
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="mt-4 flex items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
