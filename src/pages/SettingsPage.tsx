import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Bell, LogOut, Camera, Loader2, Check, ToggleLeft, ToggleRight, Lock, KeyRound, Palette, Mail } from 'lucide-react';
import { supabase, AVATAR_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BackButton } from '@/components/BackButton';
import { pinToPassword } from '@/lib/phoneAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [availability, setAvailability] = useState(profile?.availability || 'available');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const save = async () => {
    if (!user) return;
    if (fullName.trim().length < 2) {
      toast('Enter your full name.', 'error');
      return;
    }
    if (!location.trim()) {
      toast('Choose or enter your location in Kenya.', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      bio: bio.trim(),
      location: location.trim(),
    }).eq('id', user.id);
    if (error) {
      setSaving(false);
      toast('Could not save settings: ' + error.message, 'error');
      return;
    }
    await refreshProfile();
    setSaving(false);
    setJustSaved(true);
    toast('Settings saved.');
    setTimeout(() => setJustSaved(false), 2500);
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast('Choose a JPG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Profile photos must be smaller than 5 MB.', 'error');
      return;
    }
    setUploadingAvatar(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast('Could not upload photo.', 'error');
      setUploadingAvatar(false);
      return;
    }
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const { error: profileError } = await supabase.from('profiles').update({
      avatar_url: pub.publicUrl,
      avatar_pending_url: null,
      avatar_upload_status: 'approved',
      avatar_rejection_reason: null,
    }).eq('id', user.id);
    if (profileError) {
      toast('Could not submit photo: ' + profileError.message, 'error');
      setUploadingAvatar(false);
      return;
    }
    await refreshProfile();
    setUploadingAvatar(false);
    toast('Profile photo updated.');
  };

  const toggleAvailability = async () => {
    if (!user) return;
    const newStatus = availability === 'available' ? 'unavailable' : 'available';
    setAvailability(newStatus);
    const { error } = await supabase.from('profiles').update({ availability: newStatus }).eq('id', user.id);
    if (error) {
      setAvailability(availability === 'available' ? 'unavailable' : 'available');
      toast('Could not update availability.', 'error');
      return;
    }
    await refreshProfile();
    toast(`You are now ${newStatus}.`);
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
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} disabled={uploadingAvatar} />
                {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </label>
            </div>
            <div>
              <p className="flex items-center gap-1 font-medium text-ink-900">{profile?.full_name} <VerifiedBadge verified={profile?.is_verified} size={13} /></p>
              <p className="text-xs capitalize text-ink-500">{profile?.role} · {profile?.phone}</p>
              <p className="mt-0.5 text-xs text-ink-400">JPG, PNG, or WebP · maximum 5 MB</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div><label className="label">Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" /></div>
            <div><label className="label">Registered email address</label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input value={user?.email || profile?.email || ''} readOnly className="input pl-10 opacity-80" /></div><p className="mt-1 text-xs text-ink-400">This is the address you use to sign in.</p></div>
            <div>
              <label className="label">Location</label>
              <PlaceAutocomplete value={location} onChange={setLocation} />
              <p className="mt-1 text-xs text-ink-400">Type any town, estate, neighbourhood, or landmark in Kenya.</p>
            </div>
            <div><label className="label">Bio</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" /></div>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary mt-4">
            {saving ? 'Saving…' : justSaved ? <><Check className="h-4 w-4" /> Saved</> : 'Save changes'}
          </button>
        </div>

        {/* Availability */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Bell className="h-5 w-5" /> Availability</h2>
          <p className="mt-2 text-sm text-ink-600">Control whether other users can see you as available for connections.</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${availability === 'available' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${availability === 'available' ? 'bg-green-500' : 'bg-red-500'}`} />
                {availability === 'available' ? 'Available' : 'Unavailable'}
              </span>
            </div>
            <button onClick={toggleAvailability} className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900">
              {availability === 'available'
                ? <ToggleRight className="h-7 w-7 text-green-600" />
                : <ToggleLeft className="h-7 w-7 text-ink-400" />}
              {availability === 'available' ? 'Available' : 'Unavailable'}
            </button>
          </div>
        </div>

        <div className="card flex items-center justify-between gap-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Palette className="h-5 w-5" /> Appearance</h2>
            <p className="mt-1 text-sm text-ink-600">Choose the theme that is most comfortable for you.</p>
          </div>
          <ThemeToggle showLabel />
        </div>

        {profile?.role === 'driver' && <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Shield className="h-5 w-5" /> Trust Passport</h2>
          <p className="mt-2 text-sm text-ink-600">
            Review status: <span className="capitalize font-medium">{profile?.verification_status}</span>
          </p>
          <button onClick={() => navigate('/onboarding')} className="btn-secondary mt-3">Manage Trust Passport</button>
        </div>}

        {/* Change password */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><KeyRound className="h-5 w-5" /> Change password</h2>
          <p className="mt-1 text-sm text-ink-500">Use at least 10 characters with uppercase, lowercase, and a number.</p>
          <ChangePinSection />
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

function ChangePinSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [saving, setSaving] = useState(false);

  const changePin = async () => {
    if (newPin.length < 10 || !/[a-z]/.test(newPin) || !/[A-Z]/.test(newPin) || !/\d/.test(newPin)) { toast('Password must be at least 10 characters with uppercase, lowercase, and a number.', 'error'); return; }
    if (newPin !== confirmNewPin) { toast('Passwords do not match.', 'error'); return; }
    if (!user) return;
    setSaving(true);
    // Verify the current password by attempting sign-in.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email || '',
      password: pinToPassword(oldPin),
    });
    if (signInError) { toast('Current password is incorrect.', 'error'); setSaving(false); return; }
    // Update password
    const { error: updateError } = await supabase.auth.updateUser({ password: pinToPassword(newPin) });
    setSaving(false);
    if (updateError) { toast('Failed to update password: ' + updateError.message, 'error'); return; }
    toast('Password updated successfully.');
    setOldPin(''); setNewPin(''); setConfirmNewPin('');
  };

  return (
    <div className="mt-3 space-y-3">
      <input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="Current password" className="input" />
      <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New password" className="input" />
      <input type="password" value={confirmNewPin} onChange={(e) => setConfirmNewPin(e.target.value)} placeholder="Confirm new password" className="input" />
      <button onClick={changePin} disabled={saving || !oldPin || !newPin || !confirmNewPin} className="btn-primary">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Update password
      </button>
    </div>
  );
}
