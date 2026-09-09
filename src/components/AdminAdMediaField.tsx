import { useEffect, useId, useState } from 'react';
import { Upload } from 'lucide-react';
import { adMediaFileError } from '@/lib/ads';
import { supabase } from '@/lib/supabase';

export function AdminAdMediaField({ label, kind, value, onChange, onBusy }: {
  label: string; kind: 'image' | 'video'; value: string; onChange: (url: string) => void; onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true); onBusy(true); setMessage('');
    try {
      const problem = adMediaFileError(file, kind);
      if (problem) throw new Error(problem);
      const extension = file.name.split('.').pop()!.toLowerCase();
      const path = `advertisements/${crypto.randomUUID()}.${extension}`;
      const contentType = file.type || ({ mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension];
      const { error } = await supabase.storage.from('site-assets').upload(path, file, { cacheControl: '86400', upsert: false, contentType });
      if (error) throw error;
      const { data } = supabase.storage.from('site-assets').getPublicUrl(path);
      onChange(data.publicUrl); setFile(null);
      setMessage('Uploaded. Save advertisements to publish this file.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not upload this file. Please try again.'); }
    finally { setBusy(false); onBusy(false); }
  };
  return <div className="space-y-2 rounded-xl border border-ink-100 p-3">
    <label htmlFor={`${id}-url`} className="label">{label}</label>
    <input id={`${id}-url`} type="url" className="input" disabled={busy} value={value} placeholder={kind === 'video' ? 'https://example.com/advert.mp4' : 'https://example.com/image.jpg'} onChange={event => onChange(event.target.value)} aria-describedby={`${id}-help`} />
    <p id={`${id}-help`} className="text-xs leading-5 text-ink-500">{kind === 'video' ? 'Upload MP4 or WebM up to 8 MB, or paste a direct file URL—not a YouTube/watch-page link. Short, compressed landscape videos work best.' : 'Optional. Upload JPG, PNG or WebP up to 3 MB, or paste a direct image URL.'} Uploaded ad media is public; never use private member documents.</p>
    <label className={`btn-secondary inline-flex cursor-pointer text-xs ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-4 w-4" />Choose {kind}
      <input type="file" className="sr-only" accept={kind === 'video' ? 'video/mp4,video/webm,.mp4,.webm' : 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'} disabled={busy} onChange={event => {
        const selected = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (!selected) return;
        const problem = adMediaFileError(selected, kind);
        setMessage(problem || ''); setFile(problem ? null : selected);
      }} />
    </label>
    {file && <div className="space-y-2 rounded-lg bg-ink-50 p-3">
      <p className="break-all text-xs font-medium">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
      {preview && (kind === 'video' ? <video src={preview} muted playsInline controls preload="metadata" className="max-h-44 w-full rounded-lg bg-black" /> : <img src={preview} alt="Selected advertisement preview" className="max-h-44 max-w-full rounded-lg object-contain" />)}
      <p className="text-xs text-ink-500">Review the file before uploading.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary text-xs" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload selected file'}</button><button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => setFile(null)}>Cancel selection</button></div>
    </div>}
    {message && <p role="status" className="text-xs leading-5 text-ink-600">{message}</p>}
  </div>;
}
