import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Languages, Briefcase, ShieldCheck, Star, Flag, CalendarDays, Award, Mail } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { supabase } from '@/lib/supabase';
import { BROWSE_PROFILE_FIELDS } from '@/lib/profileSelect';
import { useAuth } from '@/lib/useAuth';
import type { Profile, PlatformHistory, Review, TrustPassport } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { ConnectionButton } from '@/components/ConnectionButton';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { ReportModal } from './VehicleDetailsPage';
import { titleCase, timeAgo } from '@/lib/utils';
import { AccountStanding } from '@/components/AccountStanding';
import { MemberSafetyNotice } from '@/components/MemberSafetyNotice';

export function DriverProfilePage() {
  const { id } = useParams();
  const { user, profile: signedInProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<PlatformHistory[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trustPassport, setTrustPassport] = useState<TrustPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showReport, setShowReport] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    const profileRequest = user?.id === id
      ? supabase.rpc('get_my_profile').maybeSingle()
      : supabase.from('profiles').select(BROWSE_PROFILE_FIELDS).eq('id', id).in('role', ['driver', 'owner']).maybeSingle();
    const [profileResult, historyResult, reviewsResult, trustResult] = await Promise.all([
      profileRequest,
      supabase.rpc('public_platform_history', { p_driver_id: id }),
      supabase.from('reviews').select(`*, reviewer:profiles(${BROWSE_PROFILE_FIELDS})`).eq('reviewee_id', id).order('created_at', { ascending: false }),
      supabase.rpc('get_trust_passport', { p_user_id: id }).maybeSingle(),
    ]);
    if (profileResult.error) {
      setProfile(null);
      setLoadError(profileResult.error.message);
      setLoading(false);
      return;
    }
    setProfile(profileResult.data as Profile | null);
    setHistory((historyResult.data as PlatformHistory[]) || []);
    setReviews((reviewsResult.data as Review[]) || []);
    setTrustPassport(trustResult.data as TrustPassport | null);
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  if (loading) return <div className="container-content py-8"><div className="card h-96 animate-pulse" /></div>;
  if (loadError) return <div className="container-content py-12"><EmptyState title="Could not load this profile" description="Check your connection and try again." action={<button type="button" onClick={() => void loadProfile()} className="btn-primary">Try again</button>} /></div>;
  if (!profile) return <div className="container-content py-12"><EmptyState title="Profile not found" /></div>;
  if (profile.role === 'admin') return <div className="container-content py-12"><EmptyState title="Support has no member profile" description="Use Messages to speak with the support team." action={<Link to="/contact" className="btn-primary">Contact support</Link>} /></div>;
  if (profile.document_listing_visibility && profile.document_listing_visibility !== 'public' && user?.id !== profile.id && signedInProfile?.role !== 'admin') return <div className="container-content py-12"><EmptyState title="Driver listing not public" description="This listing is not currently available. Existing conversations remain saved in Chats." action={<Link to="/chat" className="btn-secondary">Open chats</Link>} /></div>;
  if (profile.role === 'driver' && !profile.onboarding_completed && user?.id !== profile.id) return <div className="container-content py-12"><EmptyState title="Profile not public yet" description="This driver is still completing their About You information." /></div>;

  const isOwner = profile.role === 'owner';
  return (
    <div className="container-content py-6 md:py-8">
      <BackButton to={isOwner ? '/browse-cars' : '/browse-drivers'} />

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Header card */}
          <div className="card border-t-4 border-t-emerald-400 p-4 sm:p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Avatar name={profile.full_name} src={profile.avatar_url} size={88} verified={!isOwner && profile.platform_history_approved} />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">{profile.role} profile</p>
                <h1 className="flex flex-wrap items-center gap-2 break-words font-display text-2xl font-bold text-ink-900">
                  {profile.full_name} {!isOwner && <VerifiedBadge verified={profile.platform_history_approved} size={18} showLabel />}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {profile.location || 'Location not provided'}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700 ring-1 ring-brand-100"><CalendarDays className="h-4 w-4" /> Member since {new Date(profile.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</span>
                  {user?.id === profile.id && profile.email && <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" /> {profile.email} <span className="text-xs">(only you can see this)</span></span>}
                  {!isOwner && profile.age && <span>{profile.age} years old</span>}
                  {!isOwner && <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" /> {profile.driving_experience_years} {profile.driving_experience_years === 1 ? 'year' : 'years'} experience</span>}
                </div>
                <Rating value={profile.rating} size={15} showValue count={profile.rating_count} className="mt-2" />
                {!isOwner && <div className="mt-2">
                  <AvailabilityBadge availability={profile.availability} profile={profile} size="md" />
                </div>}
              </div>
              {user?.id !== profile.id && (
                <button onClick={() => setShowReport(true)} className="btn-ghost text-ink-500"><Flag className="h-4 w-4" /> Report</button>
              )}
            </div>

            {profile.bio && <p className="mt-5 text-sm text-ink-700">{profile.bio}</p>}

            {!isOwner && <div className="mt-5 flex flex-wrap gap-2">
              {!isOwner && (profile.platforms_worked || []).map((p) => <span key={p} className="badge-neutral">{titleCase(p)}</span>)}
            </div>}
          </div>

          {user?.id === profile.id && <AccountStanding key={profile.id} />}
          {user?.id === profile.id && profile.role === 'driver' && !profile.onboarding_completed && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Your profile is not public yet. <Link to="/onboarding" className="font-semibold underline">Complete About You</Link> to publish it.</div>}

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
                  <div key={h.id} className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-ink-100 dark:bg-[#141416]">
                    <div>
                      <p className="font-semibold text-ink-900">{titleCase(h.platform)}</p>
                      <p className="text-xs text-ink-500">{h.months_active} {h.months_active === 1 ? 'month' : 'months'} active</p>
                      <p className="text-xs text-success"><ShieldCheck className="mr-1 inline h-3 w-3" /> Activity approved by admin</p>
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

          {!isOwner && (
            <Section title="Trust Passport" icon={<ShieldCheck className="h-5 w-5" />}>
              <p className="mb-3 text-sm text-ink-500">Trust is based on transparent activity and admin-approved evidence—not identity documents.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <TrustSignal icon={<Award className="h-4 w-4" />} label="Trust level" value={titleCase(trustPassport?.trust_level || 'new')} />
                <TrustSignal icon={<ShieldCheck className="h-4 w-4" />} label="Approved evidence" value={String(trustPassport?.approved_evidence ?? 0)} />
                <TrustSignal icon={<ShieldCheck className="h-4 w-4" />} label="Account standing" value={trustPassport?.account_standing === 'restricted' ? 'Restricted' : 'Good standing'} />
              </div>
            </Section>
          )}

          <MemberSafetyNotice />
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
              <ConnectionButton otherUserId={profile.id} className="w-full" />
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

function TrustSignal({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-ink-100 dark:bg-[#141416]">
      <p className="flex items-center gap-1 text-xs text-ink-400">{icon}{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-800">{value}</p>
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
