import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Bell, LogOut, Ban, Camera, Loader2 } from 'lucide-react';
import { supabase, VEHICLE_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BackButton } from '@/components/BackButton';

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('profiles').update({ full_name: fullName, bio, location }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    toast('Settings saved.');
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
            <div><label className="label">Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} className="input" /></div>
            <div><label className="label">Bio</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" /></div>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary mt-4">{saving ? 'Saving…' : 'Save changes'}</button>
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
