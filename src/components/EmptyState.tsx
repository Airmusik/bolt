import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center dark:bg-[#141416]">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
