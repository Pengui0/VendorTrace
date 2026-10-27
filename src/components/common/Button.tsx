import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors cursor-pointer select-none border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 rounded-sm gap-1.5',
    md: 'text-sm px-3.5 py-2 rounded gap-2',
    lg: 'text-base px-5 py-2.5 rounded gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-[#1C1F26] text-white border-[#1C1F26] hover:bg-[#2D323E] active:bg-[#15171C]',
    secondary:
      'bg-[#F4F1EA] text-[#1C1F26] border-[#E5E0D6] hover:bg-[#EAE4D9] active:bg-[#DFD8CC]',
    outline:
      'bg-white text-[#1C1F26] border-[#D5CEC2] hover:bg-[#FAF8F5] active:bg-[#F2EEE6]',
    danger:
      'bg-[#B91C1C] text-white border-[#B91C1C] hover:bg-[#991B1B] active:bg-[#7F1D1D]',
    ghost:
      'bg-transparent text-[#5F6572] border-transparent hover:bg-[#F4F1EA] hover:text-[#1C1F26]',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
      ) : (
        icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {!isLoading && icon && iconPosition === 'right' && (
        <span className="shrink-0">{icon}</span>
      )}
    </button>
  );
};
