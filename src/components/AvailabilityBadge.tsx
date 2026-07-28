import { cn } from '@/lib/utils';

interface Props {
  availability?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function AvailabilityBadge({ availability, size = 'sm', className }: Props) {
  const isAvailable = availability === 'available';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isAvailable ? 'bg-green-500' : 'bg-red-500')} />
      {isAvailable ? 'Available' : 'Unavailable'}
    </span>
  );
}
