import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Trash2, CheckCircle2, ArrowRight, AlertCircle, RefreshCw, ShieldCheck, Pencil, Clock3, History, FileText } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { DocumentRow, PlatformHistory } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { ModeratedImage } from '@/components/ModeratedImage';
import { isPreviewableTrustImage, prepareTrustUpload } from '@/lib/trustUpload';
import { Modal } from '@/components/Modal';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];
const EVIDENCE_TYPES = [
  { type: 'work_history', label: 'Latest platform history proof', help: 'Upload your latest Uber, Bolt, Faras, Little Cab, or other ride-hailing platform activity history.' },
] as const;
const TRUST_FILE_ACCEPT = 'image/*,application/pdf,.pdf,.heic,.heif';

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

type PendingUpload =
  | { kind: 'evidence'; file: File; previewUrl: string | null; uploadKey: string; type: string; label: string }
  | { kind: 'history'; file: File; previewUrl: string | null; uploadKey: string; item: PlatformHistory; label: string };

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
  const [loadingSavedProfile, setLoadingSavedProfile] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const hydrateProfileForm = useCallback((savedProfile: typeof profile) => {
    if (!savedProfile) return;
    setProfileForm({
      full_name: savedProfile.full_name || '',
      bio: savedProfile.bio || '',
      location: savedProfile.location || '',
      age: savedProfile.age?.toString() || '',
      driving_experience_years: savedProfile.driving_experience_years?.toString() || '',
      languages: (savedProfile.languages || []).join(', '),
      preferred_locations: (savedProfile.preferred_locations || []).join(', '),
      platforms_worked: savedProfile.platforms_worked || [],
    });
  }, []);

  const loadTrustData = async () => {
    if (!user) return;
    try {
      const [{ data: docs, error: documentError }, { data: platformHistory, error: historyError }] = await Promise.all([
        supabase.from('documents').select('*').eq('user_id', user.id).in('type', EVIDENCE_TYPES.map((item) => item.type)),
        supabase.from('driver_platform_history').select('*').eq('driver_id', user.id),
      ]);
      if (documentError || historyError) throw documentError || historyError;
      setEvidence((docs as DocumentRow[]) || []);
      setHistory((platformHistory as PlatformHistory[]) || []);
    } catch (error) {
      toast('Could not load platform history. Please refresh and try again.', 'error');
      console.error('platform history load failed', error);
    } finally {
      setTrustLoaded(true);
    }
  };

  useEffect(() => {
    hydrateProfileForm(profile);
    loadTrustData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, hydrateProfileForm]);

  const startEditingPassport = async () => {
    setLoadingSavedProfile(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      const savedProfile = Array.isArray(data) ? data[0] : data;
      hydrateProfileForm(savedProfile || profile);
      await loadTrustData();
      setEditingPassport(true);
    } catch (error) {
      console.error('saved profile load failed', error);
      toast('Could not load your saved details. Please try again.', 'error');
    } finally {
      setLoadingSavedProfile(false);
    }
  };

  const chooseUpload = async (
    file: File,
    target: { kind: 'evidence'; type: string; label: string } | { kind: 'history'; item: PlatformHistory; label: string },
  ) => {
    const uploadKey = target.kind === 'evidence' ? target.type : `history-${target.item.id}`;
    setUploadingType(uploadKey);
    try {
      const preparedFile = await prepareTrustUpload(file);
      setPendingUpload({
        ...target,
        file: preparedFile,
        previewUrl: preparedFile.type.startsWith('image/') ? URL.createObjectURL(preparedFile) : null,
        uploadKey,
      } as PendingUpload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The image could not be prepared.';
      toast('Could not preview this upload: ' + message, 'error');
    } finally {
      setUploadingType(null);
    }
  };

  const clearPendingUpload = () => {
    if (pendingUpload?.previewUrl) URL.revokeObjectURL(pendingUpload.previewUrl);
    setPendingUpload(null);
  };

  useEffect(() => () => {
    if (pendingUpload?.previewUrl) URL.revokeObjectURL(pendingUpload.previewUrl);
  }, [pendingUpload]);

  const uploadEvidence = async (file: File, type: string, label: string) => {
    if (!user) return false;
    setUploadingType(type);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/trust-${type}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
      const existing = evidence.find((item) => item.type === type);
      const query = existing
        ? supabase.from('documents').update({ file_url: publicUrl.publicUrl, label, verified: false, rejected: false, rejection_reason: null }).eq('id', existing.id)
        : supabase.from('documents').insert({ user_id: user.id, type, file_url: publicUrl.publicUrl, label });
      const { error } = await query;
      if (error) throw error;
      await loadTrustData();
      toast('Evidence uploaded and sent for admin approval.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The upload could not be completed.';
      toast('Upload failed: ' + message, 'error');
      console.error('trust evidence upload failed', error);
      return false;
    } finally {
      setUploadingType(null);
    }
  };

  const addHistory = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('driver_platform_history').insert({ driver_id: user.id, platform: 'uber', months_active: 0, trips: 0 }).select().maybeSingle();
      if (error) throw error;
      if (data) setHistory((items) => [...items, data as PlatformHistory]);
    } catch (error) {
      toast('Could not add platform history. Please try again.', 'error');
      console.error('platform history insert failed', error);
    }
  };

  const uploadHistoryProof = async (item: PlatformHistory, file: File) => {
    if (!user) return false;
    setUploadingType(`history-${item.id}`);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/history-${item.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
      const { error } = await supabase.from('driver_platform_history').update({ proof_url: publicUrl.publicUrl, approved: false }).eq('id', item.id);
      if (error) throw error;
      await loadTrustData();
      toast('Platform proof submitted for admin approval.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The upload could not be completed.';
      toast('Could not submit platform proof: ' + message, 'error');
      console.error('platform proof upload failed', error);
      return false;
    } finally {
      setUploadingType(null);
    }
  };

  const submitPendingUpload = async () => {
    if (!pendingUpload) return;
    const succeeded = pendingUpload.kind === 'evidence'
      ? await uploadEvidence(pendingUpload.file, pendingUpload.type, pendingUpload.label)
      : await uploadHistoryProof(pendingUpload.item, pendingUpload.file);
    if (succeeded) clearPendingUpload();
  };

  const updateHistory = async (item: PlatformHistory, field: keyof PlatformHistory, value: unknown) => {
    setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, [field]: value } : entry));
    try {
      const { error } = await supabase.from('driver_platform_history').update({ [field]: value, approved: false }).eq('id', item.id);
      if (error) throw error;
    } catch (error) {
      toast('Could not update platform history. Your page is still open; please try again.', 'error');
      console.error('platform history update failed', error);
    }
  };

  const removeHistory = async (item: PlatformHistory) => {
    try {
      const { error } = await supabase.from('driver_platform_history').delete().eq('id', item.id);
      if (error) throw error;
      setHistory((items) => items.filter((entry) => entry.id !== item.id));
      toast('Platform history removed.');
    } catch (error) {
      toast('Could not remove platform history.', 'error');
      console.error('platform history delete failed', error);
    }
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
    toast('Platform history submitted for admin review.');
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
            <h1 className="mt-5 font-display text-2xl font-bold">Platform history {approved ? 'approved' : 'submitted'}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">{approved ? 'Your reviewed trust information is active on your public driver profile.' : 'Your information is complete and waiting for admin review. You will receive a notification when the review is finished.'}</p>
          </div>
          <div className="space-y-3 p-6 sm:p-8">
            <CompletionRow label="Profile details" detail="Done" approved />
            <CompletionRow label="Platform history" detail="Done" approved={approved} />
            <CompletionRow label="Latest platform evidence" detail="Done" approved={approved} />
            <div className="border-t border-ink-100 pt-5">
              <button type="button" onClick={startEditingPassport} disabled={loadingSavedProfile} className="btn-secondary w-full sm:w-auto"><Pencil className="h-4 w-4" /> {loadingSavedProfile ? 'Loading saved details…' : 'Edit platform history'}</button>
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
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Build your driver trust profile</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">No identity document is required. Your latest ride-hailing platform history with proof is required so admins can confirm real driving activity.</p>

      <div className="mt-6 space-y-6">
        <Section title="How trust works" desc="People can see approved trust signals and their status, never your private proof files.">
          <div className="grid gap-3 sm:grid-cols-3">
            <TrustNote icon={<ShieldCheck className="h-5 w-5" />} title="Transparent" text="Account age, activity, reviews, and standing are shown." />
            <TrustNote icon={<History className="h-5 w-5" />} title="History-backed" text="Recent platform activity helps owners assess genuine driving experience." />
            <TrustNote icon={<CheckCircle2 className="h-5 w-5" />} title="Admin-moderated" text="Driver platform-history proof is reviewed before an approval signal appears." />
          </div>
        </Section>

        <AboutFields profileForm={profileForm} setProfileForm={setProfileForm} />

        <Section title="Driver platform-history evidence" desc="These files are not identity documents. Admins review them privately; other members only see the approved count.">
          <div className="space-y-3">{EVIDENCE_TYPES.map((definition) => {
            const item = evidence.find((entry) => entry.type === definition.type);
            return <div key={definition.type} className={cn('rounded-xl border p-4', item?.rejected ? 'border-danger/30 bg-red-50/30' : 'border-ink-100')}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-ink-900">{definition.label}</p><p className="text-xs text-ink-500">{definition.help}</p>{item && <UploadStatus item={item} />}</div>
                <label className="btn-secondary cursor-pointer text-xs"><input type="file" accept={TRUST_FILE_ACCEPT} className="hidden" disabled={uploadingType === definition.type} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void chooseUpload(file, { kind: 'evidence', type: definition.type, label: definition.label }); }} />{uploadingType === definition.type ? <><Upload className="h-3.5 w-3.5" /> Preparing preview…</> : item ? <><RefreshCw className="h-3.5 w-3.5" /> Replace</> : <><Upload className="h-3.5 w-3.5" /> Choose file</>}</label>
              </div>{item?.file_url && isPreviewableTrustImage(item.file_url) && <UploadPreview url={item.file_url} label={definition.label} />}{item?.rejected && item.rejection_reason && <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-danger"><AlertCircle className="mr-1 inline h-3 w-3" /> {item.rejection_reason}</p>}</div>;
          })}</div>
        </Section>

        <Section title="Platform history (required)" desc="Add at least one platform, enter your months active, and upload proof. Only admin-approved entries appear publicly.">
          <div className="space-y-3">{history.map((item) => <div key={item.id} className="space-y-3 rounded-xl border border-ink-100 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><select value={item.platform} onChange={(e) => updateHistory(item, 'platform', e.target.value)} className="input py-2">{PLATFORMS.map((platform) => <option key={platform} value={platform}>{titleCase(platform)}</option>)}</select><input type="number" min={0} value={item.months_active} onChange={(e) => setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, months_active: Number(e.target.value) } : entry))} onBlur={(e) => updateHistory(item, 'months_active', Number(e.target.value))} className="input py-2" placeholder="Months active" /><input type="number" min={0} value={item.trips} onChange={(e) => setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, trips: Number(e.target.value) } : entry))} onBlur={(e) => updateHistory(item, 'trips', Number(e.target.value))} className="input py-2" placeholder="Trips" /><button type="button" onClick={() => removeHistory(item)} className="btn-ghost text-danger"><Trash2 className="h-4 w-4" /></button></div>
            <div className="flex flex-wrap items-center gap-2"><label className="btn-secondary cursor-pointer text-xs"><input type="file" accept={TRUST_FILE_ACCEPT} className="hidden" disabled={uploadingType === `history-${item.id}`} onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void chooseUpload(file, { kind: 'history', item, label: `${titleCase(item.platform)} platform proof` }); }} /><Upload className="h-3.5 w-3.5" /> {uploadingType === `history-${item.id}` ? 'Preparing preview…' : item.proof_url ? 'Replace proof' : 'Choose proof'}</label>{item.approved ? <span className="badge badge-success">Approved</span> : item.proof_url ? <span className="badge badge-warning">Pending approval</span> : <span className="text-xs text-ink-400">Not public yet</span>}<span className="basis-full text-[11px] text-ink-400">Phone photos, HEIC, JPG, PNG, WebP, or PDF · preview before submission · maximum 8 MB</span></div>
            {item.proof_url && isPreviewableTrustImage(item.proof_url) && <UploadPreview url={item.proof_url} label={`${titleCase(item.platform)} platform proof`} />}
          </div>)}<button type="button" onClick={addHistory} className="btn-secondary"><Plus className="h-4 w-4" /> Add platform</button></div>
        </Section>

        <div className="flex justify-end"><button type="button" onClick={saveProfile} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save & submit platform history'} <ArrowRight className="h-4 w-4" /></button></div>
      </div>

      {pendingUpload && (
        <Modal title="Review before submitting" onClose={clearPendingUpload}>
          <p className="text-sm text-ink-600">Make sure this is the correct {pendingUpload.kind === 'history' ? 'platform-history proof' : 'evidence file'}. Nothing is uploaded until you press submit.</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 p-3">
            {pendingUpload.previewUrl ? (
              <img src={pendingUpload.previewUrl} alt={`Preview of ${pendingUpload.label}`} className="mx-auto max-h-[55vh] w-full rounded-xl object-contain" />
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center text-center"><FileText className="h-12 w-12 text-brand-600" /><p className="mt-3 font-semibold text-ink-900">{pendingUpload.file.name}</p><p className="mt-1 text-xs text-ink-500">PDF selected · open the original if you need to inspect individual pages.</p></div>
            )}
          </div>
          <p className="mt-3 break-all text-xs text-ink-500">{pendingUpload.file.name} · {(pendingUpload.file.size / (1024 * 1024)).toFixed(1)} MB</p>
          <div className="mt-5 flex gap-2"><button type="button" onClick={clearPendingUpload} disabled={uploadingType === pendingUpload.uploadKey} className="btn-secondary flex-1">Choose another</button><button type="button" onClick={submitPendingUpload} disabled={uploadingType === pendingUpload.uploadKey} className="btn-primary flex-1">{uploadingType === pendingUpload.uploadKey ? 'Submitting…' : 'Submit for review'}</button></div>
        </Modal>
      )}
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

function UploadPreview({ url, label }: { url: string; label: string }) {
  return <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-ink-50 p-2">
    <p className="mb-2 text-[11px] font-semibold text-ink-500">Uploaded preview · private to you and admins</p>
    <ModeratedImage src={url} alt={label} className="max-h-52 w-full rounded-lg bg-white object-contain" />
  </div>;
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
