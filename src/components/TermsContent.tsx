import { Download } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';
import { legalText } from '@/lib/legal';
import { FALLBACK_TERMS, type LegalDocument, useLegalDocument } from '@/lib/legalDocuments';

export function TermsContent({ document: supplied }: { document?: LegalDocument | null }) {
  const { settings } = useSiteSettings();
  const current = useLegalDocument('terms', FALLBACK_TERMS);
  const legalDocument = supplied || current.document || FALLBACK_TERMS;
  const text = (value: string) => legalText(value, settings);
  const download = () => {
    const content = [`${settings.site_name} — ${legalDocument.title}`, `Version ${legalDocument.version} · ${legalDocument.effectiveDate}`, text(legalDocument.summary), ...legalDocument.sections.flatMap(section => [section.title, ...section.paragraphs.map(text)])].join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = window.document.createElement('a'); link.href = url; link.download = `terms-${legalDocument.version}.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="space-y-5 text-sm leading-6 text-ink-700">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-500">Version {legalDocument.version} · Effective {legalDocument.effectiveDate}</p><button type="button" onClick={download} className="btn-secondary px-3 py-2 text-xs"><Download className="h-4 w-4" /> Download terms</button></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">{text(legalDocument.summary)}</p>
    {legalDocument.sections.map((section,index) => <section key={`${section.title}-${index}`}><h2 className="font-display text-base font-bold text-ink-900">{section.title}</h2>{section.paragraphs.map((paragraph,paragraphIndex) => <p key={paragraphIndex} className="mt-2 break-words">{text(paragraph)}</p>)}</section>)}
    <p className="border-t border-ink-100 pt-4">Questions or a complaint about support? <a href={`mailto:${settings.admin_contact_email}`} className="break-all font-medium underline">{settings.admin_contact_email}</a> · <a href={`tel:${settings.admin_contact_phone}`} className="whitespace-nowrap underline">{settings.admin_contact_phone}</a></p>
  </div>;
}
