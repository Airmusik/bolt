import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { ContactMessageEntry } from '@/lib/types';
export function SupportReceipt({ thread, entries, active }: { thread: string; entries: ContactMessageEntry[]; active: boolean }) {
  const through = entries.reduce((last, entry) => entry.created_at > last ? entry.created_at : last, '');
  useEffect(() => {
    if (!through) return;
    const mark = () => { if (document.visibilityState === 'visible') void supabase.rpc('mark_support_receipt', { p_thread: thread, p_read: active, p_through: through }); };
    mark(); document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [thread, through, active]);
  return null;
}
