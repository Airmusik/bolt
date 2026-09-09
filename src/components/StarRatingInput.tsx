import { useId } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StarRatingInput({ value, onChange, label = 'Your rating', disabled = false }: { value: number; onChange: (value: number) => void; label?: string; disabled?: boolean }) {
  const name = useId();
  return <fieldset disabled={disabled}>
    <legend className="label">{label}</legend>
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map(stars => <label key={stars} className="relative cursor-pointer rounded-lg">
        <input type="radio" name={name} value={stars} checked={value === stars} onChange={() => onChange(stars)} className="peer sr-only" aria-label={`${stars} ${stars === 1 ? 'star' : 'stars'}`} required />
        <span className="flex h-11 w-11 items-center justify-center rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-ink-900"><Star aria-hidden="true" className={cn('h-7 w-7', stars <= value ? 'fill-amber-400 text-amber-500' : 'text-ink-300')} /></span>
      </label>)}
    </div>
    <p aria-live="polite" className="mt-1 text-xs text-ink-500">{value ? `${value} out of 5 — ${['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'][value - 1]}` : 'Choose a rating from 1 to 5 stars.'}</p>
  </fieldset>;
}
