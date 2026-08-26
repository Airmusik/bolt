import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Trash2, CheckCircle2, ArrowRight, AlertCircle, RefreshCw, ShieldCheck, Pencil, Clock3, History } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { DocumentRow, PlatformHistory } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];
const EVIDENCE_TYPES = [
  { type: 'work_history', label: 'Latest platform history proof', help: 'Upload your latest Uber, Bolt, Faras, Little Cab, or other ride-hailing platform activity history.' },
] as const;

interface DriverAboutForm {
  full_name: string;
  bio: string;
  location: string;
  age: string;
  driving_experience_years: string;
  languages: string;
  preferred_locations: string;
  platforms_worked: string[];
}

export function DriverOnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<DriverAboutForm>({
    full_name: '', bio: '', location: '', age: '', driving_experience_years: '',
    languages: '', preferred_locations: '', platforms_worked: [] as string[],
  });
  const [evidence, setEvidence] = useState<DocumentRow[]>([]);
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [trustLoaded, setTrustLoaded] = useState(false);
  const [editingPassport, setEditingPassport] = useState(false);

  const loadTrustData = async () => {
    if (!user) return;
    const [{ data: docs }, { data: platformHistory }] = await Promise.all([
      supabase.from('documents').select('*').eq('user_id', user.id).in('type', EVIDENCE_TYPES.map((item) => item.type)),
      supabase.from('driver_platform_history').select('*').eq('driver_id', user.id),
    ]);
    setEvidence((docs as DocumentRow[]) || []);
    setHistory((platformHistory as PlatformHistory[]) || []);
    setTrustLoaded(true);
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
    const experienceYears = Number(profileForm.driving_experience_years);
    if (!experienceYears || experienceYears < 1 || experienceYears > 60) {
      toast('Driving experience must be between 1 and 60 years.', 'error');
      return;
    }
    const completeHistory = history.filter((item) => item.months_active > 0 && Boolean(item.proof_url));
    if (completeHistory.length === 0) {
      toast('Add at least one platform history entry with months active and proof before submitting.', 'error');
      return;
    }
    setSaving(true);
    const { error: profileError } = await supabase.from('profiles').update({
      full_name: profileForm.full_name, bio: profileForm.bio, location: profileForm.location,
      age: profileForm.age ? Number(profileForm.age) : null,
      driving_experience_years: experienceYears,
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

  const saveAbout = async () => {
    if (!user) return;
    if (profileForm.full_name.trim().length < 2 || !profileForm.location.trim() || profileForm.bio.trim().length < 20) {
      toast('Add your full name, location, and an About Me description of at least 20 characters.', 'error'); return;
    }
    const age = Number(profileForm.age);
    if (!age || age < 18 || age > 85) { toast('Enter a valid age between 18 and 85.', 'error'); return; }
    const languages = profileForm.languages.split(',').map((value) => value.trim()).filter(Boolean);
    if (languages.length === 0) { toast('Add at least one language you speak.', 'error'); return; }
    const experienceYears = Number(profileForm.driving_experience_years);
    if (!experienceYears || experienceYears < 1 || experienceYears > 60) { toast('Driving experience must be between 1 and 60 years.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: profileForm.full_name.trim(), bio: profileForm.bio.trim(), location: profileForm.location.trim(), age,
      driving_experience_years: experienceYears,
      languages, preferred_locations: profileForm.preferred_locations.split(',').map((value) => value.trim()).filter(Boolean),
      platforms_worked: profileForm.platforms_worked, onboarding_completed: true,
    }).eq('id', user.id);
    setSaving(false);
    if (error) { toast('Could not publish your profile: ' + error.message, 'error'); return; }
    await refreshProfile();
    toast('About You completed. Your profile is now public, and you can continue building trust evidence.');
  };

  if (profile && !profile.onboarding_completed) {
    return (
      <div className="container-content max-w-3xl py-8">
        <BackButton to="/" />
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h1 className="font-display text-xl font-bold">Complete About You first</h1><p className="mt-1 text-sm">Your driver profile is not public yet. Complete the information below so owners can understand your experience before connecting with you.</p></div></div>
        </div>
        <div className="mt-6"><AboutFields profileForm={profileForm} setProfileForm={setProfileForm} /></div>
        <button type="button" onClick={saveAbout} disabled={saving} className="btn-primary mt-5 w-full sm:w-auto">{saving ? 'Publishing…' : 'Save About You & continue'} <ArrowRight className="h-4 w-4" /></button>
      </div>
    );
  }

  const passportSubmitted = trustLoaded && !editingPassport && (profile?.verification_status === 'pending' || profile?.verification_status === 'approved');

  if (passportSubmitted) {
    const approved = profile?.verification_status === 'approved';
    return (
      <div className="container-content max-w-3xl py-8">
        <BackButton to="/dashboard" />
        <div className="card mt-4 overflow-hidden">
          <div className={cn('p-6 text-white sm:p-8', approved ? 'bg-gradient-to-br from-emerald-600 to-brand-700' : 'bg-gradient-to-br from-amber-500 to-orange-600')}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
              {approved ? <CheckCircle2 className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}
            </div>
            <h1 className="mt-5 font-display text-2xl font-bold">Trust Passport {approved ? 'approved' : 'submitted'}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">{approved ? 'Your reviewed trust information is active on your public driver profile.' : 'Your information is complete and waiting for admin review. You will receive a notification when the review is finished.'}</p>
          </div>
          <div className="space-y-3 p-6 sm:p-8">
            <CompletionRow label="Profile details" detail="Done" approved />
            <CompletionRow label="Platform history" detail="Done" approved={approved} />
            <CompletionRow label="Latest platform evidence" detail="Done" approved={approved} />
            <div className="border-t border-ink-100 pt-5">
              <button type="button" onClick={() => setEditingPassport(true)} className="btn-secondary w-full sm:w-auto"><Pencil className="h-4 w-4" /> Edit Trust Passport</button>
              <p className="mt-2 text-xs text-ink-500">Editing reviewed information may send the updated sections back to admin for approval.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Build your Trust Passport</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">No identity document is required. Your latest ride-hailing platform history with proof is required so admins can verify real driving activity.</p>

      <div className="mt-6 space-y-6">
        <Section title="How trust works" desc="People can see approved trust signals and their status, never your private proof files.">
          <div className="grid gap-3 sm:grid-cols-3">
            <TrustNote icon={<ShieldCheck className="h-5 w-5" />} title="Transparent" text="Account age, activity, reviews, and standing are shown." />
            <TrustNote icon={<History className="h-5 w-5" />} title="History-backed" text="Recent platform activity helps owners assess genuine driving experience." />
            <TrustNote icon={<CheckCircle2 className="h-5 w-5" />} title="Admin-moderated" text="Every uploaded photo or proof needs approval." />
          </div>
        </Section>

        <AboutFields profileForm={profileForm} setProfileForm={setProfileForm} />

        <Section title="Driver trust evidence" desc="These files are not identity documents. Admins review them privately; other members only see the approved count.">
          <div className="space-y-3">{EVIDENCE_TYPES.map((definition) => {
            const item = evidence.find((entry) => entry.type === definition.type);
            return <div key={definition.type} className={cn('rounded-xl border p-4', item?.rejected ? 'border-danger/30 bg-red-50/30' : 'border-ink-100')}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-ink-900">{definition.label}</p><p className="text-xs text-ink-500">{definition.help}</p>{item && <UploadStatus item={item} />}</div>
                <label className="btn-secondary cursor-pointer text-xs"><input type="file" accept="image/*,.pdf" className="hidden" disabled={uploadingType === definition.type} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadEvidence(file, definition.type, definition.label); e.target.value = ''; }} />{uploadingType === definition.type ? <><Upload className="h-3.5 w-3.5" /> Uploading…</> : item ? <><RefreshCw className="h-3.5 w-3.5" /> Replace</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}</label>
              </div>{item?.rejected && item.rejection_reason && <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-danger"><AlertCircle className="mr-1 inline h-3 w-3" /> {item.rejection_reason}</p>}</div>;
          })}</div>
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

function AboutFields({ profileForm, setProfileForm }: { profileForm: DriverAboutForm; setProfileForm: (value: DriverAboutForm) => void }) {
  return <Section title="About you" desc="This information is required before your driver profile can appear publicly.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="input" /></Field>
      <Field label="Age"><input type="number" min={18} max={85} value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} className="input" /></Field>
      <Field label="Location"><PlaceAutocomplete value={profileForm.location} onChange={(location) => setProfileForm({ ...profileForm, location })} placeholder="e.g. Ongata Rongai" required /></Field>
      <Field label="Driving experience (years)"><input type="number" min={1} max={60} value={profileForm.driving_experience_years} onChange={(e) => setProfileForm({ ...profileForm, driving_experience_years: e.target.value })} className="input" /></Field>
      <Field label="Languages spoken"><input value={profileForm.languages} onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })} className="input" placeholder="English, Swahili" /></Field>
      <Field label="Preferred work locations"><input value={profileForm.preferred_locations} onChange={(e) => setProfileForm({ ...profileForm, preferred_locations: e.target.value })} className="input" placeholder="Nairobi, Mombasa" /></Field>
    </div>
    <Field label="Bio / About me"><textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} className="input" placeholder="Tell owners about your experience and working style…" /></Field>
    <Field label="Platforms you've worked on"><div className="flex flex-wrap gap-2">{PLATFORMS.map((platform) => (
      <button key={platform} type="button" onClick={() => setProfileForm({ ...profileForm, platforms_worked: profileForm.platforms_worked.includes(platform) ? profileForm.platforms_worked.filter((value) => value !== platform) : [...profileForm.platforms_worked, platform] })} className={cn('rounded-full px-4 py-2 text-sm font-medium ring-1 transition', profileForm.platforms_worked.includes(platform) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300 dark:bg-[#141416]')}>{titleCase(platform)}</button>
    ))}</div></Field>
  </Section>;
}

function UploadStatus({ item }: { item: DocumentRow }) {
  if (item.verified) return <p className="mt-1 text-xs text-success"><CheckCircle2 className="mr-1 inline h-3 w-3" /> Approved</p>;
  if (item.rejected) return <p className="mt-1 text-xs text-danger">Rejected</p>;
  return <p className="mt-1 text-xs text-amber-600">Pending admin approval</p>;
}

function CompletionRow({ label, detail, approved }: { label: string; detail: string; approved: boolean }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-ink-50 px-4 py-3 ring-1 ring-ink-100"><div className="flex items-center gap-3"><span className={cn('flex h-8 w-8 items-center justify-center rounded-full', approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}><CheckCircle2 className="h-4 w-4" /></span><span className="text-sm font-semibold text-ink-900">{label}</span></div><span className={cn('text-xs font-semibold', approved ? 'text-success' : 'text-amber-600')}>{detail}</span></div>;
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
