import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  MapPin, Fuel, Settings2, Wallet, Calendar, ShieldCheck, AlertTriangle,
  Heart, Share2, Flag, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { VehicleWithRelations, Review } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ConnectionButton } from '@/components/ConnectionButton';
import { formatKES, formatDate, timeAgo, expiryStatus, titleCase, cn } from '@/lib/utils';
import { useSiteSettings } from '@/lib/siteSettings';

export function VehicleDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { settings } = useSiteSettings();

  const [vehicle, setVehicle] = useState<VehicleWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [favId, setFavId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('vehicles')
        .select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`)
        .eq('id', id)
        .maybeSingle();
      setVehicle(data as VehicleWithRelations);
      if (data) {
        const { data: revs } = await supabase
          .from('reviews')
          .select(`*, reviewer:profiles(${PUBLIC_PROFILE_FIELDS})`)
          .eq('reviewee_id', (data as VehicleWithRelations).owner_id)
          .order('created_at', { ascending: false });
        setReviews((revs as Review[]) || []);
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!user || !vehicle) return;
    (async () => {
      const { data: fav } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('vehicle_id', vehicle.id)
        .maybeSingle();
      if (fav) { setSaved(true); setFavId(fav.id); }
    })();
  }, [user, vehicle, profile]);

  const toggleSave = async () => {
    if (!user) { navigate('/login', { state: { from: `/vehicles/${id}` } }); return; }
    if (saved && favId) {
      const { error } = await supabase.from('favorites').delete().eq('id', favId);
      if (error) { toast('Could not remove this vehicle from saved items.', 'error'); return; }
      setSaved(false); setFavId(null);
      toast('Removed from saved.');
    } else {
      const { data, error } = await supabase.from('favorites').insert({ user_id: user.id, vehicle_id: vehicle!.id }).select().maybeSingle();
      if (error) { toast('Could not save this vehicle: ' + error.message, 'error'); return; }
      if (data) { setSaved(true); setFavId(data.id); toast('Saved to your favourites.'); }
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${vehicle?.make} ${vehicle?.model} on ${settings.site_name}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('Link copied to clipboard.');
      }
    } catch { /* user cancelled */ }
  };

  if (loading) {
    return (
      <div className="container-content py-8">
        <div className="card h-96 animate-pulse" />
      </div>
    );
  }
  if (!vehicle) {
    return (
      <div className="container-content py-12">
        <EmptyState title="Vehicle not found" description="This listing may have been removed." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />
      </div>
    );
  }

  const isOwner = user?.id === vehicle.owner_id;
  const insStatus = expiryStatus(vehicle.insurance_expiry);
  const photos = vehicle.photos?.length ? vehicle.photos : [];

  return (
    <div className="container-content py-6 md:py-8">
      <Link to="/browse-cars" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div>
          {/* Gallery */}
          <div className="overflow-hidden rounded-2xl bg-ink-100">
            {photos.length > 0 ? (
              <>
                <div className="aspect-[16/10] bg-ink-100">
                  <img src={photos[activePhoto]?.photo_url} alt={`${vehicle.make} ${vehicle.model}`} className="h-full w-full object-cover" />
                </div>
                {photos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto p-3">
                    {photos.map((p, i) => (
                      <button key={p.id} onClick={() => setActivePhoto(i)} className={cn('h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2', i === activePhoto ? 'ring-brand-500' : 'ring-transparent')}>
                        <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex aspect-[16/10] items-center justify-center text-ink-400">No photos uploaded</div>
            )}
          </div>

          {/* Title + actions */}
          <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                {vehicle.make} {vehicle.model}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{vehicle.year} · {titleCase(vehicle.transmission)} · {titleCase(vehicle.fuel_type)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleSave} className={cn('btn-secondary', saved && 'text-brand-700 ring-brand-300')}>
                <Heart className={cn('h-4 w-4', saved && 'fill-brand-600 text-brand-600')} /> {saved ? 'Saved' : 'Save'}
              </button>
              <button onClick={handleShare} className="btn-secondary"><Share2 className="h-4 w-4" /> Share</button>
              <button onClick={() => setShowReport(true)} aria-label="Report vehicle" className="btn-ghost text-ink-500"><Flag className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Key facts */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact icon={<MapPin className="h-4 w-4" />} label="Location" value={vehicle.location} />
            <Fact icon={<Settings2 className="h-4 w-4" />} label="Transmission" value={titleCase(vehicle.transmission)} />
            <Fact icon={<Fuel className="h-4 w-4" />} label="Fuel" value={titleCase(vehicle.fuel_type)} />
            <Fact icon={<Calendar className="h-4 w-4" />} label="Posted" value={timeAgo(vehicle.created_at)} />
          </div>

          <Section title="Ride-hailing platform readiness">
            {vehicle.registered_platforms?.length ? (
              <div className="flex flex-wrap gap-2">
                {vehicle.registered_platforms.map((platform) => (
                  <span key={platform} className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900">
                    {platform === 'little' ? 'Little Cab ready' : platform === 'other' ? 'Other platform' : `${titleCase(platform)} ready`}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">Not registered to a ride-hailing platform yet.</p>
            )}
          </Section>

          {/* Targets */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vehicle.weekly_target != null && <Fact icon={<Wallet className="h-4 w-4" />} label="Weekly target" value={formatKES(vehicle.weekly_target)} />}
            {vehicle.monthly_target != null && <Fact icon={<Wallet className="h-4 w-4" />} label="Monthly target" value={formatKES(vehicle.monthly_target)} />}
            <Fact icon={<Wallet className="h-4 w-4" />} label="Deposit" value={vehicle.deposit > 0 ? formatKES(vehicle.deposit) : 'None'} />
          </div>

          {/* Insurance */}
          <Section title="Insurance">
            <div className="flex items-center gap-2">
              <ShieldCheck className={cn('h-5 w-5', insStatus === 'valid' && 'text-brand-600', insStatus === 'soon' && 'text-amber-500', insStatus === 'expired' && 'text-danger', insStatus === 'none' && 'text-ink-300')} />
              <div>
                <p className="font-medium text-ink-900">{titleCase(vehicle.insurance_type)} insurance</p>
                <p className="text-xs text-ink-500">
                  {vehicle.insurance_expiry ? `Expires ${formatDate(vehicle.insurance_expiry)}` : 'No expiry date provided'}
                  {insStatus === 'soon' && <span className="text-amber-600"> · expiring soon</span>}
                  {insStatus === 'expired' && <span className="text-danger"> · expired</span>}
                </p>
              </div>
            </div>
          </Section>

          {/* Known issues */}
          <Section title="Known issues" icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}>
            {vehicle.issues?.length ? (
              <ul className="space-y-2">
                {vehicle.issues.map((iss) => (
                  <li key={iss.id} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-amber-100">
                    <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', iss.severity === 'minor' && 'bg-amber-400', iss.severity === 'moderate' && 'bg-orange-500', iss.severity === 'major' && 'bg-red-500')} />
                    <div>
                      <p>{iss.description}</p>
                      <p className="text-xs capitalize text-ink-400">{iss.severity} severity</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">The owner has not reported any known issues with this vehicle.</p>
            )}
          </Section>

          {/* Requirements */}
          {(vehicle.minimum_driver_experience_years > 0 || vehicle.driver_experience || vehicle.requirements) && (
            <Section title="Driver requirements">
              {(vehicle.minimum_driver_experience_years > 0 || vehicle.driver_experience) && <p className="text-sm text-ink-700"><span className="font-medium">Minimum experience:</span> {vehicle.minimum_driver_experience_years > 0 ? `${vehicle.minimum_driver_experience_years}+ ${vehicle.minimum_driver_experience_years === 1 ? 'year' : 'years'}` : vehicle.driver_experience}</p>}
              {vehicle.requirements && <p className="mt-1 text-sm text-ink-700">{vehicle.requirements}</p>}
            </Section>
          )}

          {/* Owner reviews */}
          <Section title={`Reviews of ${vehicle.owner?.full_name}`}>
            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-ink-100 pb-4 last:border-0">
                    <div className="flex items-center gap-2">
                      <Avatar name={r.reviewer?.full_name || 'User'} src={r.reviewer?.avatar_url} size={32} />
                      <div>
                        <p className="text-sm font-medium text-ink-900">{r.reviewer?.full_name}</p>
                        <p className="text-xs text-ink-400">{timeAgo(r.created_at)}</p>
                      </div>
                      <Rating value={r.rating} size={12} className="ml-auto" />
                    </div>
                    {r.content && <p className="mt-2 text-sm text-ink-700">{r.content}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">No reviews yet. Reviews appear after a completed match.</p>
            )}
          </Section>
        </div>

        {/* RIGHT — sticky sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            {vehicle.weekly_target != null && (
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-display text-2xl font-bold text-ink-900">{formatKES(vehicle.weekly_target)}</p>
                  <p className="text-xs text-ink-500">weekly target</p>
                </div>
                {vehicle.deposit > 0 && (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink-800">{formatKES(vehicle.deposit)}</p>
                    <p className="text-xs text-ink-500">deposit</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
              {vehicle.availability === 'available'
                ? <><CheckCircle2 className="h-4 w-4 text-brand-600" /><span className="text-brand-700 font-medium">Available now</span></>
                : <><span className="h-2 w-2 rounded-full bg-amber-500" /><span className="text-amber-700 font-medium">Currently taken</span></>}
            </div>

            {/* Owner card */}
            {vehicle.owner && (
              <Link to={`/members/${vehicle.owner.id}`} className="mt-4 flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:bg-ink-50">
                <Avatar name={vehicle.owner.full_name} src={vehicle.owner.avatar_url} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">
                    {vehicle.owner.full_name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-success"><ShieldCheck className="h-3.5 w-3.5" /> Vehicle photos reviewed by admin</p>
                  <p className="mt-1 text-xs text-ink-500">{vehicle.owner.location || 'Location not provided'}</p>
                  <Rating value={vehicle.owner.rating} size={11} showValue count={vehicle.owner.rating_count} />
                </div>
                <span className="ml-auto text-xs font-semibold text-brand-700">View owner</span>
              </Link>
            )}

            {/* Actions */}
            <div className="mt-5 space-y-2">
              {isOwner ? (
                <Link to={`/vehicles/${vehicle.id}/edit`} className="btn-secondary w-full">Edit listing</Link>
              ) : (
                <ConnectionButton otherUserId={vehicle.owner_id} vehicleId={vehicle.id} className="w-full" />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Report modal */}
      {showReport && (
        <ReportModal
          targetType="listing"
          targetId={vehicle.id}
          reportedId={vehicle.owner_id}
          onClose={() => setShowReport(false)}
          onDone={() => { setShowReport(false); toast('Report submitted. Our team will review it.'); }}
        />
      )}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-ink-100 dark:bg-[#141416]">
      <p className="flex items-center gap-1.5 text-xs text-ink-400">{icon} {label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">{icon}{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ReportModal({ targetType, targetId, reportedId, onClose, onDone }: { targetType: 'user' | 'listing' | 'conversation' | 'review'; targetId: string; reportedId: string; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id, reported_id: reportedId, target_type: targetType, target_id: targetId, reason, description: desc,
    });
    setLoading(false);
    if (error) { toast('Could not submit report: ' + error.message, 'error'); return; }
    onDone();
  };

  return (
    <Modal title="Report" onClose={onClose}>
      <div>
        <label className="label">Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="input">
          <option value="">Select a reason…</option>
          <option>Fraud or scam</option>
          <option>Fake listing</option>
          <option>Abusive behaviour</option>
          <option>Spam</option>
          <option>Other</option>
        </select>
      </div>
      <div className="mt-4">
        <label className="label">Details (optional)</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="input" placeholder="Tell us what happened…" />
      </div>
      <button onClick={submit} disabled={loading || !reason} className="btn-danger mt-4 w-full">{loading ? 'Submitting…' : 'Submit report'}</button>
    </Modal>
  );
}
