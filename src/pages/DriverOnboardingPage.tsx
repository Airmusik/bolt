import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, ArrowRight, AlertCircle, ShieldCheck, Pencil, Clock3, History, FileText, Loader2, Upload } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { PlatformHistory } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { ModeratedImage } from '@/components/ModeratedImage';
import { isPreviewableTrustImage, isTrustImageFile, prepareTrustUpload } from '@/lib/trustUpload';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];
const TRUST_FILE_ACCEPT = 'image/*,.pdf';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;

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

type PendingUpload = {
  kind: 'history';
  file: File;
  previewUrl: string | null;
  previewReady: boolean;
  previewFailed: boolean;
  uploadKey: string;
  item: PlatformHistory;
  label: string;
};

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
      const { data: platformHistory, error: historyError } = await supabase.from('driver_platform_history').select('*').eq('driver_id', user.id);
      if (historyError) throw historyError;
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

  useEffect(() => {
    if (user && sessionStorage.getItem(`driver-proof-edit-${user.id}`) === 'true') {
      setEditingPassport(true);
    }
  }, [user]);

  const startEditingPassport = async () => {
    setLoadingSavedProfile(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) throw error;
      const savedProfile = Array.isArray(data) ? data[0] : data;
      hydrateProfileForm(savedProfile || profile);
      await loadTrustData();
      if (user) sessionStorage.setItem(`driver-proof-edit-${user.id}`, 'true');
      setEditingPassport(true);
    } catch (error) {
      console.error('saved profile load failed', error);
      toast('Could not load your saved details. Please try again.', 'error');
    } finally {
      setLoadingSavedProfile(false);
    }
  };

  const chooseUpload = (
    file: File,
    target: { kind: 'history'; item: PlatformHistory; label: string },
  ) => {
    const uploadKey = `history-${target.item.id}`;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = isTrustImageFile(file);
    if (!isImage && !isPdf) {
      toast('Choose an image or PDF file.', 'error');
      return;
    }
    if (isPdf && file.size > MAX_PDF_BYTES) {
      toast('The PDF must be smaller than 8 MB.', 'error');
      return;
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      toast('The image must be smaller than 24 MB.', 'error');
      return;
    }
    setPendingUpload({
      ...target,
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
      previewReady: !isImage,
      previewFailed: false,
      uploadKey,
    });
  };

  const clearPendingUpload = () => {
    setPendingUpload(null);
  };

  useEffect(() => {
    const previewUrl = pendingUpload?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pendingUpload?.previewUrl]);

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
      const { error: uploadError } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
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
    setUploadingType(pendingUpload.uploadKey);
    try {
      const preparedFile = await prepareTrustUpload(pendingUpload.file);
      const succeeded = await uploadHistoryProof(pendingUpload.item, preparedFile);
      if (succeeded) clearPendingUpload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be prepared.';
      toast('Could not prepare this upload: ' + message, 'error');
      setUploadingType(null);
    }
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
    sessionStorage.removeItem(`driver-proof-edit-${user.id}`);
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
            <CompletionRow label="Platform proof" detail="Done" approved={approved} />
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
      <p className="mt-2 text-xs text-ink-400"><span className="font-bold text-danger">*</span> Required information</p>

      <div className="mt-6 space-y-6">
        <Section title="How trust works" desc="People can see approved trust signals and their status, never your private proof files.">
          <div className="grid gap-3 sm:grid-cols-3">
            <TrustNote icon={<ShieldCheck className="h-5 w-5" />} title="Transparent" text="Account age, activity, reviews, and standing are shown." />
            <TrustNote icon={<History className="h-5 w-5" />} title="History-backed" text="Recent platform activity helps owners assess genuine driving experience." />
            <TrustNote icon={<CheckCircle2 className="h-5 w-5" />} title="Admin-moderated" text="Driver platform-history proof is reviewed before an approval signal appears." />
          </div>
        </Section>

        <AboutFields profileForm={profileForm} setProfileForm={setProfileForm} />

        <Section title="Platform history and proof (required)" desc="Add at least one platform, enter your recent activity, and upload its latest Uber, Bolt, Faras, Little Cab, or other platform history. Admins see the private proof; other members only see approved activity.">
          <div className="space-y-3">{history.map((item) => <div key={item.id} className="space-y-3 rounded-xl border border-ink-100 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Field label="Platform" required hint="Select the app shown in your proof."><select value={item.platform} onChange={(e) => updateHistory(item, 'platform', e.target.value)} className="input py-2">{PLATFORMS.map((platform) => <option key={platform} value={platform}>{titleCase(platform)}</option>)}</select></Field>
              <Field label="Months active" required hint="Enter at least 1 month."><input type="number" min={1} value={item.months_active} onChange={(e) => setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, months_active: Number(e.target.value) } : entry))} onBlur={(e) => updateHistory(item, 'months_active', Number(e.target.value))} className="input py-2" placeholder="e.g. 12" /></Field>
              <Field label="Recent trips" hint="Optional activity total."><input type="number" min={0} value={item.trips} onChange={(e) => setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, trips: Number(e.target.value) } : entry))} onBlur={(e) => updateHistory(item, 'trips', Number(e.target.value))} className="input py-2" placeholder="e.g. 250" /></Field>
              <button type="button" onClick={() => removeHistory(item)} aria-label={`Remove ${titleCase(item.platform)} history`} className="btn-ghost mb-4 self-center text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-full sm:max-w-sm">
                <p className="mb-1 block text-xs font-semibold text-ink-700">{item.proof_url ? 'Choose replacement proof' : 'Choose proof'} <span className="text-danger">*</span></p>
                <label className="btn-secondary flex min-h-11 w-full cursor-pointer justify-center text-sm">
                  <input
                    type="file"
                    accept={TRUST_FILE_ACCEPT}
                    aria-label={`Choose ${titleCase(item.platform)} platform proof`}
                    className="hidden"
                    disabled={uploadingType === `history-${item.id}`}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.item(0);
                      if (file) chooseUpload(file, { kind: 'history', item, label: `${titleCase(item.platform)} platform proof` });
                      event.currentTarget.value = '';
                    }}
                  />
                  <Upload className="h-4 w-4" /> {pendingUpload?.item.id === item.id ? 'Choose a different file' : item.proof_url ? 'Choose replacement proof' : 'Choose image or PDF'}
                </label>
              </div>
              {item.approved ? <span className="badge badge-success">Approved</span> : item.proof_url ? <span className="badge badge-warning">Pending approval</span> : <span className="text-xs text-ink-400">Not public yet</span>}
              <span className="basis-full text-[11px] text-ink-400">Upload your latest platform activity screen. Phone photos, HEIC, JPG, PNG, WebP, or PDF · preview before submission · maximum 8 MB.</span>
            </div>
            {pendingUpload?.item.id === item.id && (
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3 sm:p-4">
                <p className="text-sm font-semibold text-ink-900">Review before submitting</p>
                <p className="mt-1 text-xs text-ink-600">The file is selected but has not been uploaded. Confirm that it is the correct platform-history proof.</p>
                <div className="mt-3 overflow-hidden rounded-xl border border-ink-200 bg-white p-2">
                  {pendingUpload.previewUrl ? (
                    <img
                      src={pendingUpload.previewUrl}
                      alt={`Preview of ${pendingUpload.label}`}
                      className="mx-auto max-h-[50vh] w-full rounded-lg object-contain"
                      onLoad={() => setPendingUpload((current) => current?.item.id === item.id ? { ...current, previewReady: true } : current)}
                      onError={() => setPendingUpload((current) => current?.item.id === item.id ? { ...current, previewReady: false, previewFailed: true } : current)}
                    />
                  ) : (
                    <div className="flex min-h-36 flex-col items-center justify-center text-center"><FileText className="h-10 w-10 text-brand-600" /><p className="mt-2 break-all text-sm font-semibold text-ink-900">{pendingUpload.file.name}</p><p className="mt-1 text-xs text-ink-500">PDF · {pendingUpload.file.type || 'application/pdf'}</p></div>
                  )}
                </div>
                {pendingUpload.previewFailed && <p className="mt-2 text-xs font-semibold text-danger">This browser cannot preview that image. Choose a different image or use a screenshot.</p>}
                <p className="mt-2 break-all text-xs text-ink-500">{pendingUpload.file.name} · {(pendingUpload.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={clearPendingUpload} disabled={uploadingType === pendingUpload.uploadKey} className="btn-secondary flex-1">Cancel</button>
                  <button type="button" onClick={submitPendingUpload} disabled={uploadingType === pendingUpload.uploadKey || !pendingUpload.previewReady} className="btn-primary flex-1">{uploadingType === pendingUpload.uploadKey ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Upload proof'}</button>
                </div>
              </div>
            )}
            {item.proof_url && isPreviewableTrustImage(item.proof_url) && <UploadPreview url={item.proof_url} label={`${titleCase(item.platform)} platform proof`} />}
          </div>)}<button type="button" onClick={addHistory} className="btn-secondary"><Plus className="h-4 w-4" /> Add platform</button></div>
        </Section>

        <div className="flex justify-end"><button type="button" onClick={saveProfile} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save & submit platform history'} <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    </div>
  );
}

