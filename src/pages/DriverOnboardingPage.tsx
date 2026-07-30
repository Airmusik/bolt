import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Plus, Trash2, BadgeCheck, CheckCircle2, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET, VEHICLE_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import type { DocumentRow, PlatformHistory } from '@/lib/types';
import { cn, titleCase, formatDate, expiryStatus } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras', 'other'];

interface DocDraft { id?: string; type: string; file_url: string; label: string; expiry_date: string; verified?: boolean; rejected?: boolean; rejection_reason?: string | null; }

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
  const [docs, setDocs] = useState<DocDraft[]>([]);
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        location: profile.location || '',
        age: profile.age?.toString() || '',
        driving_experience_years: profile.driving_experience_years?.toString() || '',
        languages: (profile.languages || []).join(', '),
        preferred_locations: (profile.preferred_locations || []).join(', '),
        platforms_worked: profile.platforms_worked || [],
      });
      setAvatarUrl(profile.avatar_url);
    }
    if (user) {
      (async () => {
        const { data: d } = await supabase.from('documents').select('*').eq('user_id', user.id);
        setDocs(((d as DocumentRow[]) || []).map((x) => ({ id: x.id, type: x.type, file_url: x.file_url, label: x.label || '', expiry_date: x.expiry_date || '', verified: x.verified, rejected: x.rejected, rejection_reason: x.rejection_reason })));
        const { data: h } = await supabase.from('driver_platform_history').select('*').eq('driver_id', user.id);
        setHistory((h as PlatformHistory[]) || []);
      })();
    }
  }, [user, profile]);

  const uploadDoc = async (file: File, type: string) => {
    if (!user) return;
    setUploadingType(type);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${type}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
    if (error) { toast('Upload failed', 'error'); setUploadingType(null); return; }
    const { data: pub } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
    // upsert doc
    const existing = docs.find((d) => d.type === type);
    if (existing?.id) {
      await supabase.from('documents').update({ file_url: pub.publicUrl, verified: false, rejected: false, rejection_reason: null }).eq('id', existing.id);
      setDocs(docs.map((d) => d.type === type ? { ...d, file_url: pub.publicUrl, verified: false, rejected: false, rejection_reason: null } : d));
    } else {
      const { data } = await supabase.from('documents').insert({ user_id: user.id, type, file_url: pub.publicUrl }).select().maybeSingle();
      if (data) setDocs([...docs, { id: (data as DocumentRow).id, type, file_url: pub.publicUrl, label: '', expiry_date: '' }]);
    }
    setUploadingType(null);
    toast('Document uploaded.');
  };

  const updateDocExpiry = async (docId: string, expiry: string) => {
    setDocs(docs.map((d) => d.id === docId ? { ...d, expiry_date: expiry } : d));
    await supabase.from('documents').update({ expiry_date: expiry || null }).eq('id', docId);
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploadingType('profile_photo');
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    await supabase.storage.from(VEHICLE_BUCKET).upload(path, file);
    const { data: pub } = supabase.storage.from(VEHICLE_BUCKET).getPublicUrl(path);
    setAvatarUrl(pub.publicUrl);
    await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', user.id);
    setUploadingType(null);
    toast('Profile photo updated.');
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const langs = profileForm.languages.split(',').map((s) => s.trim()).filter(Boolean);
    const prefs = profileForm.preferred_locations.split(',').map((s) => s.trim()).filter(Boolean);
    // sync expiry dates to profile for public display
    const licenceDoc = docs.find((d) => d.type === 'driving_licence');
    const psvDoc = docs.find((d) => d.type === 'psv_badge');
    const gcDoc = docs.find((d) => d.type === 'good_conduct');
    await supabase.from('profiles').update({
      full_name: profileForm.full_name, bio: profileForm.bio, location: profileForm.location,
      age: profileForm.age ? Number(profileForm.age) : null,
      driving_experience_years: profileForm.driving_experience_years ? Number(profileForm.driving_experience_years) : 0,
      languages: langs, preferred_locations: prefs, platforms_worked: profileForm.platforms_worked,
      licence_expiry: licenceDoc?.expiry_date || null,
      psv_badge_expiry: psvDoc?.expiry_date || null,
      good_conduct_expiry: gcDoc?.expiry_date || null,
      verification_status: 'pending',
    }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    toast('Profile saved. Verification will be reviewed by our team.');
    navigate('/dashboard');
  };

  const addHistory = async () => {
    if (!user) return;
    const { data } = await supabase.from('driver_platform_history')
      .insert({ driver_id: user.id, platform: 'uber', months_active: 0, trips: 0 })
      .select().maybeSingle();
    if (data) setHistory([...history, data as PlatformHistory]);
  };

  const updateHistory = async (h: PlatformHistory, field: keyof PlatformHistory, value: any) => {
    setHistory(history.map((x) => x.id === h.id ? { ...x, [field]: value } : x));
    await supabase.from('driver_platform_history').update({ [field]: value }).eq('id', h.id);
  };

  const removeHistory = async (h: PlatformHistory) => {
    await supabase.from('driver_platform_history').delete().eq('id', h.id);
    setHistory(history.filter((x) => x.id !== h.id));
  };

  const docTypes = [
    { type: 'national_id', label: 'National ID / Passport', expiry: false },
    { type: 'driving_licence', label: 'Driving Licence', expiry: true },
    { type: 'psv_badge', label: 'PSV Badge (optional)', expiry: true },
    { type: 'good_conduct', label: 'Certificate of Good Conduct (optional)', expiry: true },
  ];

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Complete your driver profile</h1>
      <p className="mt-1 text-sm text-ink-500">Add your details and upload documents to get verified. Expiry dates help owners know when renewals are due.</p>

      <div className="mt-6 space-y-6">
        {/* Avatar */}
        <Section title="Profile photo">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-ink-100 ring-1 ring-ink-200">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-ink-400 text-xs">No photo</div>}
            </div>
            <label className="btn-secondary cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
              <Upload className="h-4 w-4" /> {uploadingType === 'profile_photo' ? 'Uploading…' : 'Upload photo'}
            </label>
          </div>
        </Section>

        {/* Profile */}
        <Section title="About you">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="input" /></Field>
            <Field label="Age"><input type="number" value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} className="input" /></Field>
            <Field label="Location"><input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} className="input" placeholder="Nairobi" /></Field>
            <Field label="Driving experience (years)"><input type="number" value={profileForm.driving_experience_years} onChange={(e) => setProfileForm({ ...profileForm, driving_experience_years: e.target.value })} className="input" /></Field>
            <Field label="Languages spoken"><input value={profileForm.languages} onChange={(e) => setProfileForm({ ...profileForm, languages: e.target.value })} className="input" placeholder="English, Swahili" /></Field>
            <Field label="Preferred work locations"><input value={profileForm.preferred_locations} onChange={(e) => setProfileForm({ ...profileForm, preferred_locations: e.target.value })} className="input" placeholder="Nairobi, Mombasa" /></Field>
          </div>
          <Field label="Bio / About me"><textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} className="input" placeholder="Tell owners about yourself…" /></Field>
          <Field label="Platforms you've worked on">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => setProfileForm({
                  ...profileForm,
                  platforms_worked: profileForm.platforms_worked.includes(p)
                    ? profileForm.platforms_worked.filter((x) => x !== p)
                    : [...profileForm.platforms_worked, p],
                })} className={cn('rounded-full px-4 py-2 text-sm font-medium ring-1 transition', profileForm.platforms_worked.includes(p) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300')}>
                  {titleCase(p)}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Documents */}
        <Section title="Verification documents" desc="Upload clear scans or photos. Expiry dates are shown to owners when they browse drivers.">
          <div className="space-y-3">
            {docTypes.map((dt) => {
              const doc = docs.find((d) => d.type === dt.type);
              return (
                <div key={dt.type} className={cn('rounded-xl border p-4', doc?.rejected ? 'border-danger/30 bg-red-50/30' : 'border-ink-100')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">{dt.label}</span>
                      {doc?.verified && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {doc?.rejected && <AlertCircle className="h-4 w-4 text-danger" />}
                    </div>
                    <label className={cn('cursor-pointer px-3 py-1.5 text-xs', doc?.rejected ? 'btn-primary' : 'btn-secondary')}>
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f, dt.type); e.target.value = ''; }} disabled={uploadingType === dt.type} />
                      {uploadingType === dt.type ? <><Upload className="h-3.5 w-3.5" /> Uploading…</> : doc?.rejected ? <><RefreshCw className="h-3.5 w-3.5" /> Re-upload</> : <><Upload className="h-3.5 w-3.5" /> {doc ? 'Replace' : 'Upload'}</>}
                    </label>
                  </div>
                  {doc?.rejected && doc.rejection_reason && (
                    <div className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs text-danger">
                      <span className="font-semibold">Rejected:</span> {doc.rejection_reason}
                    </div>
                  )}
                  {doc?.verified && (
                    <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-success">
                      <CheckCircle2 className="mr-1 inline h-3 w-3" /> Verified
                    </div>
                  )}
                  {dt.expiry && doc && (
                    <div className="mt-3">
                      <label className="label text-xs">Expiry date</label>
                      <input type="date" value={doc.expiry_date} onChange={(e) => updateDocExpiry(doc.id!, e.target.value)} className="input py-2" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Platform history */}
        <Section title="Platform history (last 5 months)" desc="Add your activity on each platform so owners can see your track record.">
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="grid gap-3 rounded-xl border border-ink-100 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <select value={h.platform} onChange={(e) => updateHistory(h, 'platform', e.target.value)} className="input py-2">
                  {PLATFORMS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                </select>
                <input type="number" value={h.months_active} onChange={(e) => updateHistory(h, 'months_active', Number(e.target.value))} className="input py-2" placeholder="Months active" />
                <input type="number" value={h.trips} onChange={(e) => updateHistory(h, 'trips', Number(e.target.value))} className="input py-2" placeholder="Trips" />
                <button onClick={() => removeHistory(h)} className="btn-ghost text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={addHistory} className="btn-secondary"><Plus className="h-4 w-4" /> Add platform</button>
          </div>
        </Section>

        <div className="flex justify-end">
          <button onClick={saveProfile} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save & submit for verification'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
      {desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
