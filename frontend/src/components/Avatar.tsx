import { HTMLAttributes, forwardRef } from 'react';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  role?: 'customer' | 'agent' | 'admin' | 'super_admin' | 'ai' | 'system';
}

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-base',
};

// Distinct, high-contrast, professional palette with crisp white text
const CUSTOMER_PALETTE = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-sky-600',
  'bg-cyan-700',
  'bg-violet-600',
  'bg-rose-600',
];

export function getAvatarInitials(name?: string): string {
  if (!name) return '?';
  const clean = name.trim();
  const lower = clean.toLowerCase();

  if (lower.startsWith('ai ') || lower === 'ai' || lower.includes('assistant')) {
    return 'AI';
  }
  if (lower.startsWith('guest_') || lower.startsWith('guest ')) {
    return 'GV';
  }
  if (clean.includes('@')) {
    const local = clean.split('@')[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, Math.min(2, clean.length)).toUpperCase();
}

export function getAvatarColor(name?: string, role?: string): string {
  if (role === 'ai') return 'bg-purple-600';
  if (role === 'agent' || role === 'admin' || role === 'super_admin') return 'bg-blue-600';
  if (!name) return 'bg-slate-600';

  const lower = name.toLowerCase();
  if (lower.includes('ai') || lower.includes('assistant')) return 'bg-purple-600';
  if (lower.includes('agent') || lower === 'you') return 'bg-blue-600';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CUSTOMER_PALETTE[Math.abs(hash) % CUSTOMER_PALETTE.length];
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className = '', src, alt, name, size = 'md', role, ...props }, ref) => {
    const isAi = role === 'ai' || (name && (name.toLowerCase().includes('assistant') || name.toLowerCase() === 'ai'));
    
    // Check if custom background color class is explicitly provided in className
    const hasCustomBg = /\bbg-\S+/.test(className);
    const bgColor = hasCustomBg ? '' : getAvatarColor(name, role);
    const sizeClass = AVATAR_SIZES[size] || AVATAR_SIZES.md;
    const initials = getAvatarInitials(name);

    return (
      <div
        ref={ref}
        className={`
          relative inline-flex items-center justify-center rounded-full font-semibold text-white
          select-none flex-shrink-0 overflow-hidden shadow-sm
          ${sizeClass}
          ${bgColor}
          ${className}
        `}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="h-full w-full rounded-full object-cover"
          />
        ) : isAi ? (
          <svg className="w-1/2 h-1/2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ) : (
          <span className="leading-none text-center font-bold tracking-tight">
            {initials}
          </span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
