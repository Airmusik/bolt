import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChatNotice({ label, children }: { label: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <div className={cn('shrink-0 items-start gap-2 border-b border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-700', dismissed ? 'hidden sm:flex' : 'flex')}>
      <div className="flex min-w-0 flex-1 items-start gap-2">{children}</div>
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={() => setDismissed(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-500 sm:hidden"
      ><X className="h-5 w-5" aria-hidden="true" /></button>
    </div>
  );
}
