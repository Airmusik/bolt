import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, AlertTriangle, Upload, X, ArrowLeft } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { Vehicle, VehicleIssue, VehiclePhoto } from '@/lib/types';
import { ALL_LOCATIONS, VEHICLE_MAKES } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { useSiteSettings } from '@/lib/siteSettings';
import { ModeratedImage } from '@/components/ModeratedImage';

interface IssueDraft { id?: string; description: string; severity: 'minor' | 'moderate' | 'major' }

export function VehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const isEdit = Boolean(id);
  const { settings } = useSiteSettings();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    make: '', model: '', year: new Date().getFullYear(), transmission: 'automatic', fuel_type: 'petrol',
    location: '', weekly_target: '', monthly_target: '', deposit: '', driver_experience: '', requirements: '',
    availability: 'available', insurance_type: 'third_party', insurance_expiry: '',
    available_from: new Date().toISOString().slice(0, 10),
  });
  const [issues, setIssues] = useState<IssueDraft[]>([]);
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [uploading, setUploading] = useState(false);

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
        setForm({
          make: veh.make, model: veh.model, year: veh.year, transmission: veh.transmission, fuel_type: veh.fuel_type,
          location: veh.location, weekly_target: veh.weekly_target?.toString() || '', monthly_target: veh.monthly_target?.toString() || '',
          deposit: veh.deposit?.toString() || '', driver_experience: veh.driver_experience || '', requirements: veh.requirements || '',
          availability: veh.availability, insurance_type: veh.insurance_type, insurance_expiry: veh.insurance_expiry || '',
          available_from: veh.available_from || new Date().toISOString().slice(0, 10),
        });
      }
      setIssues(((iss as VehicleIssue[]) || []).map((i) => ({ id: i.id, description: i.description, severity: i.severity })));
      setPhotos((ph as VehiclePhoto[]) || []);
    })();
  }, [id]);

  const uploadPhoto = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
    if (error) { toast('Upload failed: ' + error.message, 'error'); setUploading(false); return; }
    const { data: pub } = supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(path);
    if (isEdit && id) {
      const { data } = await supabase.from('vehicle_photos').insert({ vehicle_id: id, photo_url: pub.publicUrl, position: photos.length }).select().maybeSingle();
      if (data) setPhotos((p) => [...p, data as VehiclePhoto]);
    } else {
      // store locally until vehicle is created
      setPhotos((p) => [...p, { id: 'temp-' + Date.now(), vehicle_id: '', photo_url: pub.publicUrl, position: p.length, approved: false, rejected: false, rejection_reason: null, created_at: '' }]);
    }
    setUploading(false);
  };

  const removePhoto = async (photo: VehiclePhoto) => {
    if (isEdit && id && !photo.id.startsWith('temp-')) {
      await supabase.from('vehicle_photos').delete().eq('id', photo.id);
    }
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
  };

  const save = async () => {
    if (!user) return;
    if (!form.make || !form.model || !form.location) { toast('Make, model and location are required.', 'error'); return; }
    if (photos.length === 0) { toast('At least one vehicle photo is required for security.', 'error'); return; }
    if (!isEdit) {
      const maxVehicles = Number(settings.max_vehicles_per_owner || 10);
      const { count, error } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id);
      if (error) { toast('Could not verify vehicle limit: ' + error.message, 'error'); return; }
      if ((count ?? 0) >= maxVehicles) {
        toast(`You can list up to ${maxVehicles} vehicles with the current site settings.`, 'error');
        return;
      }
    }
    setSaving(true);
    const payload = {
      owner_id: user.id,
      make: form.make, model: form.model, year: Number(form.year),
      transmission: form.transmission, fuel_type: form.fuel_type, location: form.location,
      weekly_target: form.weekly_target ? Number(form.weekly_target) : null,
      monthly_target: form.monthly_target ? Number(form.monthly_target) : null,
      deposit: form.deposit ? Number(form.deposit) : 0,
      driver_experience: form.driver_experience || null,
      requirements: form.requirements || null,
      availability: form.availability,
      insurance_type: form.insurance_type,
      insurance_expiry: form.insurance_expiry || null,
      available_from: form.available_from || null,
    };
    let vehicleId = id;
    if (isEdit && id) {
      await supabase.from('vehicles').update(payload).eq('id', id);
    } else {
      const { data, error } = await supabase.from('vehicles').insert(payload).select().maybeSingle();
      if (error || !data) { toast('Could not save vehicle: ' + (error?.message || ''), 'error'); setSaving(false); return; }
      vehicleId = (data as Vehicle).id;
      // persist temp photos
      for (const p of photos) {
        await supabase.from('vehicle_photos').insert({ vehicle_id: vehicleId, photo_url: p.photo_url, position: p.position });
      }
    }
    // sync issues
    if (vehicleId) {
      await supabase.from('vehicle_issues').delete().eq('vehicle_id', vehicleId);
      for (const iss of issues) {
        if (iss.description.trim()) {
          await supabase.from('vehicle_issues').insert({ vehicle_id: vehicleId, description: iss.description, severity: iss.severity });
        }
      }
    }
    setSaving(false);
    toast('Vehicle saved. New photos will appear publicly after admin approval.');
    navigate(`/vehicles/${vehicleId}`);
  };

  return (
    <div className="container-content py-8">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">{isEdit ? 'Edit vehicle' : 'Add a vehicle'}</h1>
      <p className="mt-1 text-sm text-ink-500">Be transparent about issues and insurance — drivers trust honest listings.</p>

      <div className="mt-6 space-y-6">
        {/* Photos */}
        <Card title="Vehicle photos" desc="Upload clear photos of the exterior and interior. Every new photo requires admin approval.">
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative h-24 w-32 overflow-hidden rounded-lg ring-1 ring-ink-200">
                <ModeratedImage src={p.photo_url} alt="" className="h-full w-full object-cover" />
                {!p.approved && <span className="absolute bottom-1 left-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{p.rejected ? 'Rejected' : 'Pending'}</span>}
                <button onClick={() => removePhoto(p)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-ink-700 hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <label className={cn('flex h-24 w-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-ink-200 text-ink-400 hover:border-brand-400 hover:text-brand-600', uploading && 'opacity-50')}>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }} disabled={uploading} />
              <div className="text-center"><Upload className="mx-auto h-5 w-5" /><span className="text-xs">{uploading ? 'Uploading…' : 'Add photo'}</span></div>
            </label>
          </div>
        </Card>

        {/* Basics */}
        <Card title="Vehicle details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make">
              <select value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="input">
                <option value="">Select make…</option>
                {VEHICLE_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Model"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" placeholder="e.g. Axio, Fielder, Note" /></Field>
            <Field label="Year"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="input" /></Field>
            <Field label="Location">
              <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input">
                <option value="">Select location…</option>
                {ALL_LOCATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Transmission">
              <select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })} className="input">
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
            <Field label="Fuel type">
              <select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })} className="input">
                <option value="petrol">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="hybrid">Hybrid</option>
                <option value="electric">Electric</option>
              </select>
            </Field>
          </div>
        </Card>

        {/* Targets */}
        <Card title="Targets & deposit">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Weekly target (KES)"><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: e.target.value })} className="input" placeholder="e.g. 5000" /></Field>
            <Field label="Monthly target (KES)"><input type="number" value={form.monthly_target} onChange={(e) => setForm({ ...form, monthly_target: e.target.value })} className="input" placeholder="optional" /></Field>
            <Field label="Deposit (KES)"><input type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} className="input" placeholder="0 if none" /></Field>
          </div>
          <Field label="Availability">
            <select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="input">
              <option value="available">Available now</option>
              <option value="taken">Currently taken</option>
            </select>
          </Field>
        </Card>

        {/* Insurance */}
        <Card title="Insurance" desc="Drivers can see the type and expiry before applying.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance type">
              <select value={form.insurance_type} onChange={(e) => setForm({ ...form, insurance_type: e.target.value as Vehicle['insurance_type'] })} className="input">
                <option value="third_party">Third party</option>
                <option value="comprehensive">Comprehensive</option>
                <option value="none">None</option>
              </select>
            </Field>
            <Field label="Insurance expiry date"><input type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} className="input" /></Field>
            <Field label="Available from"><input type="date" value={form.available_from} onChange={(e) => setForm({ ...form, available_from: e.target.value })} className="input" /></Field>
          </div>
        </Card>

        {/* Known issues */}
        <Card title="Known issues" desc="Disclose anything a driver should know so they're not caught unaware." icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}>
          <div className="space-y-3">
            {issues.map((iss, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100 sm:flex-row sm:items-center">
                <input value={iss.description} onChange={(e) => setIssues(issues.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} placeholder="e.g. Left side mirror cracked" className="input flex-1 bg-white" />
                <select value={iss.severity} onChange={(e) => setIssues(issues.map((x, i) => i === idx ? { ...x, severity: e.target.value as VehicleIssue['severity'] } : x))} className="input w-auto bg-white">
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
          <Field label="Experience required"><input value={form.driver_experience} onChange={(e) => setForm({ ...form, driver_experience: e.target.value })} className="input" placeholder="e.g. 2+ years on Uber" /></Field>
          <Field label="Other requirements"><textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={3} className="input" placeholder="e.g. Must have PSV badge, good conduct certificate…" /></Field>
        </Card>

        <div className="flex justify-end gap-3">
          <button onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Publish vehicle')}</button>
        </div>
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
