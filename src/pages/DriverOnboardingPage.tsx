import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, CheckCircle2, ArrowRight, AlertCircle, ShieldCheck, Clock3, History, FileText, Loader2, Upload } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { PlatformHistory } from '@/lib/types';
import { cn, titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { ModeratedImage } from '@/components/ModeratedImage';
import { isPreviewableTrustImage, isTrustImageFile, prepareTrustUpload } from '@/lib/trustUpload';
import { hasValidNameFields, normalizePersonName, parseLanguages, splitPersonName } from '@/lib/profileValidation';
import { PersonNameFields } from '@/components/PersonNameFields';
import { DocumentExpiry } from '@/components/DocumentExpiry';
import { historyCanEdit, historyState } from '@/lib/documentLifecycle';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];
const TRUST_FILE_ACCEPT = 'image/*,.pdf';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;

interface DriverAboutForm {
  firstName: string;
  secondName: string;
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
    firstName: '', secondName: '', bio: '', location: '', age: '', driving_experience_years: '',
    languages: '', preferred_locations: '', platforms_worked: [] as string[],
  });
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [monthDrafts, setMonthDrafts] = useState<Record<string, string>>({});
  const [trustLoaded, setTrustLoaded] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const uploadInFlight = useRef(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const awaitingReview = history.some(item => historyState(item, now) === 'pending');
  const canAddHistory = trustLoaded && !awaitingReview && !history.some(item => historyState(item, now) === 'approved');
  const canSubmitHistory = trustLoaded && !awaitingReview && history.some(item => historyState(item, now) === 'draft');

  const hydrateProfileForm = useCallback((savedProfile: typeof profile) => {
    if (!savedProfile) return;
    setProfileForm({
      ...splitPersonName(savedProfile.full_name || ''),
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
      setTrustLoaded(true);
    } catch (error) {
      toast('Could not load platform history. Please refresh and try again.', 'error');
      console.error('platform history load failed', error);
    }
  };

  useEffect(() => {
    hydrateProfileForm(profile);
    loadTrustData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, hydrateProfileForm]);

  const renewHistory = async (item: PlatformHistory) => {
    if (historyBusy || !historyCanEdit(item, history, now)) return;
    setHistoryBusy(true);
    try {
      const { error } = await supabase.rpc('prepare_history_renewal', { p_id: item.id });
      if (error) throw error;
      await loadTrustData();
      toast('Choose fresh proof below, preview it, then save and submit for review.');
    } catch (error) { toast('Could not open renewal: ' + (error as Error).message, 'error'); }
    finally { setHistoryBusy(false); }
  };

  const chooseUpload = (
    file: File,
    target: { kind: 'history'; item: PlatformHistory; label: string },
  ) => {
    if (!historyCanEdit(target.item, history, now) || historyState(target.item, now) !== 'draft' || uploadInFlight.current) return;
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
    if (!user || !canAddHistory || historyBusy) return;
    setHistoryBusy(true);
    try {
      const { data, error } = await supabase.from('driver_platform_history').insert({ driver_id: user.id, platform: 'uber', months_active: 0, trips: 0 }).select().maybeSingle();
      if (error) throw error;
      if (data) setHistory((items) => [...items, data as PlatformHistory]);
    } catch (error) {
      toast('Could not add platform history. Please try again.', 'error');
      console.error('platform history insert failed', error);
    } finally { setHistoryBusy(false); }
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
      if (error) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
        throw error;
      }
      await loadTrustData();
      toast('Proof uploaded to your draft. Click Save & submit platform history when ready.');
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
    if (!pendingUpload || uploadInFlight.current || !historyCanEdit(pendingUpload.item, history, now)) return;
    uploadInFlight.current = true;
    setUploadingType(pendingUpload.uploadKey);
    try {
      const preparedFile = await prepareTrustUpload(pendingUpload.file);
      const succeeded = await uploadHistoryProof(pendingUpload.item, preparedFile);
      if (succeeded) clearPendingUpload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be prepared.';
      toast('Could not prepare this upload: ' + message, 'error');
      setUploadingType(null);
    } finally { uploadInFlight.current = false; }
  };

  const updateHistory = async (item: PlatformHistory, field: keyof PlatformHistory, value: unknown) => {
    if (!historyCanEdit(item, history, now) || historyState(item, now) !== 'draft') return;
    try {
      const { error } = await supabase.from('driver_platform_history').update({ [field]: value, approved: false }).eq('id', item.id);
      if (error) throw error;
      setHistory((items) => items.map((entry) => entry.id === item.id ? { ...entry, [field]: value } : entry));
    } catch (error) {
      toast('Could not update platform history. Your page is still open; please try again.', 'error');
      console.error('platform history update failed', error);
    }
  };

  const removeHistory = async (item: PlatformHistory) => {
    if (historyBusy || !historyCanEdit(item, history, now)) return;
    setHistoryBusy(true);
    try {
      const { error } = await supabase.rpc('remove_history_draft', { p_id: item.id });
      if (error) throw error;
      setHistory((items) => items.filter((entry) => entry.id !== item.id));
      toast('Platform history removed.');
    } catch (error) {
      toast('Could not remove platform history.', 'error');
      console.error('platform history delete failed', error);
    } finally { setHistoryBusy(false); }
  };

  const saveProfile = async () => {
    if (!user || saving || !canSubmitHistory || uploadInFlight.current || pendingUpload) return;
    if (!hasValidNameFields(profileForm.firstName, profileForm.secondName)) {
      toast('Enter both your first name and second name in About You.', 'error');
      return;
    }
    const languages = parseLanguages(profileForm.languages);
    if (languages.length < 2) {
      toast('Add at least two languages you speak, separated with commas.', 'error');
      return;
    }
    const experienceYears = Number(profileForm.driving_experience_years);
    if (!experienceYears || experienceYears < 1 || experienceYears > 60) {
      toast('Driving experience must be between 1 and 60 years.', 'error');
      return;
    }
    if (history.some(item => monthDrafts[item.id] !== undefined && (!monthDrafts[item.id].trim() || !Number.isInteger(Number(monthDrafts[item.id])) || Number(monthDrafts[item.id]) < 1))) {
      toast('Enter at least 1 whole month for each platform history entry.', 'error'); return;
    }
    const drafts = history.filter(item => historyState(item, now) === 'draft');
    if (!drafts.length || drafts.some(item => !(Number(monthDrafts[item.id] ?? item.months_active) > 0) || !item.proof_url)) {
      toast('Add months active and upload proof for every draft platform, or remove unused draft entries.', 'error');
      return;
    }
    setSaving(true);
    try {
    for (const item of drafts) {
      const { error } = await supabase.from('driver_platform_history').update({ months_active: Number(monthDrafts[item.id] ?? item.months_active) }).eq('id', item.id);
      if (error) throw error;
    }
    const { error: profileError } = await supabase.from('profiles').update({
      full_name: normalizePersonName(`${profileForm.firstName} ${profileForm.secondName}`), bio: profileForm.bio, location: profileForm.location,
      age: profileForm.age ? Number(profileForm.age) : null,
      driving_experience_years: experienceYears,
      languages,
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
    } catch (error) { toast('Could not submit history: ' + (error as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const saveAbout = async () => {
    if (!user) return;
    if (!hasValidNameFields(profileForm.firstName, profileForm.secondName) || !profileForm.location.trim() || profileForm.bio.trim().length < 20) {
      toast('Add your first and second name, location, and an About Me description of at least 20 characters.', 'error'); return;
    }
    const age = Number(profileForm.age);
    if (!age || age < 18 || age > 85) { toast('Enter a valid age between 18 and 85.', 'error'); return; }
    const languages = parseLanguages(profileForm.languages);
    if (languages.length < 2) { toast('Add at least two languages you speak, separated with commas.', 'error'); return; }
    const experienceYears = Number(profileForm.driving_experience_years);
    if (!experienceYears || experienceYears < 1 || experienceYears > 60) { toast('Driving experience must be between 1 and 60 years.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: normalizePersonName(`${profileForm.firstName} ${profileForm.secondName}`), bio: profileForm.bio.trim(), location: profileForm.location.trim(), age,
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

  const passportSubmitted = trustLoaded && history.length > 0 && (awaitingReview || history.every(item => historyState(item, now) === 'approved'));

  if (passportSubmitted) {
    const approved = !awaitingReview;
    return (
      <div className="container-content max-w-3xl py-8">
        <BackButton to="/dashboard" />
        <div className="card mt-4 overflow-hidden">
          <div className={cn('p-6 text-white sm:p-8', approved ? 'bg-gradient-to-br from-emerald-600 to-brand-700' : 'bg-gradient-to-br from-amber-500 to-orange-600')}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
              {approved ? <CheckCircle2 className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}
            </div>
            <h1 className="mt-5 font-display text-2xl font-bold">Platform history {approved ? 'approved' : 'submitted'}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/85">{approved ? 'Your platform history is valid for six months from approval. Editing and renewal unlock when it expires.' : 'Your submission is locked while admins review it. You cannot edit or submit again until a decision is made. Rejected proof can be corrected; approved proof stays locked until expiry.'}</p>
          </div>
          <div className="space-y-3 p-6 sm:p-8">
            <CompletionRow label="Profile details" detail="Done" approved />
            <CompletionRow label="Platform history" detail="Done" approved={approved} />
            <CompletionRow label="Platform proof" detail="Done" approved={approved} />
            {history.map(item => <div key={item.id} className="rounded-xl border border-ink-200 p-3"><p className="text-sm font-semibold capitalize">{item.platform} · {historyState(item, now)}</p>{item.uploaded_by && <span className="badge badge-brand">Uploaded by admin</span>}{item.expires_at && <DocumentExpiry expiresAt={item.expires_at} />}</div>)}
            <div className="border-t border-ink-100 pt-5">
              <Link to="/dashboard" className="btn-secondary w-full sm:w-auto">Back to dashboard</Link>
              <p className="mt-2 text-xs text-ink-500">You can still update your About You information in Settings. Expiry reminders appear in Notifications; renewal opens on the expiry date.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!trustLoaded) return <div className="container-content py-8"><p className="text-sm text-ink-600">Loading saved platform history…</p><button type="button" onClick={() => void loadTrustData()} className="btn-secondary mt-3">Retry loading</button></div>;

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Build your driver trust profile</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-500">No identity document is required. Your latest ride-hailing platform history with proof is required so admins can confirm real driving activity.</p>
      <p className="mt-2 text-sm text-ink-600">Preview and upload your proof, then submit once for review. Approved proof is valid for six months and cannot be edited until it expires. Renew expired proof promptly to avoid your listing being made private or removed by an admin.</p>
      {profile?.document_listing_visibility && profile.document_listing_visibility !== 'public' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your driver listing is {profile.document_listing_visibility === 'deleted' ? 'removed from discovery' : 'private'}. Renew your proof and contact support to restore it. Your account and chats are still available.</p>}
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
          <div className="space-y-3">{history.map((item) => historyState(item, now) !== 'draft' ? <div key={item.id} className="rounded-xl border border-ink-200 p-4">
            <p className="text-sm font-semibold capitalize">{item.platform} · {historyState(item, now)}</p>{item.uploaded_by && <span className="badge badge-brand">Uploaded by admin</span>}
            {item.rejection_reason && <p className="mt-2 text-sm text-danger">Reason: {item.rejection_reason}</p>}
            {item.expires_at && <DocumentExpiry expiresAt={item.expires_at} />}
            {historyCanEdit(item, history, now) && <button type="button" onClick={() => void renewHistory(item)} disabled={historyBusy} className="btn-primary mt-3">{historyBusy ? 'Opening…' : historyState(item, now) === 'rejected' ? 'Correct rejected proof' : 'Renew expired proof'}</button>}
          </div> : <div key={item.id} className="space-y-3 rounded-xl border border-ink-100 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Platform" required hint="Select the app shown in your proof."><select value={item.platform} onChange={(e) => updateHistory(item, 'platform', e.target.value)} className="input py-2">{PLATFORMS.map((platform) => <option key={platform} value={platform}>{titleCase(platform)}</option>)}</select></Field>
              <Field label="Months active" required hint="Enter at least 1 whole month."><input type="number" min={1} value={monthDrafts[item.id] ?? String(item.months_active || '')} onChange={(e) => setMonthDrafts((drafts) => ({ ...drafts, [item.id]: e.target.value }))} onBlur={(e) => { const value = Number(e.target.value); if (e.target.value && Number.isInteger(value) && value >= 1) void updateHistory(item, 'months_active', value); }} className="input py-2" placeholder="e.g. 12" /></Field>
              {!item.reviewed_at && !item.submitted_at && <button type="button" onClick={() => removeHistory(item)} disabled={historyBusy || saving} aria-label={`Remove ${titleCase(item.platform)} history`} className="btn-ghost mb-4 self-center text-danger"><Trash2 className="h-4 w-4" /></button>}
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
                    disabled={Boolean(uploadingType) || saving}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.item(0);
                      if (file) chooseUpload(file, { kind: 'history', item, label: `${titleCase(item.platform)} platform proof` });
                      event.currentTarget.value = '';
                    }}
                  />
                  <Upload className="h-4 w-4" /> {pendingUpload?.item.id === item.id ? 'Choose a different file' : item.proof_url ? 'Choose replacement proof' : 'Choose image or PDF'}
                </label>
              </div>
              <span className="badge badge-warning">{item.proof_url ? 'Draft · ready to submit' : 'Draft · proof required'}</span>
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
          </div>)}{canAddHistory && <button type="button" onClick={addHistory} disabled={historyBusy || saving} className="btn-secondary"><Plus className="h-4 w-4" /> Add platform</button>}</div>
        </Section>

        {canSubmitHistory && <div className="flex flex-col items-end gap-2"><button type="button" onClick={saveProfile} disabled={saving || historyBusy || Boolean(pendingUpload) || Boolean(uploadingType)} className="btn-primary">{saving ? 'Submitting…' : 'Save & submit platform history'} <ArrowRight className="h-4 w-4" /></button><p className="text-xs text-ink-500">After submission, no changes are allowed while review is pending.</p></div>}
      </div>
    </div>
  );
}

function AboutFields({ profileForm, setProfileForm }: { profileForm: DriverAboutForm; setProfileForm: (value: DriverAboutForm) => void }) {
  return <Section title="About you" desc="This information is required before your driver profile can appear publicly.">
    <div className="mb-4"><PersonNameFields firstName={profileForm.firstName} secondName={profileForm.secondName} onFirstNameChange={(firstName) => setProfileForm({ ...profileForm, firstName })} onSecondNameChange={(secondName) => setProfileForm({ ...profileForm, secondName })} /></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Age" required hint="Drivers must be between 18 and 85 years old."><input type="number" min={18} max={85} value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} className="input" /></Field>
      <Field label="Location" required hint="Enter the Kenyan town or neighbourhood where you are based."><PlaceAutocomplete value={profileForm.location} onChange={(location) => setProfileForm({ ...profileForm, location })} placeholder="e.g. Ongata Rongai" required /></Field>
      <Field label="Driving experience (years)" required hint="Enter completed years of driving experience; minimum 1."><input type="number" min={1} max={60} value={profileForm.driving_experience_years} onChange={(e) => setProfileForm({ ...profileForm, driving_experience_years: e.target.value })} className="input" /></Field>
      <Field label="Languages spoken" required hint="Add at least two languages and separate them with commas."><input value={profileForm.languages} onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })} className="input" placeholder="English, Swahili" /></Field>
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
