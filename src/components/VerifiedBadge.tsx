import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  verified?: boolean;
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export function VerifiedBadge({ verified, size = 16, className, showLabel }: Props) {
  if (!verified) return null;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <BadgeCheck style={{ width: size, height: size }} className="text-brand-600" />
      {showLabel && <span className="text-xs font-medium text-brand-700">Trusted</span>}
    </span>
  );
}
