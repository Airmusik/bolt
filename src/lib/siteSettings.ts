import { createContext, createElement, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { AD_DEFAULTS } from './ads';
import { applySiteTheme, DEFAULT_SITE_THEME } from './siteTheme';

export const DEFAULT_SITE_SETTINGS = {
  ...AD_DEFAULTS,
  site_name: '11Drive',
  header_name_animation: 'off',
  header_name_colours: 'split',
  site_tagline: 'The right driver. The right car. A trusted connection.',
  site_logo_url: '',
  maintenance_mode: 'false',
  max_vehicles_per_owner: '3',
  require_email: 'true',
  platform_fee_percent: '0',
  admin_contact_email: 'airmusikinc@gmail.com',
  admin_contact_phone: '+254708593011',
  kyc_enabled: 'false',
  facebook_url: '',
  instagram_url: '',
  linkedin_url: '',
  site_theme: DEFAULT_SITE_THEME,
  footer_description: 'Connecting car owners and ride-hailing drivers across Kenya.',
  footer_company_title: 'Company',
  footer_company_about_label: 'About',
  footer_company_contact_label: 'Contact',
  footer_company_faq_label: 'FAQ',
  footer_company_how_label: 'How it works',
  footer_legal_title: 'Legal',
  footer_legal_terms_label: 'Terms of Service',
  footer_legal_privacy_label: 'Privacy Policy',
  footer_legal_contact_label: 'Contact Us',
  footer_contact_title: 'Get in touch',
  footer_location: 'Nairobi, Kenya',
  footer_copyright_note: 'All rights reserved. 11Drive does not process payments between users.',
  homepage_badge: 'Admin-reviewed driver history',
  homepage_heading_line_1: 'Find the right driver.',
  homepage_heading_line_2: 'Find the right car.',
  homepage_intro: 'Connect with car owners and ride-hailing drivers across Kenya. Compare platform history and reviews, then find your match.',
  homepage_featured_cars: '6',
  homepage_featured_drivers: '4',
  homepage_background_enabled: 'false',
  homepage_background_type: 'none',
  homepage_background_url: '',
  homepage_background_overlay: '78',
  homepage_background_position_x: '50',
  homepage_background_position_y: '50',
  launch_intro_enabled: 'true',
  launch_intro_background_enabled: 'true',
  chatbot_enabled: 'true',
  chatbot_title: '11Drive Assistant',
  chatbot_welcome: 'Hi! Ask me how 11Drive works, about connections, listings, documents, safety, or your account.',
  chatbot_unanswered_logging: 'true',
  maintenance_message: "We're making updates right now. Please check back soon.",
  registration_enabled: 'true',
  google_signin_enabled: 'true',
  new_listings_enabled: 'true',
  chat_images_enabled: 'true',
  community_enabled: 'false',
  connection_email_enabled: 'true',
  message_email_enabled: 'true',
  welcome_email_enabled: 'true',
  expiry_email_enabled: 'true',
  connection_limit_daily: '30',
  upload_limit_mb: '8',
  expiry_warning_days: '30,7,1,0',
  auto_hide_expired_listings: 'false',
  required_phone: 'true',
  required_location: 'true',
  required_languages: 'true',
  support_hours: 'Monday–Friday, 8:00–17:00 EAT',
  support_auto_reply: 'Thanks for contacting 11Drive Support. We have received your message and will respond as soon as possible.',
  support_available: 'true',
  seo_home_title: '11Drive — Find the Right Driver or the Right Car',
  seo_home_description: 'Find ride-hailing drivers and available cars across Kenya on 11Drive.',
  seo_keywords: 'drivers Kenya, cars for drivers, ride-hailing cars, car owners Kenya',
  email_welcome_subject: 'Welcome to 11Drive',
  email_connection_subject: 'You have a new connection request',
  email_message_subject: 'You have a new message on 11Drive',
  email_expiry_subject: 'A document needs your attention',
  analytics_retention_days: '90',
  notification_retention_days: '365',
  chat_retention_days: '730',
  security_risk_alerts: 'true',
  security_rate_limits: 'true',
  security_new_device_alerts: 'true',
  security_admin_mfa_required: 'false',
  security_auto_restrictions: 'false',
  security_upload_validation: 'true',
  security_spam_detection: 'true',
  security_account_history: 'true',
  security_admin_notifications: 'true',
  security_blocklist: 'true',
  security_immutable_audit: 'true',
  security_data_minimization: 'true',
  security_connection_hourly_limit: '20',
  security_message_minute_limit: '30',
  admin_nav_order: 'overview,members,cars,contact,chat,documents,reports,expired,updates,analytics,promotions,advertisements,assistant,content,controls,security,history,settings',
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
    if (loading) return;
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = settings.site_logo_url || '/favicon.svg';
    favicon.type = settings.site_logo_url ? '' : 'image/svg+xml';
  }, [settings.site_logo_url, loading]);

  useEffect(() => {
    if (!loading) applySiteTheme(settings.site_theme, true);
  }, [settings.site_theme, loading]);

  const value = useMemo(() => ({ settings, loading, refreshSettings }), [settings, loading, refreshSettings]);
  return createElement(SiteSettingsContext.Provider, { value }, children);
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext);
  if (!context) throw new Error('useSiteSettings must be used within SiteSettingsProvider');
  return context;
}
