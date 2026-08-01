import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, Car, BadgeCheck, Flag, Bell, TrendingUp, ShieldCheck, MessageSquare, Check, X, Ban, Send, ArrowLeft, FileText, Search, Pencil, Trash2, Eye, ShieldOff, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Vehicle, Report, DocumentRow, Conversation, Message, VehicleIssue, PlatformHistory } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { cn, timeAgo } from '@/lib/utils';

const SUSPEND_REASONS = [
  'Fake or misleading profile',
  'Fraudulent activity or scam attempt',
  'Abusive or threatening behaviour',
  'Spam or repeated unwanted requests',
  'Invalid or expired documents',
  'Operating without a valid PSV licence',
  'Vehicle does not match listing',
  'Repeated no-shows or cancellations',
  'Violation of community guidelines',
];
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { BackButton } from '@/components/BackButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DocumentViewer } from '@/components/DocumentViewer';
import { Modal } from '@/components/Modal';

type Tab = 'overview' | 'drivers' | 'owners' | 'cars' | 'documents' | 'reports' | 'chat' | 'history';

export function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<(Vehicle & { owner?: Profile; photos?: { photo_url: string }[] })[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [documents, setDocuments] = useState<(DocumentRow & { user?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocumentRow | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<DocumentRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void; label: string } | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<Profile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<(Vehicle & { owner?: Profile; photos?: { photo_url: string }[] }) | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [history, setHistory] = useState<(PlatformHistory & { driver?: Profile })[]>([]);

  const load = async () => {
    const [{ data: u }, { data: v }, { data: r }, { data: d }, { data: h }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('*, owner:profiles!vehicles_owner_id_fkey(*), photos:vehicle_photos(photo_url)').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
      supabase.from('documents').select('*, user:profiles!documents_user_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('driver_platform_history').select('*, driver:profiles!driver_platform_history_driver_id_fkey(*)').order('created_at', { ascending: false }),
    ]);
    setUsers((u as Profile[]) || []);
    setVehicles((v as any) || []);
    setReports((r as Report[]) || []);
    setDocuments((d as any) || []);
    setHistory((h as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const drivers = users.filter((u) => u.role === 'driver');
  const owners = users.filter((u) => u.role === 'owner');
  const pendingVerifications = users.filter((u) => u.verification_status === 'pending');
  const pendingDocs = documents.filter((d) => !d.verified);

  const approveVerification = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', p.id);
    if (error) { toast('Update failed: ' + error.message); return; }
    await supabase.from('notifications').insert({ user_id: p.id, type: 'verification', title: 'Verification approved', body: 'Your account is now verified on GariLink.' });
    toast('User approved.');
    load();
  };
  const rejectVerification = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_verified: false, verification_status: 'rejected' }).eq('id', p.id);
    if (error) { toast('Update failed: ' + error.message); return; }
    toast('User rejected.');
    load();
  };
  const suspend = async (p: Profile, reason: string) => {
    setSuspending(true);
    const { error } = await supabase.from('profiles').update({ is_suspended: true, suspension_reason: reason, suspended_at: new Date().toISOString(), verification_status: 'rejected', is_verified: false }).eq('id', p.id);
    if (error) { toast('Suspend failed: ' + error.message); setSuspending(false); return; }
    await supabase.from('notifications').insert({ user_id: p.id, type: 'suspension', title: 'Account suspended', body: `Your account has been suspended: ${reason}` });
    toast('User suspended.');
    setSuspendingUser(null);
    setSuspendReason('');
    setSuspending(false);
    load();
  };
  const unban = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_suspended: false, suspension_reason: null, suspended_at: null }).eq('id', p.id);
    if (error) { toast('Reinstate failed: ' + error.message); return; }
    toast('User reinstated.');
    load();
  };
  const resolveReport = async (r: Report, status: 'resolved' | 'dismissed') => {
    await supabase.from('reports').update({ status }).eq('id', r.id);
    toast('Report ' + status + '.');
    load();
  };

  const verifyDoc = async (d: DocumentRow) => {
    await supabase.from('documents').update({ verified: true, rejected: false, rejection_reason: null }).eq('id', d.id);
    await supabase.from('notifications').insert({ user_id: d.user_id, type: 'verification', title: 'Document verified', body: `Your ${d.label || d.type.replace(/_/g, ' ')} was verified.` });

    // Check if all the user's documents are now verified; if so, auto-approve the user
    const { data: userDocs } = await supabase.from('documents').select('verified, rejected').eq('user_id', d.user_id);
    const allVerified = (userDocs || []).length > 0 && (userDocs || []).every((doc: any) => doc.verified);
    if (allVerified) {
      const { data: prof } = await supabase.from('profiles').select('is_verified, verification_status, full_name').eq('id', d.user_id).maybeSingle();
      if (prof && !prof.is_verified) {
        await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', d.user_id);
        await supabase.from('notifications').insert({
          user_id: d.user_id,
          type: 'verification',
          title: 'Welcome to GariLink!',
          body: `All your documents are verified. Welcome to the platform, ${prof.full_name?.split(' ')[0] || 'driver'}! You can now apply to vehicles and connect with owners.`,
        });
        toast(`${prof.full_name?.split(' ')[0] || 'User'} auto-approved — all documents verified.`);
      }
    }
    toast('Document verified.');
    load();
  };

  const rejectDoc = async (d: DocumentRow, reason: string) => {
    await supabase.from('documents').update({ verified: false, rejected: true, rejection_reason: reason }).eq('id', d.id);
    await supabase.from('notifications').insert({
      user_id: d.user_id,
      type: 'verification',
      title: 'Document rejected',
      body: `Your ${d.label || d.type.replace(/_/g, ' ')} was rejected: ${reason}. Please re-upload a corrected version.`,
    });
    toast('Document rejected with reason.');
    setRejectingDoc(null);
    setRejectReason('');
    load();
  };

  const toggleVehicle = async (v: Vehicle) => {
    const newStatus = v.status === 'active' ? 'closed' : 'active';
    await supabase.from('vehicles').update({ status: newStatus }).eq('id', v.id);
    toast(`Vehicle ${newStatus === 'active' ? 'restored' : 'removed'}.`);
    load();
  };

  const deleteVehicle = async (id: string) => {
    await supabase.from('vehicle_photos').delete().eq('vehicle_id', id);
    await supabase.from('vehicles').delete().eq('id', id);
    toast('Vehicle listing deleted.');
    load();
  };

  const deleteDoc = async (id: string) => {
    await supabase.from('documents').delete().eq('id', id);
    toast('Document deleted.');
    load();
  };

  const stats = [
    { label: 'Total users', value: users.length, icon: Users },
    { label: 'Drivers', value: drivers.length, icon: Users },
    { label: 'Car owners', value: owners.length, icon: ShieldCheck },
    { label: 'Active listings', value: vehicles.filter((v) => v.status === 'active').length, icon: Car },
    { label: 'Pending verifications', value: pendingVerifications.length, icon: TrendingUp },
    { label: 'Pending documents', value: pendingDocs.length, icon: FileText },
    { label: 'Open reports', value: reports.filter((r) => r.status === 'open').length, icon: Flag },
    { label: 'Verified drivers', value: drivers.filter((u) => u.is_verified).length, icon: BadgeCheck },
  ];

  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'drivers', label: 'Drivers', icon: Users, badge: drivers.length },
    { key: 'owners', label: 'Car Owners', icon: ShieldCheck, badge: owners.length },
    { key: 'cars', label: 'Cars', icon: Car, badge: vehicles.length },
    { key: 'documents', label: 'Documents', icon: FileText, badge: pendingDocs.length },
    { key: 'reports', label: 'Reports', icon: Flag, badge: reports.filter((r) => r.status === 'open').length },
    { key: 'history', label: 'History', icon: TrendingUp, badge: history.filter((h) => !h.approved).length },
    { key: 'chat', label: 'Chat', icon: MessageSquare },
  ];

  const filteredDrivers = drivers.filter((d) => d.full_name.toLowerCase().includes(search.toLowerCase()) || (d.phone || '').includes(search));
  const filteredOwners = owners.filter((o) => o.full_name.toLowerCase().includes(search.toLowerCase()) || (o.phone || '').includes(search));
  const filteredVehicles = vehicles.filter((v) => `${v.make} ${v.model}`.toLowerCase().includes(search.toLowerCase()) || v.location.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="container-content py-8">
      <BackButton to="/" />
      <div className="mt-4 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-brand-600" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Admin Portal</h1>
      </div>
      <p className="mt-1 text-sm text-ink-500">Manage drivers, car owners, listings, document reviews and chat with all users.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 font-display text-xl font-bold text-ink-900">{s.value}</p>
            <p className="text-xs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium', tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {(tab === 'drivers' || tab === 'owners' || tab === 'cars') && (
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-ink-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}…`} className="input max-w-xs" />
          </div>
        )}

        {loading && <div className="card h-64 animate-pulse" />}

        {/* ---------- Overview ---------- */}
        {tab === 'overview' && !loading && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Pending verifications</h3>
              <div className="mt-3 space-y-2">
                {pendingVerifications.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{p.full_name} <span className="capitalize text-ink-400">({p.role})</span></span>
                    <button onClick={() => approveVerification(p)} className="btn-primary px-3 py-1 text-xs">Approve</button>
                  </div>
                ))}
                {pendingVerifications.length === 0 && <p className="text-sm text-ink-400">No pending verifications.</p>}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Pending documents</h3>
              <div className="mt-3 space-y-2">
                {pendingDocs.slice(0, 5).map((d) => (
                  <div key={d.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{d.user?.full_name} — {d.label || d.type.replace(/_/g, ' ')}</span>
                    <div className="flex gap-1">
                      <button onClick={() => verifyDoc(d)} className="btn-primary px-2 py-1 text-xs"><Check className="h-3 w-3" /></button>
                      <button onClick={() => { setRejectingDoc(d); }} className="btn-secondary px-2 py-1 text-xs"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
                {pendingDocs.length === 0 && <p className="text-sm text-ink-400">No pending documents.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ---------- Drivers ---------- */}
        {tab === 'drivers' && !loading && (
          <div className="space-y-2">
            {filteredDrivers.map((u) => (
              <div key={u.id} className="card flex items-center gap-3 p-4">
                <Avatar name={u.full_name} src={u.avatar_url} size={40} verified={u.is_verified} />
                <div className="flex-1">
                  <p className="flex items-center gap-1 font-medium text-ink-900">{u.full_name} <VerifiedBadge verified={u.is_verified} size={12} /></p>
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'} · {timeAgo(u.created_at)}</p>
                  {u.licence_number && <p className="text-xs text-ink-400">Licence: {u.licence_number} (exp. {u.licence_expiry || '—'})</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  {!u.is_suspended && u.verification_status === 'approved' && <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> Approved</span>}
                  {!u.is_suspended && u.verification_status === 'rejected' && <span className="badge badge-danger"><XCircle className="inline h-3 w-3" /> Rejected</span>}
                  {!u.is_suspended && u.verification_status !== 'approved' && <button onClick={() => approveVerification(u)} className="btn-primary px-3 py-1 text-xs">Approve</button>}
                  {!u.is_suspended && u.verification_status !== 'rejected' && <button onClick={() => rejectVerification(u)} className="btn-secondary px-3 py-1 text-xs">Reject</button>}
                  <button onClick={() => setEditingUser(u)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
                  )}
                </div>
              </div>
            ))}
            {filteredDrivers.length === 0 && <p className="text-sm text-ink-500">No drivers found.</p>}
          </div>
        )}

        {/* ---------- Owners ---------- */}
        {tab === 'owners' && !loading && (
          <div className="space-y-2">
            {filteredOwners.map((u) => (
              <div key={u.id} className="card flex items-center gap-3 p-4">
                <Avatar name={u.full_name} src={u.avatar_url} size={40} verified={u.is_verified} />
                <div className="flex-1">
                  <p className="flex items-center gap-1 font-medium text-ink-900">{u.full_name} <VerifiedBadge verified={u.is_verified} size={12} /></p>
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'} · {timeAgo(u.created_at)}</p>
                  <p className="text-xs text-ink-400">{vehicles.filter((v) => v.owner_id === u.id).length} car(s) listed</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  {!u.is_suspended && u.verification_status === 'approved' && <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> Approved</span>}
                  {!u.is_suspended && u.verification_status === 'rejected' && <span className="badge badge-danger"><XCircle className="inline h-3 w-3" /> Rejected</span>}
                  {!u.is_suspended && u.verification_status !== 'approved' && <button onClick={() => approveVerification(u)} className="btn-primary px-3 py-1 text-xs">Approve</button>}
                  {!u.is_suspended && u.verification_status !== 'rejected' && <button onClick={() => rejectVerification(u)} className="btn-secondary px-3 py-1 text-xs">Reject</button>}
                  <button onClick={() => setEditingUser(u)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
                  )}
                </div>
              </div>
            ))}
            {filteredOwners.length === 0 && <p className="text-sm text-ink-500">No owners found.</p>}
          </div>
        )}

        {/* ---------- Cars ---------- */}
        {tab === 'cars' && !loading && (
          <div className="space-y-2">
            {filteredVehicles.map((v) => (
              <div key={v.id} className="card flex items-center gap-3 p-4">
                <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-ink-100">
                  {v.photos && v.photos[0] ? (
                    <img src={v.photos[0].photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Car className="h-6 w-6 text-ink-300" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{v.make} {v.model} ({v.year})</p>
                  <p className="text-xs text-ink-500">{v.location} · {v.transmission} · {v.fuel_type} · KES {v.weekly_target || 0}/week</p>
                  <p className="text-xs text-ink-400">Owner: {v.owner?.full_name || 'Unknown'} · {v.status} · {timeAgo(v.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingVehicle(v)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /> Edit</button>
                  <button onClick={() => setConfirmAction({ message: `${v.status === 'active' ? 'Remove' : 'Restore'} "${v.make} ${v.model}"?`, label: v.status === 'active' ? 'Remove' : 'Restore', onConfirm: () => toggleVehicle(v) })} className={cn('text-sm', v.status === 'active' ? 'btn-secondary' : 'btn-primary')}>
                    {v.status === 'active' ? 'Remove' : 'Restore'}
                  </button>
                  <button onClick={() => setConfirmAction({ message: `Permanently delete "${v.make} ${v.model}"? This cannot be undone.`, label: 'Delete', onConfirm: () => deleteVehicle(v.id) })} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {filteredVehicles.length === 0 && <p className="text-sm text-ink-500">No cars found.</p>}
          </div>
        )}

        {/* ---------- Documents ---------- */}
        {tab === 'documents' && !loading && (
          <div className="space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="card flex items-center gap-3 p-4">
                <FileText className={cn('h-8 w-8', d.verified ? 'text-success' : d.rejected ? 'text-danger' : 'text-amber-500')} />
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{d.label || d.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-ink-500">{d.user?.full_name} ({d.user?.role}) · {timeAgo(d.created_at)}</p>
                  {d.expiry_date && <p className="text-xs text-ink-400">Expires: {d.expiry_date}</p>}
                  {d.rejected && d.rejection_reason && <p className="mt-1 text-xs text-danger">Rejected: {d.rejection_reason}</p>}
                </div>
                <button onClick={() => setViewingDoc(d)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                {!d.verified ? (
                  <>
                    <button onClick={() => verifyDoc(d)} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Verify</button>
                    <button onClick={() => setRejectingDoc(d)} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button>
                  </>
                ) : (
                  <span className="badge badge-success">Verified</span>
                )}
                <button onClick={() => setConfirmAction({ message: 'Delete this document? This cannot be undone.', label: 'Delete', onConfirm: () => deleteDoc(d.id) })} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {documents.length === 0 && <p className="text-sm text-ink-500">No documents uploaded yet.</p>}
          </div>
        )}

        {/* ---------- Reports ---------- */}
        {tab === 'reports' && !loading && (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink-900">{r.reason} <span className="capitalize text-ink-400">({r.target_type})</span></p>
                  <span className={cn('badge capitalize', r.status === 'open' && 'badge-warning', r.status === 'resolved' && 'badge-brand', r.status === 'dismissed' && 'badge-neutral')}>{r.status}</span>
                </div>
                {r.description && <p className="mt-1 text-sm text-ink-600">{r.description}</p>}
                <p className="mt-1 text-xs text-ink-400">{timeAgo(r.created_at)}</p>
                {r.status === 'open' && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => resolveReport(r, 'resolved')} className="btn-primary px-3 py-1 text-xs">Resolve</button>
                    <button onClick={() => resolveReport(r, 'dismissed')} className="btn-secondary px-3 py-1 text-xs">Dismiss</button>
                  </div>
                )}
              </div>
            ))}
            {reports.length === 0 && <p className="text-sm text-ink-500">No reports.</p>}
          </div>
        )}

        {/* ---------- Platform History ---------- */}
        {tab === 'history' && !loading && (
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-ink-500">No platform history entries yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="card flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-ink-900 capitalize">{h.platform} — {h.driver?.full_name || 'Unknown driver'}</p>
                  <p className="text-xs text-ink-500">{h.months_active} months · {h.trips} trips{h.rating != null ? ` · ${h.rating.toFixed(1)} rating` : ''}</p>
                  {h.proof_url && <a href={h.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">View proof image</a>}
                </div>
                {h.approved ? (
                  <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> Approved</span>
                ) : (
                  <button onClick={async () => { await supabase.from('driver_platform_history').update({ approved: true }).eq('id', h.id); toast('Platform history approved.'); load(); }} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Approve</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------- Chat ---------- */}
        {tab === 'chat' && !loading && <AdminChat user={user} />}
      </div>

      {/* Document viewer modal */}
      {viewingDoc && (
        <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}

      {/* Rejection reason modal */}
      {rejectingDoc && (
        <Modal title={`Reject: ${rejectingDoc.label || rejectingDoc.type.replace(/_/g, ' ')}`} onClose={() => { setRejectingDoc(null); setRejectReason(''); }}>
          <p className="text-sm text-ink-600">The user will see this reason and be prompted to re-upload.</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. The document is blurry, please upload a clearer photo."
            className="input mt-3"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setRejectingDoc(null); setRejectReason(''); }} className="btn-secondary">Cancel</button>
            <button onClick={() => rejectDoc(rejectingDoc, rejectReason || 'Document does not meet requirements.')} disabled={!rejectReason.trim()} className="btn bg-danger text-white hover:bg-red-700">Reject document</button>
          </div>
        </Modal>
      )}

      {/* Suspend user modal */}
      {suspendingUser && (
        <Modal title={`Suspend ${suspendingUser.full_name}`} onClose={() => { setSuspendingUser(null); setSuspendReason(''); }}>
          <p className="text-sm text-ink-600">This user will be immediately logged out and shown a suspension message. They will not be able to use GariLink until reinstated.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUSPEND_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setSuspendReason(r)}
                className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', suspendReason === r ? 'border-danger bg-danger/10 text-danger' : 'border-ink-200 text-ink-600 hover:bg-ink-100')}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={3}
            placeholder="Select a reason above or type a custom one…"
            className="input mt-3"
          />
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setSuspendingUser(null); setSuspendReason(''); }} className="btn-secondary flex-1">Cancel</button>
            <button onClick={() => suspend(suspendingUser, suspendReason.trim() || 'Violation of platform rules.')} disabled={suspending} className="btn flex-1 bg-danger text-white hover:bg-red-700">
              {suspending ? 'Suspending…' : 'Suspend user'}
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          title="Please confirm"
          message={confirmAction.message}
          confirmLabel={confirmAction.label}
          danger={confirmAction.label === 'Delete' || confirmAction.label === 'Suspend'}
          onConfirm={confirmAction.onConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {/* Edit vehicle modal */}
      {editingVehicle && (
        <EditVehicleModal vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} onDone={() => { setEditingVehicle(null); load(); }} toast={toast} />
      )}

      {/* Edit user modal */}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onDone={() => { setEditingUser(null); load(); }} toast={toast} />
      )}
    </div>
  );
}

// ---------- Edit Vehicle Modal ----------
function EditVehicleModal({ vehicle, onClose, onDone, toast }: { vehicle: any; onClose: () => void; onDone: () => void; toast: (m: string, t?: any) => void }) {
  const [form, setForm] = useState({
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: vehicle.year || '',
    location: vehicle.location || '',
    transmission: vehicle.transmission || 'manual',
    fuel_type: vehicle.fuel_type || 'petrol',
    weekly_target: vehicle.weekly_target || 0,
    status: vehicle.status || 'active',
    description: vehicle.description || '',
  });
  const [issues, setIssues] = useState<VehicleIssue[]>([]);
  const [newIssue, setNewIssue] = useState({ description: '', severity: 'minor' as 'minor' | 'moderate' | 'major' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('vehicle_issues').select('*').eq('vehicle_id', vehicle.id);
      setIssues((data as VehicleIssue[]) || []);
    })();
  }, [vehicle.id]);

  const addIssue = async () => {
    if (!newIssue.description.trim()) return;
    const { data } = await supabase.from('vehicle_issues').insert({ vehicle_id: vehicle.id, description: newIssue.description, severity: newIssue.severity }).select().maybeSingle();
    if (data) setIssues([...issues, data as VehicleIssue]);
    setNewIssue({ description: '', severity: 'minor' });
  };

  const removeIssue = async (id: string) => {
    await supabase.from('vehicle_issues').delete().eq('id', id);
    setIssues(issues.filter((i) => i.id !== id));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('vehicles').update(form).eq('id', vehicle.id);
    setSaving(false);
    if (error) { toast('Failed to save.', 'error'); return; }
    toast('Vehicle updated.');
    onDone();
  };

  return (
    <Modal title={`Edit: ${vehicle.make} ${vehicle.model}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Make"><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="input" /></Field>
        <Field label="Model"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" /></Field>
        <Field label="Year"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })} className="input" /></Field>
        <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" /></Field>
        <Field label="Transmission"><select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })} className="input"><option value="manual">Manual</option><option value="automatic">Automatic</option></select></Field>
        <Field label="Fuel type"><select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} className="input"><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option></select></Field>
        <Field label="Weekly target (KES)"><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: +e.target.value })} className="input" /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input"><option value="active">Active</option><option value="closed">Closed</option></select></Field>
      </div>
      <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input mt-3" /></Field>

      <div className="mt-4">
        <label className="label">Known issues</label>
        <div className="space-y-2">
          {issues.map((iss) => (
            <div key={iss.id} className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 ring-1 ring-amber-100">
              <span className="flex-1 text-sm text-ink-700">{iss.description}</span>
              <span className="text-xs capitalize text-ink-500">{iss.severity}</span>
              <button onClick={() => removeIssue(iss.id)} className="text-danger hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newIssue.description} onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })} placeholder="Add an issue…" className="input flex-1" />
            <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value as any })} className="input w-auto">
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="major">Major</option>
            </select>
            <button onClick={addIssue} className="btn-secondary"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary mt-4 w-full">{saving ? 'Saving…' : 'Save changes'}</button>
    </Modal>
  );
}

