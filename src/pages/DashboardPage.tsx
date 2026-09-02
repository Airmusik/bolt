import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Car, Users, MessageSquare, Star, Plus, Check, X, Clock, BadgeCheck, Link2, MapPin, Briefcase, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { VehicleWithRelations, Application, Profile, Conversation, Connection } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { updateConnectionStatus, endConnection } from '@/lib/connections';
import { timeAgo, titleCase, cn, formatDateTime } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import type { ToastType } from '@/components/toastContext';
import { useSiteSettings } from '@/lib/siteSettings';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Tab = 'overview' | 'drivers' | 'vehicles' | 'cars' | 'applications' | 'connections' | 'chats';
type OwnerApplication = Application & { driver?: Profile; vehicle?: VehicleWithRelations };
type DriverApplication = Application & { vehicle?: VehicleWithRelations };
type ConversationWithRelations = Conversation & { vehicle?: VehicleWithRelations; driver?: Profile; owner?: Profile };
type IncomingConnection = Connection & { requester?: Profile };
type OutgoingConnection = Connection & { recipient?: Profile };
type ToastFn = (message: string, type?: ToastType) => void;

export function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return requested && ['overview', 'drivers', 'vehicles', 'cars', 'applications', 'connections', 'chats'].includes(requested)
      ? requested as Tab
      : 'overview';
  });

  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [myApplications, setMyApplications] = useState<DriverApplication[]>([]);
  const [conversations, setConversations] = useState<ConversationWithRelations[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [availableCars, setAvailableCars] = useState<VehicleWithRelations[]>([]);
  const [incomingConnections, setIncomingConnections] = useState<IncomingConnection[]>([]);
  const [outgoingConnections, setOutgoingConnections] = useState<OutgoingConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    if (profile.role === 'owner') {
      const [{ data: v }, { data: apps }, { data: drs }] = await Promise.all([
        supabase.from('vehicles').select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`).eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('applications').select(`*, driver:profiles(${PUBLIC_PROFILE_FIELDS}), vehicle:vehicles(*, photos:vehicle_photos(*))`).eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('role', 'driver').eq('onboarding_completed', true).order('is_verified', { ascending: false }).order('rating', { ascending: false }).order('created_at', { ascending: false }).limit(24),
      ]);
      setVehicles((v as VehicleWithRelations[]) || []);
      setApplications((apps as OwnerApplication[]) || []);
      setDrivers((drs as Profile[]) || []);
    } else if (profile.role === 'driver') {
      const { data: apps } = await supabase
        .from('applications')
        .select(`*, vehicle:vehicles(*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*))`)
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });
      setMyApplications((apps as DriverApplication[]) || []);
      const { data: cars } = await supabase
        .from('vehicles')
        .select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(24);
      setAvailableCars((cars as VehicleWithRelations[]) || []);
    }
    const { data: convs, error: conversationsError } = await supabase
      .from('conversations')
      .select(`*, vehicle:vehicles(*, photos:vehicle_photos(*)), driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (conversationsError) toast('Could not load chat history: ' + conversationsError.message, 'error');
    setConversations((convs as ConversationWithRelations[]) || []);

    // connections
    const [{ data: inc }, { data: out }] = await Promise.all([
      supabase.from('connections').select(`*, requester:profiles!connections_requester_id_fkey(${PUBLIC_PROFILE_FIELDS})`).eq('recipient_id', user.id).order('created_at', { ascending: false }),
      supabase.from('connections').select(`*, recipient:profiles!connections_recipient_id_fkey(${PUBLIC_PROFILE_FIELDS})`).eq('requester_id', user.id).order('created_at', { ascending: false }),
    ]);
    setIncomingConnections((inc as IncomingConnection[]) || []);
    setOutgoingConnections((out as OutgoingConnection[]) || []);

    setLoading(false);
  }, [user, profile, toast]);

  useEffect(() => { load(); }, [load]);

  if (!profile) return null;
  const isOwner = profile.role === 'owner';
  const isDriver = profile.role === 'driver';
  const pendingConnections = incomingConnections.filter((c) => c.status === 'pending');
  const chatThreadCount = new Set(conversations.map((conversation) => (
    conversation.driver_id === user?.id ? conversation.owner_id : conversation.driver_id
  ) || conversation.id)).size;

  const stats = isOwner ? [
    { label: 'Live listings', value: vehicles.filter(v => v.status === 'active' && v.approval_status === 'approved').length, icon: Car, tab: 'vehicles' as Tab },
    { label: 'Pending approval', value: vehicles.filter(v => v.approval_status === 'pending').length, icon: Clock, tab: 'vehicles' as Tab },
    { label: 'Applications', value: applications.filter(a => a.status === 'pending').length, icon: Users, tab: 'applications' as Tab },
    { label: 'Connection requests', value: pendingConnections.length, icon: Link2, tab: 'connections' as Tab },
  ] : [
    { label: 'Applications', value: myApplications.length, icon: Users, tab: 'applications' as Tab },
    { label: 'Connection requests', value: pendingConnections.length, icon: Link2, tab: 'connections' as Tab },
    { label: 'Chat history', value: chatThreadCount, icon: MessageSquare, tab: 'chats' as Tab },
    { label: 'Rating', value: profile.rating > 0 ? profile.rating.toFixed(1) : 'New', icon: Star, tab: null },
  ];

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    ...(isOwner
      ? [{ id: 'drivers' as Tab, label: 'Available drivers' }]
      : [{ id: 'cars' as Tab, label: 'Available cars' }]),
    ...(isOwner ? [{ id: 'vehicles' as Tab, label: 'My vehicles' }] : []),
    { id: 'applications', label: isOwner ? 'Applications' : 'My applications' },
    { id: 'connections', label: 'Connections', badge: pendingConnections.length },
    { id: 'chats', label: 'Chats' },
  ];

  return (
    <div className="container-content py-8">
      <BackButton to="/" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Welcome back, {profile.full_name.split(' ')[0]}.</p>
        </div>
        {isOwner && <Link to="/vehicles/new" className="btn-primary"><Plus className="h-4 w-4" /> Add vehicle</Link>}
        {isDriver && !profile.is_verified && <Link to="/onboarding" className="btn-primary"><BadgeCheck className="h-4 w-4" /> Submit platform history</Link>}
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          s.tab ? (
            <button key={s.label} onClick={() => setTab(s.tab!)} className="card p-5 text-left transition-shadow hover:shadow-md hover:ring-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-400">
              <s.icon className="h-6 w-6 text-ink-900" />
              <p className="mt-3 font-display text-2xl font-bold text-ink-900">{s.value}</p>
              <p className="text-sm text-ink-500">{s.label}</p>
            </button>
          ) : (
            <div key={s.label} className="card p-5">
              <s.icon className="h-6 w-6 text-ink-900" />
              <p className="mt-3 font-display text-2xl font-bold text-ink-900">{s.value}</p>
              <p className="text-sm text-ink-500">{s.label}</p>
            </div>
          )
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { if (tab !== t.id) setTab(t.id); }} className={cn('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors', tab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800')}>
            {t.label}{!loading && t.badge !== undefined && t.badge > 0 && <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && <OverviewTab profile={profile} drivers={drivers} availableCars={availableCars} conversations={conversations} isOwner={isOwner} pendingConnections={pendingConnections} />}
        {tab === 'drivers' && isOwner && <DriversTab users={drivers} loading={loading} siteName={settings.site_name} />}
        {tab === 'cars' && !isOwner && <AvailableCarsTab vehicles={availableCars} loading={loading} />}
        {tab === 'vehicles' && isOwner && <VehiclesTab vehicles={vehicles} loading={loading} />}
        {tab === 'applications' && isOwner && <OwnerApplicationsTab applications={applications} onAction={load} toast={toast} />}
        {tab === 'applications' && isDriver && <DriverApplicationsTab applications={myApplications} />}
        {tab === 'connections' && <ConnectionsTab incoming={incomingConnections} outgoing={outgoingConnections} onAction={async () => { await load(); await refreshProfile(); }} onEnded={() => setTab('chats')} toast={toast} />}
        {tab === 'chats' && <ChatsTab conversations={conversations} loading={loading} currentUserId={user?.id || ''} />}
      </div>
    </div>
  );
}

