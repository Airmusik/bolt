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
  if (driverNeedsApproval(profile) && availability !== 'busy') return <span className={cn('inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800', className)}>{driverApprovalLabel(profile)}</span>;
  const isAvailable = availability === 'available';
  const isEngaged = availability === 'busy';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        isAvailable ? 'bg-green-100 text-green-700' : isEngaged ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isAvailable ? 'bg-green-500' : isEngaged ? 'bg-amber-500' : 'bg-red-500')} />
      {isAvailable ? 'Available' : isEngaged ? 'Currently on a connection' : 'Unavailable'}
    </span>
  );
}
