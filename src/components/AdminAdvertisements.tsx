import { useEffect, useRef, useState } from 'react';
import { AdminAdSettings } from './AdminAdSettings';
import { useSiteSettings } from '@/lib/siteSettings';
import { supabase } from '@/lib/supabase';
import { AD_DEFAULTS, adSettingsError } from '@/lib/ads';
import { changedSettings, mergeSettingsDraft } from '@/lib/adminSettingsDraft';
import { useToast } from './useToast';

export function AdminAdvertisements() {
  const { settings: live, refreshSettings } = useSiteSettings();
  const [settings, setSettings] = useState(live);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState(0);
  const baseline = useRef(live);
  const { toast } = useToast();
  useEffect(() => {
    const previous = baseline.current;
    setSettings(draft => mergeSettingsDraft(draft, previous, live));
    baseline.current = live;
  }, [live]);
  const save = async () => {
    if (busy || uploads > 0) return;
    const problem = adSettingsError(settings);
    if (problem) { toast(problem, 'error'); return; }
    const changes = changedSettings(settings, baseline.current, Object.keys(AD_DEFAULTS));
    if (!changes.length) { toast('No advertisement changes to save.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('site_settings').upsert(changes.map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() })), { onConflict: 'key' });
      if (error) throw error;
      baseline.current = { ...baseline.current, ...Object.fromEntries(changes) };
      await refreshSettings(); toast('Advertisement settings saved.');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not save advertisements. Please try again.', 'error'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4"><fieldset disabled={busy || uploads > 0} className="min-w-0"><AdminAdSettings settings={settings} onChange={setSettings} onBusy={uploading => setUploads(count => Math.max(0, count + (uploading ? 1 : -1)))} /></fieldset><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-4 dark:bg-[#24272e]"><p className="text-xs text-ink-500">{uploads > 0 ? 'Wait for the media upload to finish.' : 'Save publishes your ad content and placement choices.'}</p><button type="button" className="btn-primary" disabled={busy || uploads > 0} onClick={() => void save()}>{busy ? 'Saving…' : 'Save advertisements'}</button></div></div>;
}
