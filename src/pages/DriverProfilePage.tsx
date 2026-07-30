import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Languages, Briefcase, Calendar, ShieldCheck, Star, Flag, ArrowLeft, BadgeCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Profile, PlatformHistory, Review, DocumentRow } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ConnectionButton } from '@/components/ConnectionButton';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { ReportModal } from './VehicleDetailsPage';
import { formatDate, expiryStatus, titleCase, timeAgo, cn } from '@/lib/utils';

export function DriverProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: p }, { data: h }, { data: r }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('driver_platform_history').select('*').eq('driver_id', id),
        supabase.from('reviews').select('*, reviewer:profiles(*)').eq('reviewee_id', id).order('created_at', { ascending: false }),
      ]);
      setProfile(p as Profile);
      setHistory((h as PlatformHistory[]) || []);
      setReviews((r as Review[]) || []);
      // Only load private docs if viewing own profile
      if (user?.id === id) {
        const { data: d } = await supabase.from('documents').select('*').eq('user_id', id);
        setDocs((d as DocumentRow[]) || []);
      }
      setLoading(false);
    })();
  }, [id, user]);

  if (loading) return <div className="container-content py-8"><div className="card h-96 animate-pulse" /></div>;
  if (!profile) return <div className="container-content py-12"><EmptyState title="Profile not found" /></div>;

  const isOwner = profile.role === 'owner';
  const licenceStatus = expiryStatus(profile.licence_expiry);
  const psvStatus = expiryStatus(profile.psv_badge_expiry);
  const gcStatus = expiryStatus(profile.good_conduct_expiry);

  return (
    <div className="container-content py-6 md:py-8">
      <Link to={isOwner ? '/browse-cars' : '/browse-drivers'} className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Header card */}
          <div className="card p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Avatar name={profile.full_name} src={profile.avatar_url} size={88} verified={profile.is_verified} />
              <div className="flex-1">
                <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink-900">
                  {profile.full_name} <VerifiedBadge verified={profile.is_verified} size={18} showLabel />
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {profile.location || 'Kenya'}</span>
                  {profile.age && <span>{profile.age} years old</span>}
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" /> {profile.driving_experience_years} yrs experience</span>
                </div>
                <Rating value={profile.rating} size={15} showValue count={profile.rating_count} className="mt-2" />
                <div className="mt-2">
                  <AvailabilityBadge availability={profile.availability} size="md" />
                </div>
              </div>
              {user?.id !== profile.id && (
                <button onClick={() => setShowReport(true)} className="btn-ghost text-ink-500"><Flag className="h-4 w-4" /> Report</button>
              )}
            </div>

            {profile.bio && <p className="mt-5 text-sm text-ink-700">{profile.bio}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="badge-brand"><BadgeCheck className="h-3.5 w-3.5" /> {profile.contracts_completed} contracts completed</span>
              {(profile.platforms_worked || []).map((p) => <span key={p} className="badge-neutral">{titleCase(p)}</span>)}
            </div>
          </div>

          {/* Languages */}
          {profile.languages?.length > 0 && (
            <Section title="Languages" icon={<Languages className="h-5 w-5" />}>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((l) => <span key={l} className="badge-neutral">{l}</span>)}
              </div>
            </Section>
          )}

          {/* Platform history */}
          {history.length > 0 && (
            <Section title="Platform history (last 5 months)">
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-ink-100">
                    <div>
                      <p className="font-semibold text-ink-900">{titleCase(h.platform)}</p>
                      <p className="text-xs text-ink-500">{h.months_active} months active · {h.trips} trips</p>
                    </div>
                    {h.rating != null && (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-semibold">{h.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Document expiry summary (public) */}
          <Section title="Document status" icon={<ShieldCheck className="h-5 w-5" />}>
            <div className="grid gap-2 sm:grid-cols-3">
              <DocExpiry label="Driving licence" expiry={profile.licence_expiry} status={licenceStatus} />
              <DocExpiry label="PSV badge" expiry={profile.psv_badge_expiry} status={psvStatus} />
              <DocExpiry label="Good conduct" expiry={profile.good_conduct_expiry} status={gcStatus} />
            </div>
            <p className="mt-2 text-xs text-ink-400">Expiry dates are shown so owners know when documents need renewal.</p>
          </Section>

          {/* Reviews */}
          <Section title={`Reviews (${reviews.length})`} icon={<Star className="h-5 w-5" />}>
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
            ) : <p className="text-sm text-ink-500">No reviews yet.</p>}
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <h3 className="font-semibold text-ink-900">Contact</h3>
            <p className="mt-1 text-sm text-ink-500">
              {user ? 'Start a conversation after an accepted application.' : 'Sign in to connect with this member.'}
            </p>
            {!user && <Link to="/login" className="btn-primary mt-3 w-full">Sign in</Link>}
            {user && user.id !== profile.id && (
              <Link to="/browse-cars" className="btn-primary mt-3 w-full">Apply to vehicles</Link>
            )}
          </div>
        </aside>
      </div>

      {showReport && (
        <ReportModal targetType="user" targetId={profile.id} reportedId={profile.id} onClose={() => setShowReport(false)} onDone={() => { setShowReport(false); }} />
      )}
    </div>
  );
}

function DocExpiry({ label, expiry, status }: { label: string; expiry: string | null; status: 'valid' | 'soon' | 'expired' | 'none' }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-ink-100">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold', status === 'valid' && 'text-brand-700', status === 'soon' && 'text-amber-600', status === 'expired' && 'text-danger', status === 'none' && 'text-ink-400')}>
        {expiry ? formatDate(expiry) : 'Not provided'}
      </p>
      <p className="text-xs capitalize text-ink-400">{status === 'none' ? '—' : status === 'valid' ? 'valid' : status}</p>
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
