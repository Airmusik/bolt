import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type LivePromotion = { id: string; kind: 'listing' | 'profile'; target_id: string; expires_at: string };
const Context = createContext({ campaigns: [] as LivePromotion[], revision: 0 });

export function PromotionLiveProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<LivePromotion[]>([]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('live_promotions');
    if (!error) setCampaigns(old => JSON.stringify(old) === JSON.stringify(data) ? old : data || []);
  }, []);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const focus = () => { setRevision(v => v + 1); void refresh(); };
    window.addEventListener('focus', focus);
    return () => { clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [refresh]);
  useEffect(() => {
    setRevision(v => v + 1);
    const next = Math.min(...campaigns.map(c => Date.parse(c.expires_at)));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => {
      setCampaigns(old => old.filter(c => Date.parse(c.expires_at) > Date.now()));
      void refresh();
    }, Math.min(2147483647, Math.max(0, next - Date.now() + 10)));
    return () => clearTimeout(timer);
  }, [campaigns, refresh]);
  const value = useMemo(() => ({ campaigns, revision }), [campaigns, revision]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePromotionLive() { return useContext(Context); }
export function usePromotionRanking<T extends { id: string; owner_id?: string; created_at: string; rating?: number; platform_history_approved?: boolean }>(items: T[], kind: string): T[] {
  const { campaigns } = usePromotionLive();
  return [...items].sort((a, b) => {
    const promoted = (v: T) => Number(matchingPromotions(campaigns, kind, v.id, v.owner_id).length > 0);
    return promoted(b) - promoted(a) || (kind === 'profile' ? Number(!!b.platform_history_approved) - Number(!!a.platform_history_approved) || (b.rating || 0) - (a.rating || 0) : 0) || Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id);
  });
}
export function matchingPromotions(campaigns: LivePromotion[], kind: string, id: string, ownerId?: string) {
  return campaigns.filter(c => Date.parse(c.expires_at) > Date.now() && ((c.kind === kind && c.target_id === id) || (kind === 'listing' && c.kind === 'profile' && c.target_id === ownerId)));
}
