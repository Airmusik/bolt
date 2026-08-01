import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Car, Users, MessageSquare, Star, Plus, Check, X, Clock, BadgeCheck, Link2, MapPin, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import type { VehicleWithRelations, Application, Profile, Conversation, Connection } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ConnectionButton } from '@/components/ConnectionButton';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { updateConnectionStatus, endConnection } from '@/lib/connections';
import { formatKES, timeAgo, titleCase, cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';

type Tab = 'overview' | 'drivers' | 'vehicles' | 'cars' | 'applications' | 'connections' | 'chats';

export function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [applications, setApplications] = useState<(Application & { driver?: Profile; vehicle?: VehicleWithRelations })[]>([]);
  const [myApplications, setMyApplications] = useState<(Application & { vehicle?: VehicleWithRelations })[]>([]);
  const [conversations, setConversations] = useState<(Conversation & { vehicle?: VehicleWithRelations; driver?: Profile; owner?: Profile })[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [availableCars, setAvailableCars] = useState<VehicleWithRelations[]>([]);
  const [incomingConnections, setIncomingConnections] = useState<(Connection & { requester?: Profile })[]>([]);
  const [outgoingConnections, setOutgoingConnections] = useState<(Connection & { recipient?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    if (profile.role === 'owner') {
      const [{ data: v }, { data: apps }, { data: drs }] = await Promise.all([
        supabase.from('vehicles').select('*, owner:profiles(*), photos:vehicle_photos(*), issues:vehicle_issues(*)').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('applications').select('*, driver:profiles(*), vehicle:vehicles(*, photos:vehicle_photos(*))').eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'driver').order('is_verified', { ascending: false }).order('rating', { ascending: false }).order('created_at', { ascending: false }).limit(24),
      ]);
      setVehicles((v as VehicleWithRelations[]) || []);
      setApplications((apps as any) || []);
      setDrivers((drs as Profile[]) || []);
    } else if (profile.role === 'driver') {
      const { data: apps } = await supabase
        .from('applications')
        .select('*, vehicle:vehicles(*, owner:profiles(*), photos:vehicle_photos(*))')
        .eq('driver_id', user.id)
        .order('created_at', { ascending: false });
      setMyApplications((apps as any) || []);
      const { data: cars } = await supabase
        .from('vehicles')
        .select('*, owner:profiles(*), photos:vehicle_photos(*), issues:vehicle_issues(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(24);
      setAvailableCars((cars as VehicleWithRelations[]) || []);
    }
    const { data: convs } = await supabase
      .from('conversations')
      .select('*, vehicle:vehicles(*, photos:vehicle_photos(*)), driver:profiles(*), owner:profiles(*)')
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((convs as any) || []);

    // connections
    const [{ data: inc }, { data: out }] = await Promise.all([
      supabase.from('connections').select('*, requester:profiles!connections_requester_id_fkey(*)').eq('recipient_id', user.id).order('created_at', { ascending: false }),
      supabase.from('connections').select('*, recipient:profiles!connections_recipient_id_fkey(*)').eq('requester_id', user.id).order('created_at', { ascending: false }),
    ]);
    setIncomingConnections((inc as any) || []);
    setOutgoingConnections((out as any) || []);

    setLoading(false);
  }, [user, profile]);

  useEffect(() => { load(); }, [load]);

  if (!profile) return null;
  const isOwner = profile.role === 'owner';
  const isDriver = profile.role === 'driver';
  const pendingConnections = incomingConnections.filter((c) => c.status === 'pending');

  const stats = isOwner ? [
    { label: 'Active listings', value: vehicles.filter(v => v.status === 'active').length, icon: Car },
    { label: 'Applications', value: applications.filter(a => a.status === 'pending').length, icon: Users },
    { label: 'Connection requests', value: pendingConnections.length, icon: Link2 },
    { label: 'Active chats', value: conversations.length, icon: MessageSquare },
  ] : [
    { label: 'Applications', value: myApplications.length, icon: Users },
    { label: 'Connection requests', value: pendingConnections.length, icon: Link2 },
    { label: 'Active chats', value: conversations.length, icon: MessageSquare },
    { label: 'Rating', value: profile.rating > 0 ? profile.rating.toFixed(1) : 'New', icon: Star },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(isOwner
      ? [{ id: 'drivers' as Tab, label: 'Available drivers' }]
      : [{ id: 'cars' as Tab, label: 'Available cars' }]),
    ...(isOwner ? [{ id: 'vehicles' as Tab, label: 'My vehicles' }] : []),
    { id: 'applications', label: isOwner ? 'Applications' : 'My applications' },
    { id: 'connections', label: `Connections${pendingConnections.length > 0 ? ` (${pendingConnections.length})` : ''}` },
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
        {isDriver && !profile.is_verified && <Link to="/onboarding" className="btn-primary"><BadgeCheck className="h-4 w-4" /> Complete verification</Link>}
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <s.icon className="h-6 w-6 text-ink-900" />
            <p className="mt-3 font-display text-2xl font-bold text-ink-900">{s.value}</p>
            <p className="text-sm text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition', tab === t.id ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && <OverviewTab profile={profile} drivers={drivers} availableCars={availableCars} conversations={conversations} isOwner={isOwner} pendingConnections={pendingConnections} />}
        {tab === 'drivers' && isOwner && <DriversTab users={drivers} loading={loading} />}
        {tab === 'cars' && !isOwner && <AvailableCarsTab vehicles={availableCars} loading={loading} />}
        {tab === 'vehicles' && isOwner && <VehiclesTab vehicles={vehicles} loading={loading} />}
        {tab === 'applications' && isOwner && <OwnerApplicationsTab applications={applications} onAction={load} toast={toast} />}
        {tab === 'applications' && isDriver && <DriverApplicationsTab applications={myApplications} />}
        {tab === 'connections' && <ConnectionsTab incoming={incomingConnections} outgoing={outgoingConnections} onAction={async () => { await load(); await refreshProfile(); }} toast={toast} />}
        {tab === 'chats' && <ChatsTab conversations={conversations} loading={loading} />}
      </div>
    </div>
  );
}

function OverviewTab({ profile, drivers, availableCars, conversations, isOwner, pendingConnections }: any) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold text-ink-900">Verification status</h3>
          <div className="mt-3 flex items-center gap-2">
            {profile.is_verified ? (
              <><VerifiedBadge verified size={18} showLabel /><span className="text-sm text-ink-700">Your account is verified.</span></>
            ) : (
              <><Clock className="h-5 w-5 text-amber-500" /><span className="text-sm text-amber-700">{profile.verification_status === 'pending' ? 'Verification under review.' : 'Not verified yet.'}</span></>
            )}
          </div>
          {!profile.is_verified && (
            <Link to="/onboarding" className="btn-secondary mt-4">{isOwner ? 'Verify your identity' : 'Upload your documents'}</Link>
          )}
        </div>
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
                    <p className="flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Kenya'}</p>
                  </div>
                  <AvailabilityBadge availability={d.availability} />
                </div>
                <Rating value={d.rating} size={12} showValue count={d.rating_count} className="mt-2" />
                <div className="mt-2 flex items-center gap-1 text-xs text-ink-500"><Briefcase className="h-3 w-3" /> {d.driving_experience_years || 0} yrs</div>
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

function DriversTab({ users, loading }: { users: Profile[]; loading: boolean }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-40 animate-pulse" />)}</div>;
  if (users.length === 0) return <EmptyState title="No members found" description="Check back soon as new members join GariLink." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {users.map((d) => (
        <div key={d.id} className="card p-4">
          <Link to={`/drivers/${d.id}`}>
            <div className="flex items-center gap-3">
              <Avatar name={d.full_name} src={d.avatar_url} size={48} verified={d.is_verified} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">{d.full_name} <VerifiedBadge verified={d.is_verified} size={12} /></p>
                <p className="flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Kenya'}</p>
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
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} showOwner={false} />)}</div>;
}

function OwnerApplicationsTab({ applications, onAction, toast }: { applications: any[]; onAction: () => void; toast: (m: string, t?: any) => void }) {
  const [reviewing, setReviewing] = useState<Application | null>(null);
  const [showReview, setShowReview] = useState(false);

  const act = async (app: Application, status: 'accepted' | 'rejected' | 'completed') => {
    await supabase.from('applications').update({ status }).eq('id', app.id);
    if (status === 'accepted') {
      const { data: conv } = await supabase.from('conversations').insert({
        application_id: app.id, vehicle_id: app.vehicle_id, driver_id: app.driver_id, owner_id: app.owner_id,
      }).select().maybeSingle();
      await supabase.from('notifications').insert({
        user_id: app.driver_id, type: 'application_accepted', title: 'Application accepted',
        body: 'Your application was accepted. You can now chat with the owner.',
        data: { application_id: app.id, conversation_id: conv?.id },
      });
    } else {
      await supabase.from('notifications').insert({
        user_id: app.driver_id, type: 'application_rejected', title: 'Application ' + status,
        body: 'Your application was ' + status + '.',
      });
    }
    toast(`Application ${status}.`);
    onAction();
  };

  if (applications.length === 0) return <EmptyState title="No applications yet" description="When drivers connect with you, they'll appear here." />;
  return (
    <div className="space-y-3">
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
                <button onClick={() => act(a, 'accepted')} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Accept</button>
                <button onClick={() => act(a, 'rejected')} className="btn-secondary px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Reject</button>
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
    </div>
  );
}

function DriverApplicationsTab({ applications }: { applications: any[] }) {
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

function ConnectionsTab({ incoming, outgoing, onAction, toast }: { incoming: (Connection & { requester?: Profile })[]; outgoing: (Connection & { recipient?: Profile })[]; onAction: () => void; toast: (m: string, t?: any) => void }) {
  const pendingIn = incoming.filter((c) => c.status === 'pending');
  const acceptedIn = incoming.filter((c) => c.status === 'accepted');
  const acceptedOut = outgoing.filter((c) => c.status === 'accepted');

  const handleAccept = async (c: Connection) => {
    const { error } = await updateConnectionStatus(c.id, 'accepted');
    if (error) { toast(error, 'error'); return; }
    toast('Connection accepted. You can now chat.');
    onAction();
  };
  const handleReject = async (c: Connection) => {
    const { error } = await updateConnectionStatus(c.id, 'rejected');
    if (error) { toast(error, 'error'); return; }
    toast('Connection rejected.');
    onAction();
  };
  const handleEnd = async (c: Connection) => {
    const driverId = c.requester_id;
    const { error } = await endConnection(c.id, driverId);
    if (error) { toast(error, 'error'); return; }
    toast('Connection ended. Driver is now available again.');
    onAction();
  };

  return (
    <div className="space-y-8">
      {/* Pending requests */}
      {pendingIn.length > 0 && (
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Pending requests ({pendingIn.length})</h3>
          <div className="mt-3 space-y-3">
            {pendingIn.map((c) => (
              <div key={c.id} className="card flex items-center gap-3 p-4">
                <Avatar name={c.requester?.full_name || 'User'} src={c.requester?.avatar_url} size={44} verified={!!c.requester?.is_verified} />
                <div className="flex-1">
                  <Link to={`/drivers/${c.requester_id}`} className="flex items-center gap-1 font-semibold text-ink-900 hover:underline">{c.requester?.full_name} <VerifiedBadge verified={!!c.requester?.is_verified} size={12} /></Link>
                  {c.message && <p className="text-sm text-ink-600">"{c.message}"</p>}
                </div>
                <button onClick={() => handleAccept(c)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Accept</button>
                <button onClick={() => handleReject(c)} className="btn-secondary px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Reject</button>
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
                  <Avatar name={p?.full_name || 'User'} src={p?.avatar_url} size={40} verified={!!p?.is_verified} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/drivers/${p?.id}`} className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900 hover:underline">{p?.full_name} <VerifiedBadge verified={!!p?.is_verified} size={11} /></Link>
                    <p className="text-xs text-ink-500 capitalize">{p?.role}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/chat" className="btn-secondary flex-1 px-3 py-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Chat</Link>
                  <button onClick={() => handleEnd(c)} className="btn-ghost flex-1 px-3 py-1.5 text-xs text-danger hover:bg-red-50"><X className="h-3.5 w-3.5" /> End</button>
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
                <Avatar name={c.recipient?.full_name || 'User'} src={c.recipient?.avatar_url} size={40} verified={!!c.recipient?.is_verified} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-900">{c.recipient?.full_name}</p>
                  <p className="text-xs text-ink-500 capitalize">{c.recipient?.role} · waiting for response</p>
                </div>
                <button onClick={() => handleReject(c)} className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50"><X className="h-3.5 w-3.5" /> Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatsTab({ conversations, loading }: { conversations: any[]; loading: boolean }) {
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (conversations.length === 0) return <EmptyState title="No conversations yet" description="Chats open once a connection is accepted." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />;
  return (
    <div className="space-y-3">
      {conversations.map((c) => (
        <Link key={c.id} to={`/chat/${c.id}`} className="card card-hover flex items-center gap-3 p-4">
          <Avatar name={(c.driver?.full_name || c.owner?.full_name || 'User')} src={c.driver?.avatar_url || c.owner?.avatar_url} size={44} verified={!!c.driver?.is_verified || !!c.owner?.is_verified} />
          <div className="flex-1">
            <p className="font-semibold text-ink-900">{c.vehicle?.make} {c.vehicle?.model}</p>
            <p className="text-xs text-ink-400">{c.last_message_at ? timeAgo(c.last_message_at) : 'No messages yet'}</p>
          </div>
          <MessageSquare className="h-5 w-5 text-ink-400" />
        </Link>
      ))}
    </div>
  );
}

export function ReviewModal({ application, revieweeId, onClose, onDone }: { application: Application; revieweeId: string; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('reviews').insert({
      application_id: application.id, reviewer_id: user.id, reviewee_id: revieweeId, rating, content,
    });
    if (error) { setLoading(false); return; }
    const { data: revs } = await supabase.from('reviews').select('rating').eq('reviewee_id', revieweeId);
    if (revs && revs.length > 0) {
      const avg = revs.reduce((s, r) => s + r.rating, 0) / revs.length;
      await supabase.from('profiles').update({ rating: Math.round(avg * 10) / 10, rating_count: revs.length, contracts_completed: revs.length }).eq('id', revieweeId);
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
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Share your experience…" className="input mt-4" />
      <button onClick={submit} disabled={loading} className="btn-primary mt-4 w-full">{loading ? 'Submitting…' : 'Submit review'}</button>
    </Modal>
  );
}
