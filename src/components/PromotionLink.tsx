import { useEffect, useRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { matchingPromotions, usePromotionLive } from '@/lib/promotionLive';
import { supabase } from '@/lib/supabase';

let fallbackVisitor: string | undefined;
function visitorId() {
  fallbackVisitor ??= crypto.randomUUID();
  try {
    const saved = localStorage.getItem('11drive-promotion-visitor');
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    localStorage.setItem('11drive-promotion-visitor', fallbackVisitor);
  } catch { /* Session-only counting if storage is unavailable. */ }
  return fallbackVisitor;
}

export function PromotionLink({ ownerId, onClick, onAuxClick, ...props }: LinkProps & { ownerId?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { campaigns } = usePromotionLive();
  const path = typeof props.to === 'string' ? props.to : props.to.pathname || '';
  const match = path.match(/^\/(vehicles|drivers|members)\/([0-9a-f-]{36})$/i);
  const ids = match ? matchingPromotions(campaigns, match[1] === 'vehicles' ? 'listing' : 'profile', match[2], ownerId).map(c => c.id).join(',') : '';
  const record = (event: 'reach' | 'click') => {
    if (!ids) return;
    for (const id of ids.split(',')) void supabase.rpc('record_promotion_event', { p_id: id, p_visitor: visitorId(), p_event: event }).then(({ error }) => { if (error) console.warn('Promotion analytics unavailable'); });
  };
  useEffect(() => {
    if (!ids || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.5) && document.visibilityState === 'visible') {
        for (const id of ids.split(',')) void supabase.rpc('record_promotion_event', { p_id: id, p_visitor: visitorId(), p_event: 'reach' });
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ids]);
  return <Link {...props} ref={ref} onClick={e => { record('click'); onClick?.(e); }} onAuxClick={e => { if (e.button === 1) record('click'); onAuxClick?.(e); }} />;
}

export function PromotionBadge({ kind, id, ownerId, featured = false }: { kind: string; id: string; ownerId?: string; featured?: boolean }) {
  const { campaigns } = usePromotionLive();
  return matchingPromotions(campaigns, kind, id, ownerId).length ? <span className="badge-accent">Promoted</span> : featured ? <span className="badge-accent">Featured</span> : null;
}

export function PromoteListingLink({ id, ownerId }: { id: string; ownerId: string }) {
  const { campaigns } = usePromotionLive();
  const active = matchingPromotions(campaigns, 'listing', id, ownerId).length > 0;
  return <Link to={`/promotions?vehicle=${id}`} className={active ? 'btn-secondary w-full' : 'btn-ghost w-full'}>{active ? 'Promoted · View analytics' : 'Promote listing'}</Link>;
}
