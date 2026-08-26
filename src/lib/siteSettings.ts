import { createContext, createElement, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

export const DEFAULT_SITE_SETTINGS = {
  site_name: 'GariLink',
  site_tagline: 'The right driver. The right car. A trusted connection.',
  site_logo_url: '',
  maintenance_mode: 'false',
  max_vehicles_per_owner: '10',
  require_email: 'true',
  platform_fee_percent: '0',
  admin_contact_email: 'airmusikinc@gmail.com',
  admin_contact_phone: '+254708593011',
  kyc_enabled: 'false',
  facebook_url: '',
  instagram_url: '',
  linkedin_url: '',
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

type SiteSettingsContextValue = {
  settings: SiteSettings;
  loading: boolean;
  refreshSettings: () => Promise<SiteSettings>;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>({ ...DEFAULT_SITE_SETTINGS });
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    const loaded = await fetchSiteSettings();
    setSettings(loaded);
    setLoading(false);
    return loaded;
  }, []);

  useEffect(() => {
    let active = true;
    fetchSiteSettings().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      setLoading(false);
    });
    const channel = supabase
      .channel('site-settings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => { if (active) refreshSettings(); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [refreshSettings]);

  useEffect(() => {
    document.title = `${settings.site_name} — Find the Right Driver or the Right Car`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = `${settings.site_name} — ${settings.site_tagline}`;
  }, [settings.site_name, settings.site_tagline]);

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = settings.site_logo_url || '/favicon.svg';
    favicon.type = settings.site_logo_url ? '' : 'image/svg+xml';
  }, [settings.site_logo_url]);

  const value = useMemo(() => ({ settings, loading, refreshSettings }), [settings, loading, refreshSettings]);
  return createElement(SiteSettingsContext.Provider, { value }, children);
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext);
  if (!context) throw new Error('useSiteSettings must be used within SiteSettingsProvider');
  return context;
}
