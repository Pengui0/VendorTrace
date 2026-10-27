import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
  variant?: 'underline' | 'segmented';
}

export function Tabs<T extends string = string>({
  items,
  activeId,
  onChange,
  className = '',
  variant = 'underline',
}: TabsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div
        className={`flex flex-wrap items-stretch gap-1 p-1 w-full min-w-0 bg-[#F4F1EA] rounded border border-[#EAE6DF] ${className}`}
        role="tablist"
      >
        {items.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`flex flex-1 basis-[180px] min-w-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-center whitespace-normal break-words font-medium rounded transition-colors cursor-pointer select-none ${
                isActive
                  ? 'bg-white text-[#1C1F26] shadow-xs font-semibold'
                  : 'text-[#5F6572] hover:text-[#1C1F26] hover:bg-white/50'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span className="min-w-0">{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="text-[11px] tabular-nums text-[#8A91A0] ml-1">
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex border-b border-[#EAE6DF] gap-6 ${className}`} role="tablist">
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 pb-2.5 text-sm font-medium transition-colors cursor-pointer relative ${
              isActive
                ? 'text-[#1C1F26] font-semibold'
                : 'text-[#5F6572] hover:text-[#1C1F26]'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="text-xs tabular-nums text-[#8A91A0]">
                ({tab.count})
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1C1F26]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