// ---------- Edit User Modal ----------
function EditUserModal({ user, onClose, onDone, toast }: { user: Profile; onClose: () => void; onDone: () => void; toast: (m: string, t?: any) => void }) {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    phone: user.phone || '',
    location: user.location || '',
    is_verified: user.is_verified || false,
    verification_status: user.verification_status || 'pending',
    availability: user.availability || 'available',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update(form).eq('id', user.id);
    setSaving(false);
    if (error) { toast('Failed to save.', 'error'); return; }
    toast('Profile updated.');
    onDone();
  };

  return (
    <Modal title={`Edit: ${user.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field>
        <Field label="Location"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" /></Field>
        <Field label="Availability"><select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="input"><option value="available">Available</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></Field>
        <Field label="Verification status"><select value={form.verification_status} onChange={(e) => setForm({ ...form, verification_status: e.target.value, is_verified: e.target.value === 'approved' })} className="input"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary mt-4 w-full">{saving ? 'Saving…' : 'Save changes'}</button>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// ---------- Admin Chat component ----------
function AdminChat({ user }: { user: { id: string; email: string } | null }) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<(Conversation & { driver?: Profile; owner?: Profile })[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*, driver:profiles!conversations_driver_id_fkey(*), owner:profiles!conversations_owner_id_fkey(*)')
      .not('admin_id', 'is', null)
      .eq('admin_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((data as any) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const handler = (e: Event) => setActiveId((e as CustomEvent).detail as string);
    window.addEventListener('admin-open-chat', handler);
    return () => window.removeEventListener('admin-open-chat', handler);
  }, []);

  const active = conversations.find((c) => c.id === activeId) || null;

  const loadMessages = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', activeId).order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    if (user) {
      await supabase.from('messages').update({ read: true }).eq('conversation_id', activeId).neq('sender_id', user.id).eq('read', false);
    }
  }, [activeId, user]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('admin-chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        if (activeId && m.conversation_id === activeId) {
          setMessages((prev) => [...prev, m]);
          if (m.sender_id !== user.id) supabase.from('messages').update({ read: true }).eq('id', m.id);
        }
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeId, loadConversations]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!user || !activeId || !text.trim()) return;
    const { data } = await supabase.from('messages').insert({ conversation_id: activeId, sender_id: user.id, content: text.trim(), type: 'text' }).select().maybeSingle();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', activeId);
      const otherId = active?.driver_id || active?.owner_id;
      if (otherId) {
        await supabase.from('notifications').insert({ user_id: otherId, type: 'message', title: 'New message from admin', body: 'You have a new message from GariLink admin.', data: { conversation_id: activeId } });
      }
    }
    setText('');
    loadConversations();
  };

  if (loading) return <div className="card h-64 animate-pulse" />;

  if (conversations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-ink-300" />
        <p className="mt-3 text-sm text-ink-500">No admin chats yet. Click "Chat" on any driver or owner to start a conversation.</p>
      </div>
    );
  }

  const other = active?.driver || active?.owner;

  return (
    <div className="grid h-[70vh] gap-4 lg:grid-cols-[300px_1fr]">
      <div className={cn('card overflow-y-auto', active && 'hidden lg:block')}>
        {conversations.map((c) => {
          const u = c.driver || c.owner;
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={cn('flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left hover:bg-ink-50', activeId === c.id && 'bg-brand-50')}>
              <Avatar name={u?.full_name || 'User'} src={u?.avatar_url} size={44} verified={u?.is_verified} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{u?.full_name}</p>
                <p className="text-xs capitalize text-ink-500">{u?.role}</p>
              </div>
              {c.last_message_at && <span className="text-[10px] text-ink-400">{timeAgo(c.last_message_at)}</span>}
            </button>
          );
        })}
      </div>

      <div className={cn('card flex flex-col overflow-hidden', !active && 'hidden lg:flex')}>
        {active && other ? (
          <>
            <div className="flex items-center gap-3 border-b border-ink-100 p-4">
              <button onClick={() => setActiveId(null)} className="lg:hidden"><ArrowLeft className="h-5 w-5 text-ink-500" /></button>
              <Avatar name={other.full_name} src={other.avatar_url} size={40} verified={other.is_verified} />
              <div>
                <p className="font-semibold text-ink-900">{other.full_name}</p>
                <p className="text-xs capitalize text-brand-600">{other.role}</p>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-ink-50/50 p-4">
              {messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-white text-ink-900 ring-1 ring-ink-100')}>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <div className={cn('mt-0.5 text-[10px]', mine ? 'text-brand-100' : 'text-ink-400')}>{timeAgo(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 border-t border-ink-100 p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" className="input flex-1" />
              <button onClick={send} disabled={!text.trim()} className="btn-primary px-3"><Send className="h-4 w-4" /></button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ink-400">
            <p className="text-sm">Select a conversation to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}
