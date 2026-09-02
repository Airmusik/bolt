import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, AlertTriangle, Upload, X, ArrowLeft } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { Vehicle, VehicleIssue, VehiclePhoto } from '@/lib/types';
import { VEHICLE_MAKES } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { ModeratedImage } from '@/components/ModeratedImage';
import { PlatePrivacyEditor } from '@/components/PlatePrivacyEditor';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { VehicleModelInput } from '@/components/VehicleModelInput';
import { prepareChatImageUpload } from '@/lib/trustUpload';
import { clearMobileUploadAttempt, consumeInterruptedMobileUpload, rememberMobileUploadAttempt, rememberMobileUploadPicker } from '@/lib/mobileUploadAttempt';

interface IssueDraft { id?: string; description: string; severity: 'minor' | 'moderate' | 'major' }
const RIDE_HAILING_PLATFORMS: { value: Vehicle['registered_platforms'][number]; label: string }[] = [
  { value: 'uber', label: 'Uber ready' },
  { value: 'bolt', label: 'Bolt ready' },
  { value: 'little', label: 'Little Cab ready' },
  { value: 'faras', label: 'Faras ready' },
  { value: 'other', label: 'Other platform' },
];

export function VehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const isEdit = Boolean(id);
  const [capacity, setCapacity] = useState<{ used: number; limit: number } | null>(null);
  const [capacityError, setCapacityError] = useState('');
  const loadCapacity = async () => {
    const { data, error } = await supabase.rpc('my_listing_capacity');
    if (error) { setCapacityError('Could not check your listing allowance. Please try again.'); return null; }
    setCapacityError('');
    setCapacity(data);
    return data as { used: number; limit: number };
  };
  useEffect(() => { if (!id && user?.id) void loadCapacity(); }, [id, user?.id]);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    make: '', model: '', year: String(new Date().getFullYear()), transmission: 'automatic', fuel_type: 'petrol',
    location: '', weekly_target: '', monthly_target: '', deposit: '', minimum_driver_experience_years: '0', requirements: '',
    registered_platforms: [] as Vehicle['registered_platforms'],
    availability: 'available', insurance_type: 'third_party', insurance_expiry: '',
    available_from: new Date().toISOString().slice(0, 10),
  });
  const [issues, setIssues] = useState<IssueDraft[]>([]);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoForPrivacyReview, setPhotoForPrivacyReview] = useState<File | null>(null);
  const [photoIssue, setPhotoIssue] = useState<string | null>(() => consumeInterruptedMobileUpload('vehicle-photo'));
  const [originalApprovalStatus, setOriginalApprovalStatus] = useState<Vehicle['approval_status'] | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: v }, { data: iss }, { data: ph }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('id', id).maybeSingle(),
        supabase.from('vehicle_issues').select('*').eq('vehicle_id', id),
        supabase.from('vehicle_photos').select('*').eq('vehicle_id', id).order('position'),
      ]);
      if (v) {
        const veh = v as Vehicle;
        setOriginalApprovalStatus(veh.approval_status);
        setForm({
          make: veh.make, model: veh.model, year: String(veh.year), transmission: veh.transmission, fuel_type: veh.fuel_type,
          location: veh.location, weekly_target: veh.weekly_target?.toString() || '', monthly_target: veh.monthly_target?.toString() || '',
          deposit: veh.deposit?.toString() || '', minimum_driver_experience_years: String(veh.minimum_driver_experience_years ?? 0), requirements: veh.requirements || '',
          registered_platforms: veh.registered_platforms || [],
          availability: veh.availability, insurance_type: veh.insurance_type, insurance_expiry: veh.insurance_expiry || '',
          available_from: veh.available_from || new Date().toISOString().slice(0, 10),
        });
      }
      setIssues(((iss as VehicleIssue[]) || []).map((i) => ({ id: i.id, description: i.description, severity: i.severity })));
      setPhotos((ph as VehiclePhoto[]) || []);
    })();
  }, [id]);

  useEffect(() => {
    if (id || !profile?.location) return;
    setForm((current) => current.location ? current : { ...current, location: profile.location || '' });
  }, [id, profile?.location]);

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw new Error('Upload failed: ' + error.message);
      const { data: pub } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
      if (isEdit && id) {
        const { data, error: photoError } = await supabase.from('vehicle_photos').insert({ vehicle_id: id, photo_url: pub.publicUrl, position: photos.length }).select().maybeSingle();
        if (photoError) throw new Error('Photo uploaded, but could not be attached to the vehicle: ' + photoError.message);
        if (data) setPhotos((p) => [...p, data as VehiclePhoto]);
      } else {
        // Store the private upload locally until the listing itself is created.
        setPhotos((p) => [...p, { id: 'temp-' + Date.now(), vehicle_id: '', photo_url: pub.publicUrl, position: p.length, approved: false, rejected: false, rejection_reason: null, created_at: '' }]);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'The photo could not be uploaded. Check your connection and try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const prepareVehiclePhoto = async (file: File) => {
    setPreparingPhoto(true);
    setPhotoIssue(null);
    rememberMobileUploadAttempt('vehicle-photo', file);
    try {
      const prepared = await prepareChatImageUpload(file);
      clearMobileUploadAttempt();
      setPhotoForPrivacyReview(prepared);
    } catch (error) {
      clearMobileUploadAttempt();
      const message = error instanceof Error ? error.message : 'Choose another image.';
      setPhotoIssue(message);
      toast('Could not prepare this phone photo: ' + message, 'error');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const removePhoto = async (photo: VehiclePhoto) => {
    if (isEdit && id && !photo.id.startsWith('temp-')) {
      const { error } = await supabase.from('vehicle_photos').delete().eq('id', photo.id);
      if (error) { toast('Could not remove photo: ' + error.message, 'error'); return; }
    }
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    toast('Photo removed.');
  };

  const save = async () => {
    if (!user) return;
    if (!form.make || !form.model.trim() || !form.location.trim()) { toast('Make, model and location are required.', 'error'); return; }
    if ([form.weekly_target, form.monthly_target, form.deposit].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) { toast('Targets and deposit must be zero or a positive amount.', 'error'); return; }
    if (!/^\d{4}$/.test(form.year) || Number(form.year) < 1900 || Number(form.year) > new Date().getFullYear() + 1) { toast('Enter a valid four-digit manufacture year.', 'error'); return; }
    if (photos.length === 0) { toast('At least one vehicle photo is required for security.', 'error'); return; }
    if (!isEdit) {
      const current = await loadCapacity();
      if (!current || current.used >= current.limit) return;
    }
    setSaving(true);
    const payload = {
      owner_id: user.id,
      make: form.make, model: form.model.trim(), year: Number(form.year),
      transmission: form.transmission, fuel_type: form.fuel_type, location: form.location.trim(),
      weekly_target: form.weekly_target ? Number(form.weekly_target) : null,
      monthly_target: form.monthly_target ? Number(form.monthly_target) : null,
      deposit: form.deposit ? Number(form.deposit) : 0,
      driver_experience: Number(form.minimum_driver_experience_years) > 0 ? `${form.minimum_driver_experience_years}+ years` : null,
      minimum_driver_experience_years: Number(form.minimum_driver_experience_years),
      requirements: form.requirements || null,
      registered_platforms: form.registered_platforms,
      availability: form.availability,
      insurance_type: form.insurance_type,
      insurance_expiry: form.insurance_expiry || null,
      available_from: form.available_from || null,
    };
    let vehicleId = id;
    if (isEdit && id) {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', id);
      if (error) { toast('Could not update vehicle: ' + error.message, 'error'); setSaving(false); return; }
      if (originalApprovalStatus === 'rejected') {
        const { error: resubmitError } = await supabase.rpc('resubmit_vehicle_listing', { p_vehicle_id: id });
        if (resubmitError) { toast('Changes were saved, but the listing could not be resubmitted: ' + resubmitError.message, 'error'); setSaving(false); return; }
      }
    } else {
      const { data, error } = await supabase.from('vehicles').insert(payload).select().maybeSingle();
      if (error || !data) { toast('Could not save vehicle: ' + (error?.message || ''), 'error'); if (error?.message.includes('Listing limit')) await loadCapacity(); setSaving(false); return; }
      vehicleId = (data as Vehicle).id;
      const { error: photoError } = await supabase.from('vehicle_photos').insert(
        photos.map((photo) => ({ vehicle_id: vehicleId, photo_url: photo.photo_url, position: photo.position })),
      );
      if (photoError) { toast('Vehicle saved, but its photos could not be attached. Edit the listing and try again.', 'error'); setSaving(false); return; }
    }
    // sync issues
    if (vehicleId) {
      const { error: deleteIssuesError } = await supabase.from('vehicle_issues').delete().eq('vehicle_id', vehicleId);
      if (deleteIssuesError) {
        toast('Vehicle saved, but existing issue notes could not be updated: ' + deleteIssuesError.message, 'error');
        setSaving(false);
        return;
      }
      const issueRows = issues
        .filter((issue) => issue.description.trim())
        .map((issue) => ({ vehicle_id: vehicleId, description: issue.description.trim(), severity: issue.severity }));
      if (issueRows.length > 0) {
        const { error: issueError } = await supabase.from('vehicle_issues').insert(issueRows);
        if (issueError) {
          toast('Vehicle saved, but issue notes could not be attached: ' + issueError.message, 'error');
          setSaving(false);
          return;
        }
      }
    }
    if (profile?.location !== form.location.trim()) {
      const { error: locationError } = await supabase.from('profiles').update({ location: form.location.trim() }).eq('id', user.id);
      if (locationError) {
        toast('Vehicle saved, but your profile location could not be synchronized: ' + locationError.message, 'error');
        setSaving(false);
        return;
      }
      await refreshProfile();
    }
    setSaving(false);
    toast(isEdit ? originalApprovalStatus === 'rejected' ? 'Changes submitted. The listing is pending admin approval again.' : 'Listing changes saved. New photos wait for admin approval.' : 'Vehicle submitted. It will go live after admin approval.');
    navigate('/dashboard');
  };

  if (!isEdit && (!capacity || capacity.used >= capacity.limit)) return <div className="container-content py-8">
    <Link to="/dashboard?tab=vehicles" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> My vehicles</Link>
    <div className="card mx-auto mt-6 max-w-xl p-6">
      {capacity ? <><h1 className="font-display text-xl font-bold">Your {capacity.limit}-car allowance is full</h1><p className="mt-3 text-sm text-ink-600">You have {capacity.used} listings. Owners can list 3 cars by default, including pending listings. To add more, contact admin and request a higher allowance.</p><Link to="/contact?topic=listing-limit" className="btn-primary mt-5">Contact admin to list more cars</Link></> : capacityError ? <><p className="text-sm text-danger">{capacityError}</p><button type="button" onClick={() => void loadCapacity()} className="btn-secondary mt-3">Try again</button></> : <p role="status">Checking your listing allowance…</p>}
    </div>
  </div>;

  return (
    <div className="container-content py-8">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">{isEdit ? 'Edit vehicle' : 'Add a vehicle'}</h1>
      <p className="mt-1 text-sm text-ink-500">New listings stay private until approval. Later text updates stay live; every new photo still requires admin review.</p>
      <p className="mt-2 text-xs text-ink-400"><span className="font-bold text-danger">*</span> Required information</p>

      <div className="mt-6 space-y-6">
        {/* Photos */}
        <Card title="Vehicle photos *" desc="Required: upload at least one clear exterior or interior photo. Every new photo requires admin approval.">
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative h-24 w-32 overflow-hidden rounded-lg ring-1 ring-ink-200">
                <ModeratedImage src={p.photo_url} alt="" className="h-full w-full object-cover" />
                {!p.approved && <span className="absolute bottom-1 left-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{p.rejected ? 'Rejected' : 'Pending'}</span>}
                <button type="button" onClick={() => removePhoto(p)} aria-label="Remove vehicle photo" className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-ink-700 hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <label className={cn('flex h-24 w-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-ink-200 text-ink-400 hover:border-brand-400 hover:text-brand-600', (uploading || preparingPhoto) && 'pointer-events-none opacity-50')}>
              <input type="file" accept="image/*,.heic,.heif" className="hidden" onClick={() => rememberMobileUploadPicker('vehicle-photo')} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void prepareVehiclePhoto(file);
                e.target.value = '';
              }} disabled={uploading || preparingPhoto} />
              <div className="text-center"><Upload className="mx-auto h-5 w-5" /><span className="text-xs">{preparingPhoto ? 'Preparing preview…' : uploading ? 'Uploading…' : 'Add photo'}</span></div>
            </label>
          </div>
          {photoIssue && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/20 dark:text-red-100"><p className="font-semibold">Vehicle photo was not selected</p><p className="mt-1">{photoIssue}</p></div>}
          <p className="mt-3 text-xs text-ink-400">Phone photos, HEIC, HEIF, JPG, PNG, or WebP · compressed before preview · maximum 24 MB</p>
        </Card>

        {/* Basics */}
        <Card title="Vehicle details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make" htmlFor="vehicle-make" required hint="Select the manufacturer first. Changing it clears the model.">
              <select id="vehicle-make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value, model: e.target.value === form.make ? form.model : '' })} className="input">
                <option value="">Select make…</option>
                {VEHICLE_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Model" htmlFor="vehicle-model" required hint="Start typing and choose a suggestion, or enter your exact model if it isn't listed."><VehicleModelInput id="vehicle-model" make={form.make} value={form.model} onChange={(model) => setForm({ ...form, model })} /></Field>
            <Field label="Year" required hint="Enter the vehicle's four-digit manufacture year."><input type="number" min={1900} max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="input" /></Field>
            <Field label="Location" required hint="Enter where the vehicle is normally available.">
              <PlaceAutocomplete value={form.location} onChange={(location) => setForm({ ...form, location })} required />
              <p className="mt-1 text-xs text-ink-400">This is also your owner profile location, so members see one consistent area.</p>
            </Field>
            <Field label="Transmission" required hint="Choose the gearbox type the driver will use.">
              <select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })} className="input">
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
            <Field label="Fuel type" required hint="Choose the vehicle's primary fuel or power type.">
              <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })} className="input">
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="electric">Electric</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Ride-hailing platform readiness" desc="Select every platform this vehicle is already registered or approved to operate on.">
          <div className="flex flex-wrap gap-2">
            {RIDE_HAILING_PLATFORMS.map((platform) => {
              const selected = form.registered_platforms.includes(platform.value);
              return <button key={platform.value} type="button" aria-pressed={selected} onClick={() => setForm({ ...form, registered_platforms: selected ? form.registered_platforms.filter((value) => value !== platform.value) : [...form.registered_platforms, platform.value] })} className={cn('rounded-full px-4 py-2 text-sm font-medium ring-1 transition', selected ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-brand-300 dark:bg-[#141416]')}>{selected ? '✓ ' : ''}{platform.label}</button>;
            })}
          </div>
          {form.registered_platforms.length === 0 && <p className="mt-3 text-xs text-ink-500">No platform readiness selected. Drivers will see “Not registered to a platform yet.”</p>}
        </Card>

        {/* Targets */}
        <Card title="Targets & deposit">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Weekly target (KES)" hint="Enter the amount the driver must remit each week."><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: e.target.value })} className="input" placeholder="e.g. 5000" /></Field>
            <Field label="Monthly target (KES)" hint="Optional alternative monthly amount."><input type="number" value={form.monthly_target} onChange={(e) => setForm({ ...form, monthly_target: e.target.value })} className="input" placeholder="optional" /></Field>
            <Field label="Deposit (KES)" hint="Enter 0 when no deposit is required."><input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} className="input" placeholder="0 if none" /></Field>
          </div>
          <Field label="Availability" hint="Choose whether drivers can currently apply for this vehicle.">
            <select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="input">
              <option value="available">Available now</option>
              <option value="taken">Currently taken</option>
            </select>
          </Field>
        </Card>

        {/* Insurance */}
        <Card title="Insurance" desc="Drivers can see the type and expiry before applying.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance type" hint="Select the cover currently held by the vehicle.">
              <select value={form.insurance_type} onChange={(e) => setForm({ ...form, insurance_type: e.target.value as Vehicle['insurance_type'] })} className="input">
                <option value="third_party">Third party</option>
                <option value="comprehensive">Comprehensive</option>
                <option value="none">None</option>
              </select>
            </Field>
            <Field label="Insurance expiry date" hint="Enter the date shown on the active insurance cover."><input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} className="input" /></Field>
            <Field label="Available from" hint="Choose the earliest date a driver can take the vehicle."><input type="date" value={form.available_from} onChange={(e) => setForm({ ...form, available_from: e.target.value })} className="input" /></Field>
          </div>
        </Card>

        {/* Known issues */}
        <Card title="Known issues" desc="Disclose anything a driver should know so they're not caught unaware." icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}>
          <div className="space-y-3">
            {issues.map((iss, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100 sm:flex-row sm:items-center">
                <input value={iss.description} onChange={(e) => setIssues(issues.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} placeholder="e.g. Left side mirror cracked" className="input flex-1 bg-white dark:bg-[#141416]" />
                <select value={iss.severity} onChange={(e) => setIssues(issues.map((x, i) => i === idx ? { ...x, severity: e.target.value as VehicleIssue['severity'] } : x))} className="input w-auto bg-white dark:bg-[#141416]">
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="major">Major</option>
                </select>
                <button onClick={() => setIssues(issues.filter((_, i) => i !== idx))} className="btn-ghost text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setIssues([...issues, { description: '', severity: 'minor' }])} className="btn-secondary">
              <Plus className="h-4 w-4" /> Add issue
            </button>
          </div>
        </Card>

        {/* Requirements */}
        <Card title="Driver requirements">
          <Field label="Minimum driving experience" hint="Choose the least experience an applicant should have.">
            <select value={form.minimum_driver_experience_years} onChange={(e) => setForm({ ...form, minimum_driver_experience_years: e.target.value })} className="input">
              <option value="0">No minimum</option>
              {Array.from({ length: 16 }, (_, years) => <option key={years + 1} value={years + 1}>{years + 1}+ year{years === 0 ? '' : 's'}</option>)}
            </select>
          </Field>
          <Field label="Other requirements" hint="Optional: add conditions not covered above."><textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={3} className="input" placeholder="e.g. Must have PSV badge, good conduct certificate…" /></Field>
        </Card>

        <div className="flex justify-end gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : isEdit ? originalApprovalStatus === 'rejected' ? 'Save & resubmit for approval' : 'Save listing changes' : 'Submit for approval'}</button>
        </div>
      </div>
      {photoForPrivacyReview && (
        <PlatePrivacyEditor
          file={photoForPrivacyReview}
          onCancel={() => setPhotoForPrivacyReview(null)}
          onUploadOriginal={() => { const file = photoForPrivacyReview; setPhotoForPrivacyReview(null); uploadPhoto(file); }}
          onComplete={(file) => { setPhotoForPrivacyReview(null); uploadPhoto(file); }}
        />
      )}
    </div>
  );
}

function Card({ title, desc, icon, children }: { title: string; desc?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
          {desc && <p className="text-xs text-ink-500">{desc}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Field({ label, children, hint, required = false, htmlFor }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="label">{label} {required && <span className="text-danger">*</span>}</label>
      {children}
      {hint && <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