function OverviewTab({ profile, drivers, availableCars, conversations, isOwner, pendingConnections }: {
  profile: Profile;
  drivers: Profile[];
  availableCars: VehicleWithRelations[];
  conversations: ConversationWithRelations[];
  isOwner: boolean;
  pendingConnections: IncomingConnection[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {!isOwner && <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Driver platform history</h3>
          <div className="mt-3 flex items-center gap-2">
            {profile.is_verified ? (
              <><VerifiedBadge verified size={18} showLabel /><span className="text-sm text-ink-700">Your recent platform history has been approved.</span></>
            ) : (
              <><Clock className="h-5 w-5 text-amber-500" /><span className="text-sm text-amber-700">{profile.verification_status === 'pending' ? 'Platform history under review.' : 'Platform history not reviewed yet.'}</span></>
            )}
          </div>
          {!profile.is_verified && (
            <Link to="/onboarding" className="btn-secondary mt-4">Manage platform history</Link>
          )}
        </div>}
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Recent activity</h3>
          <div className="mt-3 space-y-2 text-sm">
            {pendingConnections.length === 0 && conversations.length === 0 && <p className="text-ink-500">No activity yet.</p>}
            {pendingConnections.slice(0, 3).map((c: Connection) => (
              <p key={c.id} className="text-ink-600">New connection request from {c.requester?.full_name || 'a member'} {timeAgo(c.created_at)}</p>
            ))}
            {conversations.slice(0, 3).map((c: Conversation) => (
              <Link key={c.id} to={`/chat/${c.id}`} className="block text-ink-900 hover:underline">Chat about {c.vehicle?.make} {c.vehicle?.model}</Link>
            ))}
          </div>
        </div>
      </div>

      {/* Driver availability status */}
      {!isOwner && (
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Your availability</h3>
          <div className="mt-3 flex items-center gap-2">
            <AvailabilityBadge availability={profile.availability} />
            <span className="text-sm text-ink-600">
              {profile.availability === 'available' && 'You are available for new connections.'}
              {profile.availability === 'busy' && 'You are currently in an active connection.'}
              {profile.availability === 'unavailable' && 'You are not available for new connections.'}
            </span>
          </div>
        </div>
      )}

      {/* Available drivers preview (owners only) */}
      {isOwner && drivers.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-ink-900">Available drivers</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {drivers.slice(0, 8).map((d: Profile) => (
              <Link key={d.id} to={`/drivers/${d.id}`} className="card card-hover p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={d.full_name} src={d.avatar_url} size={44} verified={d.is_verified} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">{d.full_name} <VerifiedBadge verified={d.is_verified} size={11} /></p>
                    <p className="flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Location not provided'}</p>
                  </div>
                  <AvailabilityBadge availability={d.availability} />
                </div>
                <Rating value={d.rating} size={12} showValue count={d.rating_count} className="mt-2" />
                <div className="mt-2 flex items-center gap-1 text-xs text-ink-500"><Briefcase className="h-3 w-3" /> {Math.max(1, d.driving_experience_years || 1)} {d.driving_experience_years === 1 ? 'year' : 'years'}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Available cars preview (drivers only) */}
      {!isOwner && availableCars?.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-ink-900">Available cars</h3>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {availableCars.slice(0, 6).map((v: VehicleWithRelations) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DriversTab({ users, loading, siteName }: { users: Profile[]; loading: boolean; siteName: string }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-40 animate-pulse" />)}</div>;
  if (users.length === 0) return <EmptyState title="No members found" description={`Check back soon as new members join ${siteName}.`} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {users.map((d) => (
        <div key={d.id} className="card p-4">
          <Link to={`/drivers/${d.id}`}>
            <div className="flex items-center gap-3">
              <Avatar name={d.full_name} src={d.avatar_url} size={48} verified={d.is_verified} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">{d.full_name} <VerifiedBadge verified={d.is_verified} size={12} /></p>
                <p className="flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Location not provided'}</p>
              </div>
              <AvailabilityBadge availability={d.availability} />
            </div>
            <Rating value={d.rating} size={12} showValue count={d.rating_count} className="mt-3" />
            <div className="mt-2 flex flex-wrap gap-1">
              {(d.platforms_worked || []).slice(0, 3).map((p) => <span key={p} className="badge-neutral">{titleCase(p)}</span>)}
            </div>
          </Link>
          <div className="mt-3">
            <Link to={`/drivers/${d.id}`} className="btn-primary w-full px-3 py-1.5 text-xs">View profile</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailableCarsTab({ vehicles, loading }: { vehicles: VehicleWithRelations[]; loading: boolean }) {
  if (loading) return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-48 animate-pulse" />)}</div>;
  if (vehicles.length === 0) return <EmptyState title="No cars available" description="Check back soon as owners list new vehicles." action={<Link to="/browse-cars" className="btn-primary">Browse all cars</Link>} />;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>;
}

function VehiclesTab({ vehicles, loading }: { vehicles: VehicleWithRelations[]; loading: boolean }) {
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (vehicles.length === 0) return <EmptyState title="No vehicles yet" description="Add your first vehicle to start receiving applications." action={<Link to="/vehicles/new" className="btn-primary">Add vehicle</Link>} />;
  return <div><div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">New listings require admin approval. Published listings can be edited at any time; rejected listings must be corrected and resubmitted.</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <div key={v.id} className="space-y-2"><VehicleCard vehicle={v} showOwner={false} showApprovalStatus /><Link to={`/vehicles/${v.id}/edit`} className="btn-secondary w-full"><Pencil className="h-4 w-4" /> {v.approval_status === 'rejected' ? 'Edit & resubmit listing' : v.approval_status === 'approved' ? 'Edit published listing' : 'Edit submission'}</Link></div>)}</div></div>;
}

function OwnerApplicationsTab({ applications, onAction, toast }: { applications: OwnerApplication[]; onAction: () => void; toast: ToastFn }) {
  const [reviewing, setReviewing] = useState<Application | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [accepting, setAccepting] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState<Application | null>(null);

  const act = async (app: Application, status: 'accepted' | 'rejected' | 'completed') => {
    const { error } = await supabase.rpc('transition_application', {
      p_application_id: app.id,
      p_status: status,
    });
    if (error) { toast(error.message, 'error'); return; }
    toast(status === 'accepted' ? 'Application accepted. Both profiles are now shown as currently on a connection.' : `Application ${status}.`);
    onAction();
  };

  if (applications.length === 0) return <EmptyState title="No applications yet" description="When drivers connect with you, they'll appear here." />;
  return (
    <div className="space-y-3">
      {applications.some((application) => application.status === 'pending') && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:text-amber-100">Accepting an application sets both members to <strong>Currently on a connection</strong>. Neither member can accept another connection until the active one is ended.</div>}
      {applications.map((a) => (
        <div key={a.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Link to={`/drivers/${a.driver_id}`} className="flex items-center gap-3">
            <Avatar name={a.driver?.full_name || 'Driver'} src={a.driver?.avatar_url} size={44} verified={!!a.driver?.is_verified} />
            <div>
              <p className="flex items-center gap-1 font-semibold text-ink-900">{a.driver?.full_name} <VerifiedBadge verified={!!a.driver?.is_verified} size={12} /></p>
              <Rating value={a.driver?.rating || 0} size={11} showValue count={a.driver?.rating_count} />
            </div>
          </Link>
          <div className="flex-1">
            <p className="text-sm text-ink-600">Applied to <Link to={`/vehicles/${a.vehicle_id}`} className="font-medium text-ink-900 hover:underline">{a.vehicle?.make} {a.vehicle?.model}</Link></p>
            <p className="text-xs text-ink-400">{timeAgo(a.created_at)}</p>
            {a.message && <p className="mt-1 text-sm text-ink-600">"{a.message}"</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('badge capitalize', a.status === 'pending' && 'badge-warning', a.status === 'accepted' && 'badge-brand', a.status === 'rejected' && 'badge-danger', a.status === 'completed' && 'badge-neutral')}>{a.status}</span>
            {a.status === 'pending' && (
              <>
                <button onClick={() => setAccepting(a)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Accept</button>
                <button onClick={() => setRejecting(a)} className="btn-secondary px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Reject</button>
              </>
            )}
            {a.status === 'accepted' && (
              <>
                <Link to="/chat" className="btn-secondary px-3 py-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>
                <button onClick={() => { setReviewing(a); setShowReview(true); }} className="btn-ghost px-3 py-1.5 text-xs"><Star className="h-3.5 w-3.5" /> Review</button>
              </>
            )}
          </div>
        </div>
      ))}
      {showReview && reviewing && (
        <ReviewModal application={reviewing} revieweeId={reviewing.driver_id} onClose={() => setShowReview(false)} onDone={() => { setShowReview(false); toast('Review submitted.'); onAction(); }} />
      )}
      {accepting && <ConfirmDialog
        title="Accept this application?"
        message="Both profiles will show “Currently on a connection,” and neither member can accept another connection until this arrangement is ended."
        confirmLabel="Accept application"
        onConfirm={() => act(accepting, 'accepted')}
        onClose={() => setAccepting(null)}
      />}
      {rejecting && <ConfirmDialog
        title="Reject this application?"
        message="The driver will be notified and this application cannot be accepted afterward. They would need to submit a new application."
        confirmLabel="Reject application"
        danger
        onConfirm={() => act(rejecting, 'rejected')}
        onClose={() => setRejecting(null)}
      />}
    </div>
  );
}

function DriverApplicationsTab({ applications }: { applications: DriverApplication[] }) {
  if (applications.length === 0) return <EmptyState title="No applications yet" description="Browse cars and connect with owners you'd like to work with." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />;
  return (
    <div className="space-y-3">
      {applications.map((a) => (
        <div key={a.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          {a.vehicle && <div className="flex-1"><Link to={`/vehicles/${a.vehicle_id}`} className="font-semibold text-ink-900 hover:text-ink-700">{a.vehicle.make} {a.vehicle.model}</Link><p className="text-xs text-ink-400">{a.vehicle.location} · {timeAgo(a.created_at)}</p></div>}
          <span className={cn('badge capitalize', a.status === 'pending' && 'badge-warning', a.status === 'accepted' && 'badge-brand', a.status === 'rejected' && 'badge-danger', a.status === 'completed' && 'badge-neutral')}>{a.status}</span>
          {a.status === 'accepted' && <Link to="/chat" className="btn-secondary px-3 py-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>}
        </div>
      ))}
    </div>
  );
}

function ConnectionsTab({ incoming, outgoing, onAction, onEnded, toast }: { incoming: IncomingConnection[]; outgoing: OutgoingConnection[]; onAction: () => void | Promise<void>; onEnded: () => void; toast: ToastFn }) {
  const pendingIn = incoming.filter((c) => c.status === 'pending');
  const acceptedIn = incoming.filter((c) => c.status === 'accepted');
  const acceptedOut = outgoing.filter((c) => c.status === 'accepted');
  const expiredOut = outgoing.filter((c) => c.status === 'expired');
  const expiredIn = incoming.filter((c) => c.status === 'expired');
  const [accepting, setAccepting] = useState<Connection | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ connection: Connection; action: 'reject' | 'cancel' | 'end' } | null>(null);

  useEffect(() => {
    supabase.rpc('expire_old_connections').then(() => onAction());
  }, [onAction]);

  const handleAccept = async (c: Connection) => {
    const { error } = await updateConnectionStatus(c.id, 'accepted');
    if (error) { toast(error, 'error'); return; }
    toast('Connection accepted. Both profiles are now shown as currently on a connection.');
    onAction();
  };
  const handleReject = async (c: Connection) => {
    const { error } = await updateConnectionStatus(c.id, 'rejected');
    if (error) { toast(error, 'error'); return; }
    toast('Connection rejected.');
    onAction();
  };
  const handleEnd = async (c: Connection) => {
    const { error } = await endConnection(c.id);
    if (error) { toast(error, 'error'); return; }
    toast('Connection ended. The chat remains available as read-only history.');
    await onAction();
    onEnded();
  };

  return (
    <div className="space-y-8">
      {/* Pending requests */}
      {pendingIn.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Pending requests ({pendingIn.length})</h3>
          <div className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/20 dark:text-amber-100">Accepting a request sets both members to <strong>Currently on a connection</strong>. Neither member can accept another connection until this one is ended.</div>
          <div className="mt-3 space-y-3">
            {pendingIn.map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-4">
                <Avatar name={c.requester?.full_name || 'User'} src={c.requester?.avatar_url} size={44} verified={c.requester?.role === 'driver' && !!c.requester?.is_verified} />
                <div className="flex-1">
                  <Link to={`/drivers/${c.requester_id}`} className="flex items-center gap-1 font-semibold text-ink-900 hover:underline">{c.requester?.full_name} <VerifiedBadge verified={!!c.requester?.is_verified} size={12} /></Link>
                  {c.message && <p className="text-sm text-ink-600">"{c.message}"</p>}
                  <p className="text-xs text-ink-400">Sent {formatDateTime(c.created_at)}</p>
                </div>
                <button onClick={() => setAccepting(c)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Accept</button>
                <button onClick={() => setConfirmingAction({ connection: c, action: 'reject' })} className="btn-secondary px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted connections */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Your connections</h3>
        {[...acceptedIn, ...acceptedOut].length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No active connections yet. Browse {incoming.length > 0 ? 'members' : 'drivers or owners'} and send a connection request to start.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...acceptedIn.map((c) => ({ c, p: c.requester })), ...acceptedOut.map((c) => ({ c, p: c.recipient }))].map(({ c, p }) => (
              <div key={c.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={p?.full_name || 'User'} src={p?.avatar_url} size={40} verified={p?.role === 'driver' && !!p?.is_verified} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/drivers/${p?.id}`} className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900 hover:underline">{p?.full_name} <VerifiedBadge verified={!!p?.is_verified} size={11} /></Link>
                    <p className="text-xs text-ink-500 capitalize">{p?.role}</p>
                    <p className="text-xs text-ink-400">Connected {formatDateTime(c.created_at)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/chat" className="btn-secondary flex-1 px-3 py-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>
                  <button onClick={() => setConfirmingAction({ connection: c, action: 'end' })} className="btn-ghost flex-1 px-3 py-1.5 text-xs text-danger hover:bg-red-50"><X className="h-3.5 w-3.5" /> End</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sent requests */}
      {outgoing.filter((c) => c.status === 'pending').length > 0 && (
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Sent requests</h3>
          <div className="mt-3 space-y-3">
            {outgoing.filter((c) => c.status === 'pending').map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-4">
                <Avatar name={c.recipient?.full_name || 'User'} src={c.recipient?.avatar_url} size={40} verified={c.recipient?.role === 'driver' && !!c.recipient?.is_verified} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-900">{c.recipient?.full_name}</p>
                  <p className="text-xs text-ink-500 capitalize">{c.recipient?.role} · waiting for response</p>
                  <p className="text-xs text-ink-400">Sent {formatDateTime(c.created_at)}</p>
                </div>
                <button onClick={() => setConfirmingAction({ connection: c, action: 'cancel' })} className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50"><X className="h-3.5 w-3.5" /> Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired connections */}
      {[...expiredIn, ...expiredOut].length > 0 && (
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Expired requests</h3>
          <p className="mt-1 text-xs text-ink-500">Requests not accepted within 7 days are automatically expired.</p>
          <div className="mt-3 space-y-3">
            {[...expiredIn.map((c) => ({ c, p: c.requester })), ...expiredOut.map((c) => ({ c, p: c.recipient }))].map(({ c, p }) => (
              <div key={c.id} className="card flex items-center gap-3 p-4 opacity-70">
                <Avatar name={p?.full_name || 'User'} src={p?.avatar_url} size={40} verified={p?.role === 'driver' && !!p?.is_verified} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-900">{p?.full_name}</p>
                  <p className="text-xs text-ink-500 capitalize">{p?.role} · expired</p>
                  <p className="text-xs text-ink-400">Sent {formatDateTime(c.created_at)}</p>
                </div>
                <span className="badge badge-neutral text-xs">Expired</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {accepting && <ConfirmDialog
        title="Accept this connection?"
        message="Both profiles will show “Currently on a connection,” and neither member can accept another connection until this one is ended."
        confirmLabel="Accept connection"
        onConfirm={() => handleAccept(accepting)}
        onClose={() => setAccepting(null)}
      />}
      {confirmingAction && <ConfirmDialog
        title={confirmingAction.action === 'end' ? 'End this connection?' : confirmingAction.action === 'cancel' ? 'Cancel this request?' : 'Reject this request?'}
        message={confirmingAction.action === 'end'
          ? 'Both members will become available again and this conversation will become read-only. The chat history will remain saved.'
          : confirmingAction.action === 'cancel'
            ? 'The recipient will no longer be able to accept this request. You can send a new request later.'
            : 'The sender will be notified and would need to send a new request if they want to connect later.'}
        confirmLabel={confirmingAction.action === 'end' ? 'End connection' : confirmingAction.action === 'cancel' ? 'Cancel request' : 'Reject request'}
        danger
        onConfirm={() => confirmingAction.action === 'end' ? handleEnd(confirmingAction.connection) : handleReject(confirmingAction.connection)}
        onClose={() => setConfirmingAction(null)}
      />}
    </div>
  );
}

function ChatsTab({ conversations, loading, currentUserId }: { conversations: ConversationWithRelations[]; loading: boolean; currentUserId: string }) {
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (conversations.length === 0) return <EmptyState title="No conversations yet" description="Chats open once a connection is accepted." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />;
  const grouped = new Map<string, ConversationWithRelations[]>();
  conversations.forEach((conversation) => {
    const partnerId = conversation.driver_id === currentUserId ? conversation.owner_id : conversation.driver_id;
    const key = partnerId || conversation.id;
    grouped.set(key, [...(grouped.get(key) || []), conversation]);
  });
  const threads = [...grouped.values()].map((items) => {
    const ordered = [...items].sort((a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime());
    return { latest: ordered[0], count: ordered.length };
  }).sort((a, b) => new Date(b.latest.last_message_at || b.latest.created_at).getTime() - new Date(a.latest.last_message_at || a.latest.created_at).getTime());
  return (
    <div className="space-y-3">
      {threads.map(({ latest: c, count }) => (
        <Link key={c.id} to={`/chat/${c.id}`} className="card card-hover flex items-center gap-3 p-4">
          <Avatar name={(c.driver?.full_name || c.owner?.full_name || 'User')} src={c.driver?.avatar_url || c.owner?.avatar_url} size={44} verified={!!c.driver?.is_verified} />
          <div className="flex-1">
            <p className="font-semibold text-ink-900">{c.vehicle?.make ? `${c.vehicle.make} ${c.vehicle.model}` : `${c.driver?.full_name || 'Driver'} ↔ ${c.owner?.full_name || 'Owner'}`}</p>
            <p className="text-xs text-ink-400">{count > 1 ? `${count} connections · complete history preserved` : c.closed_at ? 'Ended · history preserved' : c.last_message_at ? timeAgo(c.last_message_at) : 'No messages yet'}</p>
          </div>
          <MessageSquare className="h-5 w-5 text-ink-400" />
        </Link>
      ))}
    </div>
  );
}

export function ReviewModal({ application, onClose, onDone }: { application: Application; revieweeId: string; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.rpc('submit_review', {
      p_application_id: application.id,
      p_rating: rating,
      p_content: content,
    });
    if (error) {
      setLoading(false);
      toast(error.message.toLowerCase().includes('duplicate') ? 'You have already reviewed this connection.' : `Could not submit review: ${error.message}`, 'error');
      return;
    }
    setLoading(false);
    onDone();
  };

  return (
    <Modal title="Leave a review" onClose={onClose}>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} onClick={() => setRating(i)}>
            <Star className={cn('h-8 w-8 transition', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-ink-200')} />
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-medium text-ink-500">{rating} out of 5 stars selected</p>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Share your experience…" className="input mt-4" />
      <button onClick={submit} disabled={loading} className="btn-primary mt-4 w-full">{loading ? 'Submitting…' : 'Submit review'}</button>
    </Modal>
  );
}
