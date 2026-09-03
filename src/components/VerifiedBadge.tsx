import { AlertCircle, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  verified?: boolean;
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export function VerifiedBadge({ verified, size = 16, className, showLabel }: Props) {
  if (!verified && !showLabel) return null;
  if (!verified) {
    return (
      <span title="Driver platform history is not approved" className={cn('inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200', className)}>
        <AlertCircle style={{ width: size, height: size }} />
        <span className="text-xs font-medium">History not approved</span>
      </span>
    );
  }
  return (
    <span title="Submitted platform activity reviewed by an administrator. This is not an identity check or a guarantee of conduct." className={cn('inline-flex items-center gap-1', showLabel && 'rounded-full bg-brand-50 px-2 py-0.5 ring-1 ring-brand-200', className)}>
      <BadgeCheck style={{ width: size, height: size }} className="text-brand-600" />
      {showLabel && <span className="text-xs font-medium text-brand-700">Platform history approved</span>}
    </span>
  );
}
