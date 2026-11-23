import { forwardRef, HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'agent' | 'customer' | 'system';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'default', children, ...props }, ref) => {
    const variants: Record<string, string> = {
      default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      primary: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
      ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      agent: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      customer: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      system: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };

    const variantStyle = variants[variant] || variants.default;

    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          ${variantStyle} ${className}
        `}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export function getStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'open':
      return 'info'; // Sky / Cyan
    case 'assigned':
    case 'human_handling':
      return 'primary'; // Blue
    case 'pending':
    case 'waiting_on_customer':
    case 'on_hold':
      return 'warning'; // Amber / Orange
    case 'resolved':
      return 'success'; // Green
    case 'closed':
      return 'default'; // Slate / Gray
    case 'ai_handling':
      return 'ai'; // Purple
    default:
      return 'default';
  }
}

export function getSenderTypeBadgeVariant(type: string): BadgeProps['variant'] {
  switch (type) {
    case 'customer':
      return 'customer';
    case 'agent':
      return 'agent';
    case 'ai':
      return 'ai';
    case 'system':
      return 'system';
    default:
      return 'default';
  }
}