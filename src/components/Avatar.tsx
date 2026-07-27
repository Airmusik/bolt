import { cn, initials } from '@/lib/utils';
import { VerifiedBadge } from './VerifiedBadge';

interface Props {
  name: string;
  src?: string | null;
  size?: number;
  verified?: boolean;
  className?: string;
}

export function Avatar({ name, src, size = 40, verified, className }: Props) {
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full rounded-full object-cover ring-1 ring-ink-100"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold ring-1 ring-brand-200"
          style={{ fontSize: size * 0.38 }}
        >
          {initials(name) || '?'}
        </div>
      )}
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
          <VerifiedBadge verified size={Math.max(12, size * 0.32)} />
        </span>
      )}
    </div>
  );
}
