import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Bell, LogOut, Ban, Camera, Loader2, Check, MapPin } from 'lucide-react';
import { supabase, VEHICLE_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BackButton } from '@/components/BackButton';

const KENYA_LOCATIONS = [
  'Nairobi CBD', 'Westlands, Nairobi', 'Kilimani, Nairobi', 'Karen, Nairobi',
  'Embakasi, Nairobi', 'Kasarani, Nairobi', 'Roysambu, Nairobi', 'Rongai, Nakuru',
  'Mombasa CBD', 'Nyali, Mombasa', 'Kisauni, Mombasa', 'Thika', 'Nakuru Town',
  'Eldoret Town', 'Kisumu Town', 'Nyeri Town', 'Machakos Town', 'Kitale',
  'Malindi', 'Lamu', 'Naivasha', 'Limuru', 'Kiambu Town', 'Ruiru',
  'Juja', 'Athi River', 'Syokimau', 'Kitengela', 'Ongata Rongai', 'Kikuyu Town',
];

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [showLocations, setShowLocations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ full_name: fullName, bio, location }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setJustSaved(true);
    toast('Settings saved.');
    setTimeout(() => setJustSaved(false), 2500);
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(VEHICLE_BUCKET).upload(path, file, { upsert: true });
    if (error) {
      toast('Could not upload photo.', 'error');
      setUploadingAvatar(false);
      return;
    }
    const { data: pub } = supabase.storage.from(VEHICLE_BUCKET).getPublicUrl(path);
    await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', user.id);
    await refreshProfile();
    setUploadingAvatar(false);
    toast('Profile photo updated.');
  };

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Settings</h1>
      <div className="mt-6 max-w-2xl space-y-6">
        {/* Profile */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><User className="h-5 w-5" /> Profile</h2>

          {/* Avatar upload */}
          <div className="mt-4 flex items-center gap-4">
            <div className="relative">
              <Avatar name={profile?.full_name || 'User'} src={profile?.avatar_url} size={72} verified={!!profile?.is_verified} />
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white transition-transform hover:scale-110">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} disabled={uploadingAvatar} />
                {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </label>
            </div>
            <div>
              <p className="flex items-center gap-1 font-medium text-ink-900">{profile?.full_name} <VerifiedBadge verified={profile?.is_verified} size={13} /></p>
              <p className="text-xs capitalize text-ink-500">{profile?.role} · {profile?.phone}</p>
              <p className="mt-0.5 text-xs text-ink-400">Click the camera icon to update your photo</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div><label className="label">Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" /></div>
            <div className="relative">
              <label className="label">Location</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setShowLocations(true); }}
                  onFocus={() => setShowLocations(true)}
                  onBlur={() => setTimeout(() => setShowLocations(false), 200)}
                  placeholder="Start typing your area…"
                  className="input pl-9"
                />
              </div>
              {showLocations && location && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-ink-100 bg-white shadow-lg">
                  {KENYA_LOCATIONS
                    .filter((l) => l.toLowerCase().includes(location.toLowerCase()))
                    .slice(0, 8)
                    .map((l) => (
                      <button
                        key={l}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setLocation(l); setShowLocations(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-brand-50"
                      >
                        <MapPin className="h-3.5 w-3.5 text-ink-400" /> {l}
                      </button>
                    ))}
                  {KENYA_LOCATIONS.filter((l) => l.toLowerCase().includes(location.toLowerCase())).length === 0 && (
                    <p className="px-3 py-2 text-xs text-ink-500">No suggestions. Type your location manually.</p>
                  )}
                </div>
              )}
            </div>
            <div><label className="label">Bio</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" /></div>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary mt-4">
            {saving ? 'Saving…' : justSaved ? <><Check className="h-4 w-4" /> Saved</> : 'Save changes'}
          </button>
        </div>

        {/* Verification */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Shield className="h-5 w-5" /> Verification</h2>
          <p className="mt-2 text-sm text-ink-600">
            Status: <span className="capitalize font-medium">{profile?.verification_status}</span>
          </p>
          {profile?.role === 'driver' && (
            <button onClick={() => navigate('/onboarding')} className="btn-secondary mt-3">Manage documents</button>
          )}
        </div>

        {/* Danger */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><LogOut className="h-5 w-5" /> Account</h2>
          <button onClick={async () => { await signOut(); navigate('/'); }} className="btn-ghost mt-3 text-danger">Sign out</button>
        </div>
      </div>
    </div>
  );
}
