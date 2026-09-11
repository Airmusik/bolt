import type { ReactNode } from 'react';

export function PromotedSearchSection<T extends { id: string }>({ items, kind, renderItem }: { items: T[]; kind: 'cars' | 'drivers'; renderItem: (item: T) => ReactNode }) {
  if (!items.length) return null;
  return <section aria-label={`Promoted ${kind}`} className="mb-6 min-w-0 border-b border-ink-200 pb-5">
    <h2 className="font-display text-lg font-bold text-ink-900">Promoted {kind}</h2>
    <p className="mt-1 text-xs leading-5 text-ink-500">Paid placements across Kenya. Some may be outside your search filters. Scroll to explore.</p>
    <div tabIndex={0} aria-label={`Scroll promoted ${kind}`} className="mt-3 grid snap-x snap-proximity auto-cols-[min(85%,300px)] grid-flow-col gap-4 overflow-x-auto pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-500">
      {items.map(item => <div key={item.id} className="min-w-0 snap-start">{renderItem(item)}</div>)}
    </div>
  </section>;
}