function AboutFields({ profileForm, setProfileForm }: { profileForm: DriverAboutForm; setProfileForm: (value: DriverAboutForm) => void }) {
  return <Section title="About you" desc="This information is required before your driver profile can appear publicly.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" required hint="Use the name owners will recognise on your public profile."><input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="input" /></Field>
      <Field label="Age" required hint="Drivers must be between 18 and 85 years old."><input type="number" min={18} max={85} value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} className="input" /></Field>
      <Field label="Location" required hint="Enter the Kenyan town or neighbourhood where you are based."><PlaceAutocomplete value={profileForm.location} onChange={(location) => setProfileForm({ ...profileForm, location })} placeholder="e.g. Ongata Rongai" required /></Field>
      <Field label="Driving experience (years)" required hint="Enter completed years of driving experience; minimum 1."><input type="number" min={1} max={60} value={profileForm.driving_experience_years} onChange={(e) => setProfileForm({ ...profileForm, driving_experience_years: e.target.value })} className="input" /></Field>
      <Field label="Languages spoken" required hint="Separate multiple languages with commas."><input value={profileForm.languages} onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })} className="input" placeholder="English, Swahili" /></Field>
      <Field label="Preferred work locations" hint="Optional: list areas where you would prefer to work."><input value={profileForm.preferred_locations} onChange={(e) => setProfileForm({ ...profileForm, preferred_locations: e.target.value })} className="input" placeholder="Nairobi, Mombasa" /></Field>
    </div>
    <Field label="Bio / About me" required hint="Write at least 20 characters about your experience and working style."><textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} className="input" placeholder="Tell owners about your experience and working style…" /></Field>
    <Field label="Platforms you've worked on" hint="Select every ride-hailing platform you have driven on."><div className="flex flex-wrap gap-2">{PLATFORMS.map((platform) => (
      <button key={platform} type="button" onClick={() => setProfileForm({ ...profileForm, platforms_worked: profileForm.platforms_worked.includes(platform) ? profileForm.platforms_worked.filter((value) => value !== platform) : [...profileForm.platforms_worked, platform] })} className={cn('rounded-full px-4 py-2 text-sm font-medium ring-1 transition', profileForm.platforms_worked.includes(platform) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300 dark:bg-[#141416]')}>{titleCase(platform)}</button>
    ))}</div></Field>
  </Section>;
}

function UploadPreview({ url, label }: { url: string; label: string }) {
  return <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-ink-50 p-2">
    <p className="mb-2 text-[11px] font-semibold text-ink-500">Uploaded preview · private to you and admins</p>
    <ModeratedImage src={url} alt={label} loading="lazy" decoding="async" className="max-h-52 w-full rounded-lg bg-white object-contain" />
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

function Field({ label, children, hint, required = false }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return <div className="mb-4"><label className="label">{label} {required && <span className="text-danger">*</span>}</label>{children}{hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}</div>;
}
