import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { prepareTrustUpload } from '@/lib/trustUpload';
import type { Profile } from '@/lib/types';

export function AdminMemberUpload({ users, onSaved }: { users: Profile[]; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState('');
  const [kind, setKind] = useState('other_trust_evidence');
  const [platform, setPlatform] = useState('uber');
  const [months, setMonths] = useState(1);
  const [trips, setTrips] = useState(0);
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = users.find(user => user.id === member);
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : '';
    setPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !target || busy) return;
    setBusy(true); setError('');
    let path = '';
    let stored = false;
    try {
      const prepared = await prepareTrustUpload(file);
      path = `${member}/admin-${crypto.randomUUID()}.${prepared.name.split('.').pop()}`;
      const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, prepared);
      if (upload.error) throw upload.error;
      const fileUrl = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path).data.publicUrl;
      const result = await supabase.rpc('admin_upload_member_evidence', { p_user: member, p_path: fileUrl, p_kind: kind, p_label: label, p_platform: platform, p_months: months, p_trips: trips });
      if (result.error) throw result.error;
      stored = true;
      await onSaved(); setOpen(false); setFile(null); setLabel('');
    } catch (cause) {
      if (path && !stored) await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
      setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message || 'Upload failed. Please try again.');
    } finally { setBusy(false); }
  };
  return <><button className="btn-primary" onClick={() => { setOpen(true); setError(''); }}>Upload for user</button>{open && <Modal title="Upload for user" onClose={() => { if (!busy) { setOpen(false); setFile(null); } }}><form onSubmit={save} className="space-y-4">
    <p className="text-sm text-ink-500">Upload private evidence on a member’s behalf. Admin uploads are automatically approved and tagged “Uploaded by admin”. Check the proof before submitting. Existing records are kept.</p>
    <label className="label">Member<select className="input" required value={member} disabled={busy} onChange={e => { setMember(e.target.value); setKind('other_trust_evidence'); }}><option value="">Select member</option>{users.filter(user => ['driver','owner'].includes(user.role)).map(user => <option key={user.id} value={user.id}>{user.full_name} — {user.email} ({user.role})</option>)}</select></label>
    <label className="label">Upload type<select className="input" value={kind} disabled={busy} onChange={e => setKind(e.target.value)}><option value="other_trust_evidence">Other trust evidence</option>{target?.role === 'driver' && <option value="platform">Platform history</option>}</select></label>
    {kind === 'platform' ? <><label className="label">Platform<select className="input" value={platform} onChange={e => setPlatform(e.target.value)}>{['uber','bolt','little','faras','other'].map(value => <option key={value}>{value}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="label">Months active<input className="input" required type="number" min={1} step={1} value={months} onChange={e => setMonths(Number(e.target.value))} /></label><label className="label">Trips<input className="input" required type="number" min={0} step={1} value={trips} onChange={e => setTrips(Number(e.target.value))} /></label></div></> : <label className="label">Document label<input className="input" required minLength={3} maxLength={120} value={label} onChange={e => setLabel(e.target.value)} /></label>}
    <label className="label">Image or PDF<input className="input" type="file" required disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { setFile(e.target.files?.[0] || null); setError(''); }} /></label>
    {file && preview && (file.type.startsWith('image/') ? <img src={preview} alt="Selected evidence preview" className="max-h-52 w-full rounded-xl object-contain" /> : <p className="text-sm">Selected PDF: {file.name}</p>)}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button className="btn-primary" disabled={busy || !file || !target}>{busy ? 'Uploading…' : 'Upload & approve'}</button>
  </form></Modal>}</>;
}
