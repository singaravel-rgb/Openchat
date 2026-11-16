import { HTMLAttributes, forwardRef } from 'react';

export const Avatar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { src?: string; alt?: string; name?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }>(
  ({ className = '', src, alt, name, size = 'md', ...props }, ref) => {
    const sizes = {
      sm: 'h-6 w-6 text-xs',
      md: 'h-8 w-8 text-sm',
      lg: 'h-10 w-10 text-base',
      xl: 'h-12 w-12 text-lg',
    };

    const getInitials = (name: string) => {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    };

    const getColor = (name: string) => {
      const colors = [
        'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500',
        'bg-purple-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500',
        'bg-orange-500', 'bg-cyan-500', 'bg-rose-500', 'bg-violet-500',
      ];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    return (
      <div
        ref={ref}
        className={`
          inline-flex items-center justify-center rounded-full font-medium text-white
          ${sizes[size]} ${className}
        `}
        {...props}
      >
        {src ? (
          <img src={src} alt={alt || name || 'Avatar'} className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className={getColor(name || '')}>{name ? getInitials(name) : '?'}</span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';