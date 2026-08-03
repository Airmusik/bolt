import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const DEFAULT_SITE_SETTINGS = {
  site_name: 'GariLink',
  maintenance_mode: 'false',
  max_vehicles_per_owner: '10',
  require_email: 'true',
  platform_fee_percent: '0',
  admin_contact_email: 'airmusikinck@gmail.com',
  admin_contact_phone: '+254708593011',
} as const;

export type SiteSettingKey = keyof typeof DEFAULT_SITE_SETTINGS;
export type SiteSettings = Record<SiteSettingKey, string>;

type SiteSettingRow = {
  key: string;
  value: string | null;
};

export function normalizeSiteSettings(rows: SiteSettingRow[] | null | undefined): SiteSettings {
  const settings: Record<string, string> = { ...DEFAULT_SITE_SETTINGS };
  rows?.forEach((row) => {
    if (row.key in DEFAULT_SITE_SETTINGS) {
      settings[row.key] = row.value ?? '';
    }
  });
  return settings as SiteSettings;
}

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase.from('site_settings').select('key, value');
  if (error) {
    console.error('site settings load error', error);
    return { ...DEFAULT_SITE_SETTINGS };
  }
  return normalizeSiteSettings(data as SiteSettingRow[] | null);
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>({ ...DEFAULT_SITE_SETTINGS });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchSiteSettings().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { settings, loading };
}
