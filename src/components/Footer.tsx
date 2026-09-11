import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, ChevronDown } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';
import { SiteWordmark } from './SiteWordmark';
import { AdSlot } from './AdSlot';
import { FooterVideoAd } from './FooterVideoAd';

export function Footer() {
  const [expanded, setExpanded] = useState(false);
  const { settings } = useSiteSettings();

  return (
    <footer className="relative z-10 border-t border-ink-100 bg-white/95 backdrop-blur-sm dark:bg-[#0b0b0d]/95">
      <div className="container-content py-6">
        <AdSlot placement="footer" />
        <FooterVideoAd />
        {/* Mobile: collapsed behind a button */}
        <div className="flex w-full items-center justify-between md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <SiteWordmark name={settings.site_name} colours={settings.header_name_colours} className="h-auto w-[138px]" />
          </Link>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded-full p-2 text-ink-500 hover:bg-ink-100" aria-expanded={expanded} aria-label={expanded ? 'Collapse footer links' : 'Expand footer links'}><ChevronDown className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
        </div>

        {/* Desktop: always visible grid; Mobile: only when expanded */}
        <div className={`mt-0 md:mt-0 ${expanded ? 'mt-6 grid' : 'hidden'} gap-10 md:grid md:grid-cols-4`}>
          <div>
            <Link to="/" className="hidden items-center gap-2 md:flex">
              <SiteWordmark name={settings.site_name} colours={settings.header_name_colours} className="h-auto w-[138px]" />
            </Link>
            <p className="mt-3 text-sm font-medium leading-6 text-ink-600">{settings.site_tagline}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-400">{settings.footer_description}</p>
            {(settings.facebook_url || settings.instagram_url || settings.linkedin_url) && <div className="mt-4 flex gap-3">
              {settings.facebook_url && <SocialLink href={settings.facebook_url} label="Facebook" icon={<Facebook className="h-4 w-4" />} />}
              {settings.instagram_url && <SocialLink href={settings.instagram_url} label="Instagram" icon={<Instagram className="h-4 w-4" />} />}
              {settings.linkedin_url && <SocialLink href={settings.linkedin_url} label="LinkedIn" icon={<Linkedin className="h-4 w-4" />} />}
            </div>}
          </div>

          <FooterCol title={settings.footer_company_title} links={[
            { to: '/about', label: settings.footer_company_about_label },
            { to: '/contact', label: settings.footer_company_contact_label },
            { to: '/help', label: settings.footer_company_faq_label },
            { to: '/how-it-works', label: settings.footer_company_how_label },
          ]} />

          <FooterCol title={settings.footer_legal_title} links={[
            { to: '/terms', label: settings.footer_legal_terms_label },
            { to: '/privacy', label: settings.footer_legal_privacy_label },
            { to: '/contact', label: settings.footer_legal_contact_label },
          ]} />

          <div>
            <h4 className="text-sm font-semibold text-ink-900">{settings.footer_contact_title}</h4>
            <ul className="mt-3 space-y-2 text-sm font-medium text-ink-700">
              <li><a href={`mailto:${settings.admin_contact_email}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-ink-50/90 px-2.5 py-2 hover:text-brand-700"><Mail className="h-4 w-4 shrink-0 text-brand-600" /><span className="min-w-0 break-all">{settings.admin_contact_email}</span></a></li>
              <li><a href={`tel:${settings.admin_contact_phone.replace(/\s/g, '')}`} className="flex items-center gap-2 rounded-lg bg-ink-50/90 px-2.5 py-2 hover:text-brand-700"><Phone className="h-4 w-4 shrink-0 text-brand-600" /><span>{settings.admin_contact_phone}</span></a></li>
              <li className="flex items-center gap-2 rounded-lg bg-ink-50/90 px-2.5 py-2"><MapPin className="h-4 w-4 shrink-0 text-brand-600" /><span>{settings.footer_location}</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-6 border-t border-ink-100 pt-4 text-center text-xs text-ink-400 md:mt-10 md:pt-6">
          © {new Date().getFullYear()} {settings.site_name}. {settings.footer_copyright_note}
        </div>
      </div>
    </footer>
  );
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="rounded-full bg-ink-100 p-2 text-ink-600 transition hover:-translate-y-0.5 hover:bg-ink-200 hover:text-ink-900">{icon}</a>;
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })} className="text-sm text-ink-500 hover:text-brand-700">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
