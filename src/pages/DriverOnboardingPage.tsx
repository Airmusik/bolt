import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Trash2, CheckCircle2, ArrowRight, AlertCircle, RefreshCw, Users, ShieldCheck } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { DocumentRow, PlatformHistory, TrustReference } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];
const EVIDENCE_TYPES = [
  { type: 'work_history', label: 'Work history proof', help: 'A statement, activity screenshot, or employer letter.' },
  { type: 'reference_letter', label: 'Reference letter', help: 'Optional written endorsement from someone you have worked with.' },
] as const;

export function DriverOnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    full_name: '', bio: '', location: '', age: '', driving_experience_years: '',
    languages: '', preferred_locations: '', platforms_worked: [] as string[],
  });
  const [evidence, setEvidence] = useState<DocumentRow[]>([]);
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [references, setReferences] = useState<TrustReference[]>([]);
  const [referenceForm, setReferenceForm] = useState({ referee_name: '', relationship: '', referee_contact: '', note: '' });

  const loadTrustData = async () => {
    if (!user) return;
    const [{ data: docs }, { data: platformHistory }, { data: refs }] = await Promise.all([
      supabase.from('documents').select('*').eq('user_id', user.id).in('type', EVIDENCE_TYPES.map((item) => item.type)),
      supabase.from('driver_platform_history').select('*').eq('driver_id', user.id),
      supabase.from('trust_references').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setEvidence((docs as DocumentRow[]) || []);
    setHistory((platformHistory as PlatformHistory[]) || []);
    setReferences((refs as TrustReference[]) || []);
  };

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '', bio: profile.bio || '', location: profile.location || '',
        age: profile.age?.toString() || '', driving_experience_years: profile.driving_experience_years?.toString() || '',
        languages: (profile.languages || []).join(', '), preferred_locations: (profile.preferred_locations || []).join(', '),
        platforms_worked: profile.platforms_worked || [],
      });
    }
    loadTrustData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  const uploadEvidence = async (file: File, type: string, label: string) => {
    if (!user) return;
    setUploadingType(type);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${user.id}/trust-${type}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
    if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); setUploadingType(null); return; }
    const { data: publicUrl } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
    const existing = evidence.find((item) => item.type === type);
    const query = existing
      ? supabase.from('documents').update({ file_url: publicUrl.publicUrl, label, verified: false, rejected: false, rejection_reason: null }).eq('id', existing.id)
      : supabase.from('documents').insert({ user_id: user.id, type, file_url: publicUrl.publicUrl, label });
    const { error } = await query;
    setUploadingType(null);
    if (error) { toast('Could not save evidence: ' + error.message, 'error'); return; }
    await loadTrustData();
    toast('Evidence uploaded and sent for admin approval.');
  };

  const addReference = async () => {
    if (!user || !referenceForm.referee_name.trim() || !referenceForm.relationship.trim() || !referenceForm.referee_contact.trim()) {
      toast('Name, relationship, and contact are required.', 'error'); return;
    }
    const { error } = await supabase.from('trust_references').insert({
      user_id: user.id, referee_name: referenceForm.referee_name.trim(), relationship: referenceForm.relationship.trim(),
      referee_contact: referenceForm.referee_contact.trim(), note: referenceForm.note.trim() || null,
    });
    if (error) { toast('Could not add reference: ' + error.message, 'error'); return; }
    setReferenceForm({ referee_name: '', relationship: '', referee_contact: '', note: '' });
    await loadTrustData();
    toast('Reference submitted for admin review.');
  };

  const removeReference = async (reference: TrustReference) => {
    const { error } = await supabase.from('trust_references').delete().eq('id', reference.id);
    if (error) { toast('Could not remove reference.', 'error'); return; }
    setReferences((items) => items.filter((item) => item.id !== reference.id));
  };

  const addHistory = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('driver_platform_history').insert({ driver_id: user.id, platform: 'uber', months_active: 0, trips: 0 }).select().maybeSingle();
    if (error) { toast('Could not add platform history.', 'error'); return; }
    if (data) setHistory((items) => [...items, data as PlatformHistory]);
  };

  const uploadHistoryProof = async (item: PlatformHistory, file: File) => {
    if (!user) return;
    setUploadingType(`history-${item.id}`);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `${user.id}/history-${item.id}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
    if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); setUploadingType(null); return; }
    const { data: publicUrl } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
    const { error } = await supabase.from('driver_platform_history').update({ proof_url: publicUrl.publicUrl, approved: false }).eq('id', item.id);
    setUploadingType(null);
    if (error) { toast('Could not submit proof.', 'error'); return; }
    await loadTrustData();
    toast('Platform proof submitted for admin approval.');
  };

  const updateHistory = async (item: PlatformHistory, field: keyof PlatformHistory, value: unknown) => {
    setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, [field]: value } : entry));
    const { error } = await supabase.from('driver_platform_history').update({ [field]: value }).eq('id', item.id);
    if (error) toast('Could not update platform history.', 'error');
  };

  const removeHistory = async (item: PlatformHistory) => {
    const { error } = await supabase.from('driver_platform_history').delete().eq('id', item.id);
    if (error) { toast('Could not remove platform history.', 'error'); return; }
    setHistory((items) => items.filter((entry) => entry.id !== item.id));
    toast('Platform history removed.');
  };

  const saveProfile = async () => {
    if (!user) return;
    const completeHistory = history.filter((item) => item.months_active > 0 && Boolean(item.proof_url));
    if (completeHistory.length === 0) {
      toast('Add at least one platform history entry with months active and proof before submitting.', 'error');
      return;
    }
    setSaving(true);
    const { error: profileError } = await supabase.from('profiles').update({
      full_name: profileForm.full_name, bio: profileForm.bio, location: profileForm.location,
      age: profileForm.age ? Number(profileForm.age) : null,
      driving_experience_years: profileForm.driving_experience_years ? Number(profileForm.driving_experience_years) : 0,
      languages: profileForm.languages.split(',').map((value) => value.trim()).filter(Boolean),
      preferred_locations: profileForm.preferred_locations.split(',').map((value) => value.trim()).filter(Boolean),
      platforms_worked: profileForm.platforms_worked,
    }).eq('id', user.id);
    if (profileError) { setSaving(false); toast(profileError.message, 'error'); return; }
    const { error } = await supabase.rpc('submit_profile_verification');
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    await refreshProfile();
    toast('Trust Passport submitted for admin review.');
    navigate('/dashboard');
  };

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Build your Trust Passport</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">No identity document is required. Platform history with proof is required so admins can verify real driving activity. Other evidence and references strengthen your Trust Passport.</p>

      <div className="mt-6 space-y-6">
        <Section title="How trust works" desc="People can see the signal and its status, never your reference contact details or private files.">
          <div className="grid gap-3 sm:grid-cols-3">
            <TrustNote icon={<ShieldCheck className="h-5 w-5" />} title="Transparent" text="Account age, activity, reviews, and standing are shown." />
            <TrustNote icon={<Users className="h-5 w-5" />} title="Reference-backed" text="References are reviewed before they count." />
            <TrustNote icon={<CheckCircle2 className="h-5 w-5" />} title="Admin-moderated" text="Every uploaded photo or proof needs approval." />
          </div>
        </Section>

        <Section title="About you">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="input" /></Field>
            <Field label="Age"><input type="number" value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} className="input" /></Field>
            <Field label="Location"><input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} className="input" placeholder="Nairobi" /></Field>
            <Field label="Driving experience (years)"><input type="number" value={profileForm.driving_experience_years} onChange={(e) => setProfileForm({ ...profileForm, driving_experience_years: e.target.value })} className="input" /></Field>
            <Field label="Languages spoken"><input value={profileForm.languages} onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })} className="input" placeholder="English, Swahili" /></Field>
            <Field label="Preferred work locations"><input value={profileForm.preferred_locations} onChange={(e) => setProfileForm({ ...profileForm, preferred_locations: e.target.value })} className="input" placeholder="Nairobi, Mombasa" /></Field>
          </div>
          <Field label="Bio / About me"><textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} className="input" placeholder="Tell owners about your experience and working style…" /></Field>
          <Field label="Platforms you've worked on"><div className="flex flex-wrap gap-2">{PLATFORMS.map((platform) => (
            <button key={platform} type="button" onClick={() => setProfileForm({ ...profileForm, platforms_worked: profileForm.platforms_worked.includes(platform) ? profileForm.platforms_worked.filter((value) => value !== platform) : [...profileForm.platforms_worked, platform] })} className={cn('rounded-full px-4 py-2 text-sm font-medium ring-1 transition', profileForm.platforms_worked.includes(platform) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300 dark:bg-[#141416]')}>{titleCase(platform)}</button>
          ))}</div></Field>
        </Section>

        <Section title="Driver trust evidence" desc="These files are not identity documents. Admins review them privately; other members only see the approved count.">
          <div className="space-y-3">{EVIDENCE_TYPES.map((definition) => {
            const item = evidence.find((entry) => entry.type === definition.type);
            return <div key={definition.type} className={cn('rounded-xl border p-4', item?.rejected ? 'border-danger/30 bg-red-50/30' : 'border-ink-100')}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-ink-900">{definition.label}</p><p className="text-xs text-ink-500">{definition.help}</p>{item && <UploadStatus item={item} />}</div>
                <label className="btn-secondary cursor-pointer text-xs"><input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingType === definition.type} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadEvidence(file, definition.type, definition.label); e.target.value = ''; }} />{uploadingType === definition.type ? <><Upload className="h-3.5 w-3.5" /> Uploading…</> : item ? <><RefreshCw className="h-3.5 w-3.5" /> Replace</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}</label>
              </div>{item?.rejected && item.rejection_reason && <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-danger"><AlertCircle className="mr-1 inline h-3 w-3" /> {item.rejection_reason}</p>}</div>;
          })}</div>
        </Section>

        <Section title="References" desc="Admins may contact a referee. Contact details remain private; public profiles only show the number approved.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Referee name"><input value={referenceForm.referee_name} onChange={(e) => setReferenceForm({ ...referenceForm, referee_name: e.target.value })} className="input" /></Field>
            <Field label="Relationship"><input value={referenceForm.relationship} onChange={(e) => setReferenceForm({ ...referenceForm, relationship: e.target.value })} className="input" placeholder="Former employer, vehicle owner…" /></Field>
            <Field label="Phone or email"><input value={referenceForm.referee_contact} onChange={(e) => setReferenceForm({ ...referenceForm, referee_contact: e.target.value })} className="input" /></Field>
            <Field label="Short note (optional)"><input value={referenceForm.note} onChange={(e) => setReferenceForm({ ...referenceForm, note: e.target.value })} className="input" /></Field>
          </div>
          <button type="button" onClick={addReference} className="btn-secondary"><Plus className="h-4 w-4" /> Add reference</button>
          <div className="mt-4 space-y-2">{references.map((reference) => <div key={reference.id} className="flex items-center justify-between rounded-xl border border-ink-100 p-3"><div><p className="text-sm font-medium text-ink-900">{reference.referee_name} · {reference.relationship}</p><p className={cn('text-xs capitalize', reference.status === 'approved' ? 'text-success' : reference.status === 'rejected' ? 'text-danger' : 'text-amber-600')}>{reference.status}</p>{reference.rejection_reason && <p className="text-xs text-danger">{reference.rejection_reason}</p>}</div><button type="button" onClick={() => removeReference(reference)} className="btn-ghost text-danger"><Trash2 className="h-4 w-4" /></button></div>)}</div>
        </Section>

        <Section title="Platform history (required)" desc="Add at least one platform, enter your months active, and upload proof. Only admin-approved entries appear publicly.">
          <div className="space-y-3">{history.map((item) => <div key={item.id} className="space-y-3 rounded-xl border border-ink-100 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><select value={item.platform} onChange={(e) => updateHistory(item, 'platform', e.target.value)} className="input py-2">{PLATFORMS.map((platform) => <option key={platform} value={platform}>{titleCase(platform)}</option>)}</select><input type="number" value={item.months_active} onChange={(e) => updateHistory(item, 'months_active', Number(e.target.value))} className="input py-2" placeholder="Months active" /><input type="number" value={item.trips} onChange={(e) => updateHistory(item, 'trips', Number(e.target.value))} className="input py-2" placeholder="Trips" /><button type="button" onClick={() => removeHistory(item)} className="btn-ghost text-danger"><Trash2 className="h-4 w-4" /></button></div>
            <div className="flex items-center gap-2"><label className="btn-secondary cursor-pointer text-xs"><input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingType === `history-${item.id}`} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadHistoryProof(item, file); e.target.value = ''; }} /><Upload className="h-3.5 w-3.5" /> {uploadingType === `history-${item.id}` ? 'Uploading…' : item.proof_url ? 'Replace proof' : 'Upload proof'}</label>{item.approved ? <span className="badge badge-success">Approved</span> : item.proof_url ? <span className="badge badge-warning">Pending approval</span> : <span className="text-xs text-ink-400">Not public yet</span>}</div>
          </div>)}<button type="button" onClick={addHistory} className="btn-secondary"><Plus className="h-4 w-4" /> Add platform</button></div>
        </Section>

        <div className="flex justify-end"><button type="button" onClick={saveProfile} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save & submit Trust Passport'} <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    </div>
  );
}

function UploadStatus({ item }: { item: DocumentRow }) {
  if (item.verified) return <p className="mt-1 text-xs text-success"><CheckCircle2 className="mr-1 inline h-3 w-3" /> Approved</p>;
  if (item.rejected) return <p className="mt-1 text-xs text-danger">Rejected</p>;
  return <p className="mt-1 text-xs text-amber-600">Pending admin approval</p>;
}

function TrustNote({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-xl bg-brand-50 p-4 text-brand-800">{icon}<p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-brand-700">{text}</p></div>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return <div className="card p-5"><h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>{desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}<div className="mt-4">{children}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-4"><label className="label">{label}</label>{children}</div>;
}
