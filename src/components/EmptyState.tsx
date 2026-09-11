import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-200 bg-ink-50 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl text-ink-500">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="relative mt-5 font-display text-lg font-bold text-ink-900">{title}</h3>
      {description && <p className="relative mt-1 max-w-sm text-sm leading-6 text-ink-500">{description}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}
