import { Download } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';
import { legalText, TERMS_DOCUMENT, TERMS_VERSION } from '@/lib/legal';

export function TermsContent() {
  const { settings } = useSiteSettings();
  const text = (value: string) => legalText(value, settings);
  const download = () => {
    const content = [`${settings.site_name} — Terms of Service`, `Version ${TERMS_VERSION} · ${TERMS_DOCUMENT.effectiveDate}`, text(TERMS_DOCUMENT.summary), ...TERMS_DOCUMENT.sections.flatMap(section => [section.title, ...section.paragraphs.map(text)])].join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `terms-${TERMS_VERSION}.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-5 text-sm leading-6 text-ink-700">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-500">Version {TERMS_VERSION} · Effective {TERMS_DOCUMENT.effectiveDate}</p><button type="button" onClick={download} className="btn-secondary px-3 py-2 text-xs"><Download className="h-4 w-4" /> Download terms</button></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">{text(TERMS_DOCUMENT.summary)}</p>
    {TERMS_DOCUMENT.sections.map(section => <section key={section.title}><h2 className="font-display text-base font-bold text-ink-900">{section.title}</h2>{section.paragraphs.map((paragraph,index) => <p key={index} className="mt-2 break-words">{text(paragraph)}</p>)}</section>)}
    <p className="border-t border-ink-100 pt-4">Questions or a complaint about support? <a href={`mailto:${settings.admin_contact_email}`} className="break-all font-medium underline">{settings.admin_contact_email}</a> · <a href={`tel:${settings.admin_contact_phone}`} className="whitespace-nowrap underline">{settings.admin_contact_phone}</a></p>
  </div>;
}
