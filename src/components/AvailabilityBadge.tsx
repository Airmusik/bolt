import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';
import { driverApprovalLabel, driverNeedsApproval } from '@/lib/driverEligibility';

interface Props {
  availability?: string | null;
  size?: 'sm' | 'md';
  className?: string;
  profile?: Profile;
}

export function AvailabilityBadge({ availability, size = 'sm', className, profile }: Props) {
  if (driverNeedsApproval(profile) && availability !== 'busy') return <span className={cn('badge-warning', size === 'sm' ? 'text-[11px]' : 'text-xs', className)}>{driverApprovalLabel(profile)}</span>;
  const isAvailable = availability === 'available';
  const isEngaged = availability === 'busy';
  return (
    <span
      className={cn(
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        isAvailable ? 'badge-success' : isEngaged ? 'badge-warning' : 'badge-danger',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isAvailable ? 'bg-green-500' : isEngaged ? 'bg-amber-500' : 'bg-red-500')} />
      {isAvailable ? 'Available' : isEngaged ? 'Currently on a connection' : 'Unavailable'}
    </span>
  );
}
