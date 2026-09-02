import { ReactNode } from 'react';
import { Inbox, Sparkles } from 'lucide-react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-ink-200 bg-gradient-to-br from-white via-white to-brand-50/70 px-6 py-16 text-center dark:from-[#141416] dark:via-[#141416] dark:to-brand-950/20">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-accent-100/60 blur-3xl dark:bg-accent-500/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-ink-500 shadow-card ring-1 ring-ink-100 dark:bg-[#1d1d20]">
        <Inbox className="h-7 w-7" />
        <Sparkles className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-accent-500 p-1 text-white shadow-sm" />
      </div>
      <h3 className="relative mt-5 font-display text-lg font-bold text-ink-900">{title}</h3>
      {description && <p className="relative mt-1 max-w-sm text-sm leading-6 text-ink-500">{description}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}
