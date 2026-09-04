import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Bell, LogOut, Camera, Loader2, Check, ToggleLeft, ToggleRight, Lock, KeyRound, Palette, Mail, AlertTriangle, MessageSquare, Trash2, Languages } from 'lucide-react';
import { supabase, AVATAR_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { BackButton } from '@/components/BackButton';
import { pinToPassword } from '@/lib/phoneAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { isBroadNairobi, SPECIFIC_LOCATION_MESSAGE } from '@/lib/specificLocation';
import { Modal } from '@/components/Modal';
import { prepareChatImageUpload } from '@/lib/trustUpload';
import { clearMobileUploadAttempt, consumeInterruptedMobileUpload, rememberMobileUploadAttempt, rememberMobileUploadPicker } from '@/lib/mobileUploadAttempt';
import { hasValidNameFields, normalizePersonName, parseLanguages, splitPersonName } from '@/lib/profileValidation';
import { PersonNameFields } from '@/components/PersonNameFields';
import { DriverApprovalNotice } from '@/components/DriverApprovalNotice';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { driverNeedsApproval, driverApprovalMessage } from '@/lib/driverEligibility';

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [nameFields, setNameFields] = useState(() => splitPersonName(profile?.full_name || ''));
  const [bio, setBio] = useState(profile?.bio || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [languages, setLanguages] = useState((profile?.languages || []).join(', '));
  const [availability, setAvailability] = useState(profile?.availability || 'available');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [preparingAvatar, setPreparingAvatar] = useState(false);
  const [avatarIssue, setAvatarIssue] = useState<string | null>(() => consumeInterruptedMobileUpload('profile-photo'));
  const [activeRelationships, setActiveRelationships] = useState(0);
  const [showAvailabilityWarning, setShowAvailabilityWarning] = useState(false);
  const [changingAvailability, setChangingAvailability] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: connectionCount }, { count: applicationCount }] = await Promise.all([
        supabase.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
        supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`),
      ]);
      setActiveRelationships((connectionCount || 0) + (applicationCount || 0));
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!hasValidNameFields(nameFields.firstName, nameFields.secondName)) {
      toast('Enter both your first name and second name.', 'error');
      return;
    }
    if (isBroadNairobi(location)) { toast(SPECIFIC_LOCATION_MESSAGE, 'error'); return; }
    if (!location.trim()) {
      toast('Choose or enter your location in Kenya.', 'error');
      return;
    }
    const selectedLanguages = parseLanguages(languages);
    if (selectedLanguages.length < 2) {
      toast('Add at least two languages you speak, separated with commas.', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: normalizePersonName(`${nameFields.firstName} ${nameFields.secondName}`),
      bio: bio.trim(),
      location: location.trim(),
      languages: selectedLanguages,
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
    setUploadingAvatar(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error('Could not upload photo: ' + error.message);
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const { error: profileError } = await supabase.from('profiles').update({
        avatar_url: pub.publicUrl,
        avatar_pending_url: null,
        avatar_upload_status: 'approved',
        avatar_rejection_reason: null,
      }).eq('id', user.id);
      if (profileError) throw new Error('Could not update your profile photo: ' + profileError.message);
      await refreshProfile();
      toast('Profile photo updated.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The profile photo could not be uploaded. Check your connection and try again.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const prepareAndUploadAvatar = async (file: File) => {
    setPreparingAvatar(true);
    setAvatarIssue(null);
    rememberMobileUploadAttempt('profile-photo', file);
    try {
      const prepared = await prepareChatImageUpload(file);
      clearMobileUploadAttempt();
      await uploadAvatar(prepared);
    } catch (error) {
      clearMobileUploadAttempt();
      const message = error instanceof Error ? error.message : 'Choose another image.';
      setAvatarIssue(message);
      toast('Could not prepare this phone photo: ' + message, 'error');
    } finally {
      setPreparingAvatar(false);
    }
  };

  const applyAvailability = async (makeAvailable: boolean) => {
    if (driverNeedsApproval(profile)) { toast(driverApprovalMessage(profile), 'error'); return; }
    if (!user) return;
    setChangingAvailability(true);
    const { data, error } = await supabase.rpc('set_my_availability', { p_available: makeAvailable });
    setChangingAvailability(false);
    if (error) {
      toast('Could not update availability: ' + error.message, 'error');
      return;
    }
    const newStatus = makeAvailable ? 'available' : 'unavailable';
    setAvailability(newStatus);
    if (makeAvailable) setActiveRelationships(0);
    setShowAvailabilityWarning(false);
    await refreshProfile();
    const ended = Number(data || 0);
    toast(ended > 0 ? `You are available. ${ended} active connection${ended === 1 ? '' : 's'} ended; chat history was preserved.` : `You are now ${newStatus}.`);
  };

  const toggleAvailability = () => {
    if (availability === 'available') { applyAvailability(false); return; }
    if (activeRelationships > 0) { setShowAvailabilityWarning(true); return; }
    applyAvailability(true);
  };

  const deleteAccount = async () => {
    if (!user?.email || !deletePassword) return;
    setDeletingAccount(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: pinToPassword(deletePassword) });
    if (signInError) {
      setDeletingAccount(false);
      toast('Password is incorrect. Your account was not deleted.', 'error');
      return;
    }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDeletingAccount(false);
      toast('Could not delete your account: ' + error.message, 'error');
      return;
    }
    await signOut().catch(() => undefined);
    navigate('/', { replace: true });
    toast('Your account and platform data have been permanently deleted.');
  };

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Settings</h1>
      <div className="mt-6 max-w-2xl space-y-6">
        {/* Profile */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><User className="h-5 w-5" /> Profile</h2>
          <p className="mt-1 text-xs text-ink-400"><span className="font-bold text-danger">*</span> Required information</p>

          {/* Avatar upload */}
          <div className="mt-4 flex items-center gap-4">
            <div className="relative">
              <Avatar name={profile?.full_name || 'User'} src={profile?.avatar_url} size={72} verified={profile?.role === 'driver' && !!profile?.platform_history_approved} />
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-md ring-2 ring-white transition-transform hover:scale-110">
                <input type="file" accept="image/*,.heic,.heif" className="hidden" onClick={() => rememberMobileUploadPicker('profile-photo')} onChange={(e) => { const f = e.target.files?.[0]; if (f) void prepareAndUploadAvatar(f); e.target.value = ''; }} disabled={uploadingAvatar || preparingAvatar} />
                {uploadingAvatar || preparingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </label>
            </div>
            <div>
              <p className="flex items-center gap-1 font-medium text-ink-900">{profile?.full_name} {profile?.role === 'driver' && <VerifiedBadge verified={profile?.platform_history_approved} size={13} />}</p>
              <p className="text-xs capitalize text-ink-500">{profile?.role} · {profile?.phone}</p>
              <p className="mt-0.5 text-xs text-ink-400">Phone photos, HEIC, HEIF, JPG, PNG, or WebP · compressed before upload</p>
            </div>
          </div>
          {avatarIssue && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/20 dark:text-red-100"><p className="font-semibold">Profile photo was not uploaded</p><p className="mt-1">{avatarIssue}</p></div>}

          <div className="mt-4 space-y-4">
            <PersonNameFields {...nameFields} onFirstNameChange={(firstName) => setNameFields((current) => ({ ...current, firstName }))} onSecondNameChange={(secondName) => setNameFields((current) => ({ ...current, secondName }))} />
            <div><label className="label">Registered email address</label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input value={user?.email || profile?.email || ''} readOnly className="input pl-10 opacity-80" /></div><p className="mt-1 text-xs text-ink-400">This is the address you use to sign in.</p></div>
            <div>
              <label className="label">Residential area <span className="text-danger">*</span></label>
              <PlaceAutocomplete requireSpecificArea ariaLabel="Residential area" typingHint="Choose the neighborhood or town where you live, not your workplace." value={location} onChange={setLocation} />
              <p className="mt-1 text-xs text-ink-400">Type any town, estate, neighbourhood, or landmark in Kenya.</p>
            </div>
            <div><label className="label">Languages spoken <span className="text-danger">*</span></label><div className="relative"><Languages className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input value={languages} onChange={(e) => setLanguages(e.target.value)} className="input pl-10" placeholder="English, Swahili" /></div><p className="mt-1 text-xs text-ink-400">Add at least two languages and separate them with commas.</p></div>
            <div><label className="label">Bio <span className="text-xs font-normal text-ink-400">(optional)</span></label><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" /><p className="mt-1 text-xs text-ink-400">Briefly describe yourself, your work, or what you are looking for.</p></div>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary mt-4">
            {saving ? 'Saving…' : justSaved ? <><Check className="h-4 w-4" /> Saved</> : 'Save changes'}
          </button>
        </div>

        {/* Availability */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Bell className="h-5 w-5" /> Availability</h2>
          <p className="mt-2 text-sm text-ink-600">Control whether other users can see you as available for connections.</p>
          {profile && driverNeedsApproval(profile) ? <div className="mt-4"><DriverApprovalNotice profile={profile} /><button type="button" disabled className="btn-secondary mt-3 w-full opacity-60">Availability locked until approval</button></div> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AvailabilityBadge availability={availability} profile={profile || undefined} />
            </div>
            <button onClick={toggleAvailability} disabled={changingAvailability} className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50">
              {availability === 'available'
                ? <ToggleRight className="h-7 w-7 text-green-600" />
                : <ToggleLeft className="h-7 w-7 text-ink-400" />}
              {availability === 'available' ? 'Set unavailable' : availability === 'busy' ? 'End connection & become available' : 'Set available'}
            </button>
          </div>}
        </div>

        <div className="card flex items-center justify-between gap-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Palette className="h-5 w-5" /> Appearance</h2>
            <p className="mt-1 text-sm text-ink-600">Choose the theme that is most comfortable for you.</p>
          </div>
          <ThemeToggle showLabel />
        </div>

        {profile?.role === 'driver' && <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><Shield className="h-5 w-5" /> Driver platform history</h2>
          <p className="mt-2 text-sm text-ink-600">
            Review status: <span className="capitalize font-medium">{profile?.verification_status}</span>
          </p>
          <button onClick={() => navigate('/onboarding')} className="btn-secondary mt-3">Manage platform history</button>
        </div>}

        {/* Change password */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><KeyRound className="h-5 w-5" /> Change password</h2>
          <p className="mt-1 text-sm text-ink-500">Use at least 10 characters with uppercase, lowercase, and a number.</p>
          <ChangePinSection />
          <EmailPasswordHelp />
        </div>

        {/* Danger */}
        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900"><LogOut className="h-5 w-5" /> Account</h2>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={async () => { await signOut(); navigate('/'); }} className="btn-ghost">Sign out</button>{profile?.role !== 'admin' && <button onClick={() => setShowDeleteAccount(true)} className="btn-secondary text-danger"><Trash2 className="h-4 w-4" /> Delete account</button>}</div>
          {profile?.role === 'admin' && <p className="mt-2 text-xs text-ink-500">For platform safety, an administrator account can only be removed after another administrator takes over its responsibilities.</p>}
        </div>
      </div>

      {showAvailabilityWarning && (
        <Modal title="End active connection and become available?" onClose={() => setShowAvailabilityWarning(false)}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="h-6 w-6" />
            <p className="mt-3 text-sm font-semibold">You currently have {activeRelationships} active connection{activeRelationships === 1 ? '' : 's'}.</p>
            <p className="mt-2 text-sm leading-6">Setting your profile to available will end the active connection immediately. You and the other member will no longer be able to send messages in that chat unless a new connection request is sent and accepted.</p>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-500"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />The complete conversation will remain stored and readable for history, support, and dispute resolution.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setShowAvailabilityWarning(false)} className="btn-secondary w-full">Keep connection</button><button type="button" onClick={() => applyAvailability(true)} disabled={changingAvailability} className="btn-primary w-full">{changingAvailability ? 'Ending…' : 'End & become available'}</button></div>
        </Modal>
      )}
      {showDeleteAccount && (
        <Modal title="Permanently delete your account?" onClose={() => { if (!deletingAccount) { setShowDeleteAccount(false); setDeletePassword(''); } }}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:bg-red-950/20 dark:text-red-100"><AlertTriangle className="h-6 w-6" /><p className="mt-3 font-semibold">This cannot be undone.</p><p className="mt-2 text-sm leading-6">Your profile will disappear, your listings and applications will be removed, active connections will end, and your platform records, messages, reviews, reports, and uploaded evidence linked to the account will be deleted.</p></div>
          <label className="label mt-4" htmlFor="delete-account-password">Enter your current password to confirm</label>
          <input id="delete-account-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Current password" className="input" />
          <p className="mt-1.5 text-xs text-ink-400">Required to prove that you own this account before permanent deletion.</p>
          <EmailPasswordHelp />
          <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => { setShowDeleteAccount(false); setDeletePassword(''); }} disabled={deletingAccount} className="btn-secondary w-full">Keep my account</button><button type="button" onClick={deleteAccount} disabled={deletingAccount || !deletePassword} className="btn w-full bg-danger text-white hover:bg-red-700 disabled:opacity-50">{deletingAccount ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4" /> Delete forever</>}</button></div>
        </Modal>
      )}
    </div>
  );
}

function EmailPasswordHelp() {
  const { user, resetPin } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const send = async () => {
    if (!user?.email || sending) return;
    setSending(true);
    try {
      const result = await resetPin(user.email);
      setMessage(result.error || 'Check your registered email for a link to set a platform password.');
    } finally { setSending(false); }
  };
  return <div className="mt-4 rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-600">
    <p>Joined with Google and have no platform password? Set one using your registered email first. Never enter your Google password here.</p>
    <button type="button" onClick={() => void send()} disabled={sending} className="mt-1 min-h-11 font-semibold underline">{sending ? 'Sending link…' : 'Email me a password-setup link'}</button>
    {message && <p role="status">{message}</p>}
  </div>;
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
      <div><label className="label">Current password <span className="text-danger">*</span></label><input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="Current password" className="input" /><p className="mt-1 text-xs text-ink-400">Used to confirm that this account belongs to you.</p></div>
      <div><label className="label">New password <span className="text-danger">*</span></label><input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New password" className="input" /><p className="mt-1 text-xs text-ink-400">Use at least 10 characters with uppercase, lowercase, and a number.</p></div>
      <div><label className="label">Confirm new password <span className="text-danger">*</span></label><input type="password" value={confirmNewPin} onChange={(e) => setConfirmNewPin(e.target.value)} placeholder="Confirm new password" className="input" /><p className="mt-1 text-xs text-ink-400">Repeat the new password exactly.</p></div>
      <button onClick={changePin} disabled={saving || !oldPin || !newPin || !confirmNewPin} className="btn-primary">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Update password
      </button>
    </div>
  );
}
