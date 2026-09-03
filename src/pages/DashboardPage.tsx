import { PromotionLink as Link, PromotionBadge, PromoteListingLink } from '@/components/PromotionLink';
import { usePromotionLive, usePromotionRanking } from '@/lib/promotionLive';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Users, MessageSquare, Star, Check, X, Clock, Link2, MapPin, Pencil, ArrowRight, ShieldCheck, Activity, ChevronRight, Megaphone } from 'lucide-react';
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
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import type { ToastType } from '@/components/toastContext';
import { useSiteSettings } from '@/lib/siteSettings';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DeleteListingButton } from '@/components/DeleteListingButton';
import { driverNeedsApproval, driverApprovalLabel, driverApprovalMessage } from '@/lib/driverEligibility';

import { dashboardDestination, dashboardTabFromSearch, getDashboardTabs, type DashboardTab as Tab } from '@/lib/dashboardNavigation';
type OwnerApplication = Application & { driver?: Profile; vehicle?: VehicleWithRelations };
type DriverApplication = Application & { vehicle?: VehicleWithRelations };
type ConversationWithRelations = Conversation & { vehicle?: VehicleWithRelations; driver?: Profile; owner?: Profile };
type IncomingConnection = Connection & { requester?: Profile };
type OutgoingConnection = Connection & { recipient?: Profile };
type ToastFn = (message: string, type?: ToastType) => void;

