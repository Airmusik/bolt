import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  size?: number;
  className?: string;
  showValue?: boolean;
  count?: number;
}

export function Rating({ value, size = 16, className, showValue, count }: Props) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={cn(
              i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-ink-100 text-ink-200'
            )}
          />
        ))}
      </div>
      {showValue && (
        <span className="text-xs font-medium text-ink-600">
          {value > 0 ? value.toFixed(1) : 'New'}
          {count !== undefined && count > 0 ? ` (${count})` : ''}
        </span>
      )}
    </div>
  );
}
