import { useEffect, useState } from 'react';
import { AdminAdSettings } from './AdminAdSettings';
import { useSiteSettings } from '@/lib/siteSettings';
import { supabase } from '@/lib/supabase';
import { adSettingsError } from '@/lib/ads';
import { useToast } from './useToast';

export function AdminAdvertisements() {
  const { settings: live, refreshSettings } = useSiteSettings();
  const [settings, setSettings] = useState(live);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => setSettings(live), [live]);
  const save = async () => {
    const problem = adSettingsError(settings);
    if (problem) { toast(problem, 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('site_settings').upsert(Object.entries(settings).filter(([key]) => key.startsWith('ads_') || key.startsWith('adsense_')).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })), { onConflict: 'key' });
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    await refreshSettings(); toast('Advertisement settings saved.');
  };
  return <div className="space-y-4"><AdminAdSettings settings={settings} onChange={setSettings} /><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save advertisements'}</button></div>;
}