export function DashboardPage() {
  const { revision, enabled: promotionsEnabled } = usePromotionLive();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = dashboardTabFromSearch(profile?.role === 'owner' ? 'owner' : 'driver', searchParams.toString());
  const setTab = (next: Tab) => navigate(dashboardDestination(next));
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  useEffect(() => { setShowFilters(false); setSearch(''); setLocationFilter(''); }, [tab]);

  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [myApplications, setMyApplications] = useState<DriverApplication[]>([]);
  const [conversations, setConversations] = useState<ConversationWithRelations[]>([]);
  const [driversRaw, setDrivers] = useState<Profile[]>([]);
  const drivers = usePromotionRanking(driversRaw, 'profile');
  const [availableCarsRaw, setAvailableCars] = useState<VehicleWithRelations[]>([]);
  const availableCars = usePromotionRanking(availableCarsRaw, 'listing');
  const [incomingConnections, setIncomingConnections] = useState<IncomingConnection[]>([]);
  const [outgoingConnections, setOutgoingConnections] = useState<OutgoingConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !profile) return;
    // Expire stale requests before loading the connection lists. Keeping this
    // in the parent loader avoids a child effect that used to refresh after
    // every render and could create an endless request/toast loop.
    const { error: expiryError } = await supabase.rpc('expire_old_connections');
    if (expiryError) console.error('connection expiry check failed', expiryError);
    if (profile.role === 'owner') {
      const [{ data: v }, { data: apps }, { data: drs }] = await Promise.all([
        supabase.from('vehicles').select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`).eq('owner_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('applications').select(`*, driver:profiles(${PUBLIC_PROFILE_FIELDS}), vehicle:vehicles(*, photos:vehicle_photos(*))`).eq('owner_id', user.id).order('created_at', { ascending: false }),
        supabase.rpc('discover_drivers', { p_limit: 24 }),
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
      const { data: cars } = await supabase.rpc('discover_vehicles', { p_limit: 24 });
      setAvailableCars((cars as VehicleWithRelations[]) || []);
    }
    const { data: convs, error: conversationsError } = await supabase
      .from('conversations')
      .select(`*, vehicle:vehicles(*, photos:vehicle_photos(*)), driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (conversationsError) {
      console.error('chat history load failed', conversationsError);
      toast('Chat history could not be refreshed. Check your connection and try again.', 'error');
    }
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

  useEffect(() => { load(); }, [load, revision]);

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

  const pendingApplications = isOwner ? applications.filter((application) => application.status === 'pending').length : 0;
  const recommendedAction = isOwner
    ? vehicles.length === 0
      ? { eyebrow: 'Start here', title: 'List your first vehicle', description: 'Add photos and requirements so suitable drivers can find it.', label: 'Add vehicle', to: '/vehicles/new', tab: null as Tab | null, icon: Car }
      : pendingConnections.length > 0
        ? { eyebrow: 'Needs your attention', title: `${pendingConnections.length} connection request${pendingConnections.length === 1 ? '' : 's'} waiting`, description: 'Review the request before the driver accepts another connection.', label: 'Review requests', to: null, tab: 'connections' as Tab, icon: Link2 }
        : pendingApplications > 0
          ? { eyebrow: 'Next best action', title: `${pendingApplications} application${pendingApplications === 1 ? '' : 's'} to review`, description: 'Compare profiles and start a conversation with a suitable driver.', label: 'View applications', to: null, tab: 'applications' as Tab, icon: Users }
          : null
    : !profile.onboarding_completed
      ? { eyebrow: 'Profile required', title: 'Complete your driver profile', description: 'Add your experience, preferred areas, platforms, and introduction to become visible.', label: 'Complete profile', to: '/onboarding', tab: null, icon: Pencil }
      : driverNeedsApproval(profile)
        ? { eyebrow: 'Recommended next step', title: profile.platform_history_submitted ? 'Platform history under review' : 'Submit or renew platform history', description: profile.platform_history_submitted ? 'Your submission is locked while an administrator reviews it. No further submission is needed.' : 'Upload recent Uber, Bolt, Faras, Little Cab, or other platform history. Approval lasts six months.', label: profile.platform_history_submitted ? 'View submission' : 'Manage history', to: '/onboarding', tab: null, icon: ShieldCheck }
        : profile.availability !== 'available'
          ? { eyebrow: 'Your status', title: profile.availability === 'busy' ? 'You are currently on a connection' : 'Your profile is not available', description: 'Manage your availability when you are ready to receive new requests.', label: 'Manage availability', to: '/settings', tab: null, icon: Clock }
          : null;

  const tabs = getDashboardTabs(isOwner ? 'owner' : 'driver');
  const activeTab = tabs.find((item) => item.id === tab) || tabs[0];
  const sectionDescriptions: Record<Tab, string> = {
    overview: 'Your account, activity, and next steps in one place.',
    drivers: 'Find available drivers and review their profiles.',
    vehicles: 'Manage listings, approval status, and vehicle details.',
    cars: 'Explore approved vehicles currently available to drivers.',
    applications: isOwner ? 'Review applications sent for your vehicles.' : 'Track the applications you have submitted.',
    connections: 'Manage requests and active working connections.',
    chats: 'Open current conversations and saved chat history.',
  };

  return (
    <div className={cn('container-content py-2 sm:py-5', tab === 'overview' && 'overview-motion')}>
      {promotionsEnabled && <div className="mb-3 flex justify-end">
        <Link to="/promotions" className="btn-secondary min-h-9 gap-1.5 px-2.5 py-1.5 text-xs">
          <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Promotions
        </Link>
      </div>}
      {tab === 'overview' && <>
      <h1 className="sr-only">Account overview</h1>

      {recommendedAction && <div className="dashboard-panel overview-recommendation relative isolate mt-3 overflow-hidden border-l-2 border-accent-500">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5"><span className="overview-action-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-400"><recommendedAction.icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-700 dark:text-accent-400">{recommendedAction.eyebrow}</p><h2 className="mt-0.5 font-display text-base font-bold leading-snug text-ink-900">{recommendedAction.title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">{recommendedAction.description}</p></div></div>
          {recommendedAction.to ? <Link to={recommendedAction.to} className="btn-primary w-full shrink-0 sm:w-auto">{recommendedAction.label}<ArrowRight className="h-4 w-4" /></Link> : <button type="button" onClick={() => recommendedAction.tab && setTab(recommendedAction.tab)} className="btn-primary w-full shrink-0 sm:w-auto">{recommendedAction.label}<ArrowRight className="h-4 w-4" /></button>}
        </div>
      </div>}

      {/* Stats */}
      <div className="overview-statistics mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          s.tab ? (
            <button key={s.label} onClick={() => setTab(s.tab!)} className="dashboard-stat group hover:ring-ink-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              <span className="dashboard-icon"><s.icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="metric-value block font-display text-xl font-bold leading-none text-ink-900">{s.value}</span><span className="mt-1 block text-[11px] leading-tight text-ink-500 sm:text-xs">{s.label}</span></span><ChevronRight className="hidden h-4 w-4 text-ink-300 transition group-hover:translate-x-1 group-hover:text-ink-600 sm:block" />
            </button>
          ) : (
            <div key={s.label} className="dashboard-stat">
              <span className="dashboard-icon"><s.icon className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="metric-value block font-display text-xl font-bold leading-none text-ink-900">{s.value}</span><span className="mt-1 block text-[11px] leading-tight text-ink-500 sm:text-xs">{s.label}</span></span>
            </div>
          )
        ))}
      </div>
      </>}

      {tab !== 'overview' && <div className="mt-5 border-b border-ink-100 pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Dashboard</p><h1 className="mt-1 font-display text-xl font-bold text-ink-900 sm:text-2xl">{activeTab.label}</h1><p className="mt-1 text-sm text-ink-500">{sectionDescriptions[tab]}</p></div>}

      <div className={tab === 'overview' ? 'mt-3' : 'mt-4'}>
        {(tab === 'cars' || tab === 'drivers') && <div className="mb-4">
          <button type="button" className="btn-secondary text-sm" aria-expanded={showFilters} aria-controls="dashboard-search-filters" onClick={() => setShowFilters(value => !value)}>{showFilters ? 'Hide filters' : 'Filters'}{(search || locationFilter) ? ' · Active' : ''}</button>
          {showFilters && <div id="dashboard-search-filters" className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-sm">{tab === 'cars' ? 'Make or model' : 'Driver name or platform'}<input className="input mt-1" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="text-sm">Location<input className="input mt-1" value={locationFilter} onChange={event => setLocationFilter(event.target.value)} /></label>
            <button type="button" className="btn-ghost justify-self-start text-sm" onClick={() => { setSearch(''); setLocationFilter(''); }}>Clear filters</button>
            <Link className="btn-ghost text-sm" to={tab === 'cars' ? '/browse-cars' : '/browse-drivers'}>More search options</Link>
          </div>}
          <p className="mt-2 text-xs text-ink-500">Filter the dashboard recommendations. Use More search options to search the full directory.</p>
        </div>}
        {tab === 'overview' && <OverviewTab profile={profile} conversations={conversations} isOwner={isOwner} pendingConnections={pendingConnections} />}
        {tab === 'drivers' && isOwner && <DriversTab users={drivers.filter(d => `${d.full_name} ${(d.platforms_worked || []).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()) && (d.location || '').toLowerCase().includes(locationFilter.trim().toLowerCase()))} loading={loading} siteName={settings.site_name} />}
        {tab === 'cars' && !isOwner && <AvailableCarsTab vehicles={availableCars.filter(v => `${v.make} ${v.model}`.toLowerCase().includes(search.trim().toLowerCase()) && (v.location || '').toLowerCase().includes(locationFilter.trim().toLowerCase()))} loading={loading} />}
        {tab === 'vehicles' && isOwner && <VehiclesTab vehicles={vehicles} loading={loading} onDeleted={load} />}
        {tab === 'applications' && isOwner && <OwnerApplicationsTab applications={applications} onAction={load} toast={toast} />}
        {tab === 'applications' && isDriver && <DriverApplicationsTab applications={myApplications} />}
        {tab === 'connections' && <ConnectionsTab incoming={incomingConnections} outgoing={outgoingConnections} onAction={async () => { await load(); await refreshProfile(); }} onEnded={() => setTab('chats')} toast={toast} />}
        {tab === 'chats' && <ChatsTab conversations={conversations} loading={loading} currentUserId={user?.id || ''} />}
      </div>
    </div>
  );
}

function OverviewTab({ profile, conversations, isOwner, pendingConnections }: {
  profile: Profile;
  conversations: ConversationWithRelations[];
  isOwner: boolean;
  pendingConnections: IncomingConnection[];
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={cn('grid gap-3', !isOwner && 'lg:grid-cols-2')}>
        {!isOwner && <div className="dashboard-panel">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink-900">Profile status</h3><span className="dashboard-icon"><ShieldCheck className="h-4 w-4" /></span></div>
          <div className="mt-3 flex items-start gap-2">
            {profile.platform_history_approved ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />}
            <div className="min-w-0"><p className="text-xs font-medium text-ink-700">{profile.platform_history_approved ? 'Platform history approved' : profile.verification_status === 'pending' ? 'Platform history under review' : 'Platform history not yet reviewed'}</p><p className="mt-0.5 text-xs leading-5 text-ink-500">{profile.platform_history_approved ? 'Your submitted driving activity has been reviewed.' : 'Your platform activity is reviewed privately by an administrator.'}</p></div>
          </div>
          {!profile.platform_history_approved && (
            <Link to="/onboarding" className="mt-1 inline-flex min-h-11 items-center gap-1 pl-6 text-xs font-semibold text-ink-700 hover:underline">View history details<ChevronRight className="h-3.5 w-3.5" /></Link>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <div><p className="text-xs font-semibold text-ink-800">Availability</p><p className="mt-0.5 text-xs text-ink-500">{driverNeedsApproval(profile) ? driverApprovalLabel(profile) : profile.availability === 'available' ? 'Open to new connections' : profile.availability === 'busy' ? 'Currently in a connection' : 'Not accepting connections'}</p></div>
            <div className="flex max-w-full flex-wrap items-center gap-2"><AvailabilityBadge availability={profile.availability} profile={profile} /><Link to="/settings" className="inline-flex min-h-11 items-center text-xs font-semibold text-ink-700 hover:underline">Manage</Link></div>
          </div>
        </div>}
        <div className="dashboard-panel">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink-900">Recent activity</h3><span className="dashboard-icon"><Activity className="h-4 w-4" /></span></div>
          <div className="mt-3 space-y-1 text-sm">
            {pendingConnections.length === 0 && conversations.length === 0 && <div className="rounded-xl bg-ink-50 p-3"><p className="text-xs font-medium text-ink-700">You're all caught up</p><p className="mt-1 text-xs leading-5 text-ink-500">New requests and conversations will appear here.</p></div>}
            {pendingConnections.slice(0, 3).map((c: Connection) => (
              <div key={c.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-ink-50"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Link2 className="h-4 w-4" /></span><div><p className="font-medium text-ink-800">New request from {c.requester?.full_name || 'a member'}</p><p className="text-xs text-ink-400">{timeAgo(c.created_at)}</p></div></div>
            ))}
            {conversations.slice(0, 3).map((c: Conversation) => (
              <Link key={c.id} to={`/chat/${c.id}`} className="group flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-ink-50"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><MessageSquare className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium text-ink-800 group-hover:text-brand-700">Chat about {c.vehicle?.make || 'your connection'} {c.vehicle?.model}</p><p className="text-xs text-ink-400">{timeAgo(c.last_message_at || c.created_at)}</p></div><ChevronRight className="mt-2 h-4 w-4 text-ink-300" /></Link>
            ))}
          </div>
        </div>
      </div>


    </div>
  );
}

function DriversTab({ users, loading, siteName }: { users: Profile[]; loading: boolean; siteName: string }) {
  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-40 animate-pulse" />)}</div>;
  if (users.length === 0) return <EmptyState title="No matching drivers" description={`Try clearing your filters or browse the full ${siteName} driver directory.`} action={<Link to="/browse-drivers" className="btn-secondary">Browse all drivers</Link>} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {users.map((d) => (
        <div key={d.id} className="card flex h-full flex-col border-t-2 border-t-emerald-400 p-4 sm:p-5">
          <Link to={`/drivers/${d.id}`}>
            <div className="flex flex-wrap items-start gap-3">
              <Avatar name={d.full_name} src={d.avatar_url} size={48} verified={d.platform_history_approved} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1 break-words font-display text-base font-bold leading-snug text-ink-900">{d.full_name} <VerifiedBadge verified={d.platform_history_approved} size={12} /></p>
                <p className="flex items-center gap-1 truncate text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Location not provided'}</p>
              </div>
              <div className="flex w-full flex-wrap gap-2"><AvailabilityBadge availability={d.availability} profile={d} /><PromotionBadge kind="profile" id={d.id} /></div>
            </div>
            <Rating value={d.rating} size={12} showValue count={d.rating_count} className="mt-3" />
            <div className="mt-2 flex flex-wrap gap-1">
              {(d.platforms_worked || []).slice(0, 3).map((p) => <span key={p} className="badge-neutral">{titleCase(p)}</span>)}
            </div>
          </Link>
          <div className="mt-auto pt-4">
            <Link to={`/drivers/${d.id}`} className="btn-primary w-full px-3 py-1.5 text-xs">View profile</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function AvailableCarsTab({ vehicles, loading }: { vehicles: VehicleWithRelations[]; loading: boolean }) {
  if (loading) return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-48 animate-pulse" />)}</div>;
  if (vehicles.length === 0) return <EmptyState title="No matching cars" description="Try clearing your filters or browse the full car directory." action={<Link to="/browse-cars" className="btn-primary">Browse all cars</Link>} />;
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>;
}

function VehiclesTab({ vehicles, loading, onDeleted }: { vehicles: VehicleWithRelations[]; loading: boolean; onDeleted: () => void }) {
  if (loading) return <div className="card h-48 animate-pulse" />;
  if (vehicles.length === 0) return <EmptyState title="No vehicles yet" description="Add your first vehicle to start receiving applications." action={<Link to="/vehicles/new" className="btn-primary">Add vehicle</Link>} />;
  return <div><div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">New listings require admin approval. Published listings can be edited at any time; rejected listings must be corrected and resubmitted.</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <div key={v.id} className="space-y-2"><VehicleCard vehicle={v} showOwner={false} showApprovalStatus /><Link to={`/vehicles/${v.id}/edit`} className="btn-secondary w-full"><Pencil className="h-4 w-4" /> {v.approval_status === 'rejected' ? 'Edit & resubmit listing' : v.approval_status === 'approved' ? 'Edit published listing' : 'Edit submission'}</Link>{v.approval_status === 'approved' && v.status === 'active' && <PromoteListingLink id={v.id} ownerId={v.owner_id} />}<DeleteListingButton id={v.id} onDeleted={onDeleted} /></div>)}</div></div>;
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
            <Avatar name={a.driver?.full_name || 'Driver'} src={a.driver?.avatar_url} size={44} verified={!!a.driver?.platform_history_approved} />
            <div>
              <p className="flex items-center gap-1 font-semibold text-ink-900">{a.driver?.full_name} <VerifiedBadge verified={!!a.driver?.platform_history_approved} size={12} /></p>
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
  const { profile } = useAuth();
  const pendingIn = incoming.filter((c) => c.status === 'pending');
  const acceptedIn = incoming.filter((c) => c.status === 'accepted');
  const acceptedOut = outgoing.filter((c) => c.status === 'accepted');
  const expiredOut = outgoing.filter((c) => c.status === 'expired');
  const expiredIn = incoming.filter((c) => c.status === 'expired');
  const [accepting, setAccepting] = useState<Connection | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ connection: Connection; action: 'reject' | 'cancel' | 'end' } | null>(null);

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
                <Avatar name={c.requester?.full_name || 'User'} src={c.requester?.avatar_url} size={44} verified={c.requester?.role === 'driver' && !!c.requester?.platform_history_approved} />
                <div className="flex-1">
                  <Link to={`/drivers/${c.requester_id}`} className="flex items-center gap-1 font-semibold text-ink-900 hover:underline">{c.requester?.full_name} <VerifiedBadge verified={!!c.requester?.platform_history_approved} size={12} /></Link>
                  {c.message && <p className="text-sm text-ink-600">"{c.message}"</p>}
                  <p className="text-xs text-ink-400">Sent {formatDateTime(c.created_at)}</p>
                </div>
                <button onClick={() => { if (driverNeedsApproval(profile)) toast(driverApprovalMessage(profile), 'error'); else if (driverNeedsApproval(c.requester)) toast('This driver needs approved platform history before connecting.', 'error'); else setAccepting(c); }} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Accept</button>
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
                  <Avatar name={p?.full_name || 'User'} src={p?.avatar_url} size={40} verified={p?.role === 'driver' && !!p?.platform_history_approved} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/drivers/${p?.id}`} className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900 hover:underline">{p?.full_name} <VerifiedBadge verified={!!p?.platform_history_approved} size={11} /></Link>
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
                <Avatar name={c.recipient?.full_name || 'User'} src={c.recipient?.avatar_url} size={40} verified={c.recipient?.role === 'driver' && !!c.recipient?.platform_history_approved} />
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
                <Avatar name={p?.full_name || 'User'} src={p?.avatar_url} size={40} verified={p?.role === 'driver' && !!p?.platform_history_approved} />
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
          <Avatar name={(c.driver?.full_name || c.owner?.full_name || 'User')} src={c.driver?.avatar_url || c.owner?.avatar_url} size={44} verified={!!c.driver?.platform_history_approved} />
          <div className="flex-1">
            <p className="font-semibold text-ink-900">{c.vehicle?.make ? `${c.vehicle.make} ${c.vehicle.model}` : `${c.driver?.full_name || 'Driver'} ↔ ${c.owner?.full_name || 'Owner'}`}</p>
            <p className="text-xs text-ink-400">{count > 1 ? 'Complete chat history preserved' : c.closed_at ? 'Ended · history preserved' : c.last_message_at ? timeAgo(c.last_message_at) : 'No messages yet'}</p>
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
