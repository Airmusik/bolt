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
      <span title="Driver platform history is not approved" className={cn('badge-warning', className)}>
        <AlertCircle style={{ width: size, height: size }} />
        <span className="text-xs font-medium">History not approved</span>
      </span>
    );
  }
  return (
    <span title="Submitted platform activity reviewed by an administrator. This is not an identity check or a guarantee of conduct." className={cn('badge-success', className)}>
      <BadgeCheck style={{ width: size, height: size }} className="shrink-0" />
      {showLabel && <span className="text-xs font-medium">Platform history approved</span>}
    </span>
  );
}
