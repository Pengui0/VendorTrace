import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#1C1F26]/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog positioner */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full ${maxWidthClasses[maxWidth]} bg-white rounded-md border border-[#D5CEC2] shadow-xl overflow-hidden focus:outline-none`}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-[#EAE6DF] bg-[#FCFBF9]">
            <div>
              <h3 className="text-base font-semibold text-[#1C1F26]">{title}</h3>
              {description && (
                <p className="mt-0.5 text-xs text-[#5F6572]">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-[#5F6572] hover:text-[#1C1F26] p-1 rounded hover:bg-[#F4F1EA] transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#EAE6DF] bg-[#FCFBF9]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
