import { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/siteSettings';
import { legalText } from '@/lib/legal';
import type { LegalDocument } from '@/lib/legalDocuments';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './useToast';

type Slug = 'terms' | 'privacy';
type DraftSection = { title: string; body: string };

export function AdminLegalContent() {
  const { settings } = useSiteSettings();
  const { toast } = useToast();
  const [slug, setSlug] = useState<Slug>('terms');
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_current_legal_document', { p_slug: slug });
    if (error || !data) { toast(`Could not load ${slug}: ${error?.message || 'No published document'}`, 'error'); setLoading(false); return; }
    const current = data as LegalDocument;
    setDocument(current); setTitle(current.title); setSummary(current.summary);
    setSections(current.sections.map(section => ({ title: section.title, body: section.paragraphs.join('\n\n') })));
    setLoading(false);
  }, [slug, toast]);
  useEffect(() => { void load(); }, [load]);

  const valid = title.trim().length >= 3 && summary.trim().length >= 10 && sections.length > 0 && sections.every(section => section.title.trim().length >= 2 && section.body.trim().length >= 5);
  const publish = async () => {
    setPublishing(true);
    const { data, error } = await supabase.rpc('admin_publish_legal_document', { p_slug: slug, p_title: title.trim(), p_summary: summary.trim(), p_sections: sections.map(section => ({ title: section.title.trim(), body: section.body.trim() })) });
    setPublishing(false);
    if (error) { toast(`Could not publish: ${error.message}`, 'error'); return; }
    toast(`${slug === 'terms' ? 'Terms of Service' : 'Privacy Policy'} published as version ${data}.`);
    await load();
  };

  return <div className="space-y-4">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-ink-900">Page content</h2><p className="mt-1 text-sm text-ink-500">Edit and publish the complete Terms and Privacy pages without changing code.</p></div>{document && <span className="badge-neutral">Current version {document.version}</span>}</div>
      <div className="mt-4 flex gap-2">{(['terms','privacy'] as Slug[]).map(item => <button key={item} onClick={() => setSlug(item)} className={item === slug ? 'btn-primary px-4 py-2 text-xs' : 'btn-secondary px-4 py-2 text-xs'}>{item === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</button>)}</div>
      <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs leading-5 text-ink-700">Publishing creates a new dated version and preserves previous versions. Review legal changes carefully. New registrations accept the latest Terms version; existing acceptance records are not rewritten.</div>
    </div>
    {loading ? <div className="card h-64 animate-pulse" /> : <div className="card p-5">
      <div className="grid gap-4"><div><label className="label" htmlFor="legal-title">Page title</label><input id="legal-title" className="input" maxLength={80} value={title} onChange={event => setTitle(event.target.value)} /></div><div><label className="label" htmlFor="legal-summary">Opening statement</label><textarea id="legal-summary" className="input min-h-24" maxLength={1000} value={summary} onChange={event => setSummary(event.target.value)} /></div>
        {sections.map((section,index) => <section key={index} className="rounded-xl border border-ink-200 p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-ink-500">Section {index + 1}</p>{sections.length > 1 && <button aria-label={`Remove section ${index + 1}`} className="btn-ghost px-2 py-1 text-danger" onClick={() => setSections(current => current.filter((_,itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></button>}</div><label className="label mt-2" htmlFor={`legal-section-title-${index}`}>Heading</label><input id={`legal-section-title-${index}`} className="input" maxLength={120} value={section.title} onChange={event => setSections(current => current.map((item,itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /><label className="label mt-3" htmlFor={`legal-section-body-${index}`}>Content</label><textarea id={`legal-section-body-${index}`} className="input min-h-40" maxLength={8000} value={section.body} onChange={event => setSections(current => current.map((item,itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} /><p className="mt-1 text-xs text-ink-400">Leave a blank line between paragraphs.</p></section>)}
        <button className="btn-secondary justify-self-start text-sm" disabled={sections.length >= 20} onClick={() => setSections(current => [...current, { title: '', body: '' }])}><Plus className="h-4 w-4" /> Add section</button>
        <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setPreview(value => !value)}><Eye className="h-4 w-4" /> {preview ? 'Hide preview' : 'Preview page'}</button><button className="btn-primary" disabled={!valid || publishing} onClick={() => setConfirming(true)}><Save className="h-4 w-4" /> Publish new version</button></div>
      </div>
      {preview && <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-wider text-accent-600">Preview</p><h1 className="mt-2 text-3xl font-bold text-ink-900">{title}</h1><p className="mt-5 text-sm leading-6 text-ink-700">{legalText(summary, settings)}</p>{sections.map((section,index) => <section key={index} className="mt-5"><h2 className="text-lg font-bold text-ink-900">{section.title}</h2>{section.body.split(/\n\s*\n/).map((paragraph,paragraphIndex) => <p key={paragraphIndex} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{legalText(paragraph, settings)}</p>)}</section>)}</div>}
    </div>}
    {confirming && <ConfirmDialog title={`Publish new ${slug === 'terms' ? 'Terms' : 'Privacy'} version?`} message="This will immediately replace the public page with this version. Previous versions and acceptance records will remain stored." confirmLabel={publishing ? 'Publishing…' : 'Publish version'} onConfirm={publish} onClose={() => { if (!publishing) setConfirming(false); }} />}
  </div>;
}
