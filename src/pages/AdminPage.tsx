import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, Car, BadgeCheck, Flag, TrendingUp, ShieldCheck, MessageSquare, Check, X, Ban, Send, ArrowLeft, FileText, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle, Plus, Settings as SettingsIcon, KeyRound, Save } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET, VEHICLE_BUCKET } from '@/lib/supabase';
import type { Profile, Vehicle, Report, DocumentRow, Conversation, Message, VehicleIssue, PlatformHistory, VerificationStatus, VehiclePhoto, TrustReference } from '@/lib/types';
import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings, type SiteSettings } from '@/lib/siteSettings';
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
const TRUST_EVIDENCE_TYPES = ['work_history', 'reference_letter', 'other_trust_evidence'];
import { useToast } from '@/components/useToast';
import { useAuth } from '@/lib/useAuth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DocumentViewer } from '@/components/DocumentViewer';
import { Modal } from '@/components/Modal';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import type { LucideIcon } from 'lucide-react';
import type { ToastType } from '@/components/toastContext';
import { ModeratedImage } from '@/components/ModeratedImage';

type AdminVehicle = Vehicle & { owner?: Profile; photos?: VehiclePhoto[]; description?: string };
type AdminDocument = DocumentRow & { user?: Profile; vehicle?: Pick<Vehicle, 'id' | 'make' | 'model' | 'year'> };
type AdminHistory = PlatformHistory & { driver?: Profile };
type AdminReference = TrustReference & { user?: Profile };
type ToastFn = (message: string, type?: ToastType) => void;

async function notifyUser(userId: string, type: string, title: string, body: string, data?: Record<string, unknown>) {
  return supabase.rpc('admin_notify_user', {
    p_user_id: userId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_data: data ?? null,
  });
}

async function publishApprovedImage(privateUrl: string, ownerId: string, prefix: string) {
  const url = new URL(privateUrl);
  const parts = url.pathname.split(`/${DOCUMENT_BUCKET}/`);
  if (parts.length < 2) throw new Error('Could not resolve the pending file path.');
  const sourcePath = decodeURIComponent(parts[1]);
  const extension = sourcePath.split('.').pop()?.toLowerCase() || 'jpg';
  const { data: file, error: downloadError } = await supabase.storage.from(DOCUMENT_BUCKET).download(sourcePath);
  if (downloadError || !file) throw new Error(downloadError?.message || 'Could not read the pending file.');
  const publicPath = `${ownerId}/${prefix}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(VEHICLE_BUCKET).upload(publicPath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);
  return supabase.storage.from(VEHICLE_BUCKET).getPublicUrl(publicPath).data.publicUrl;
}

type Tab = 'overview' | 'drivers' | 'owners' | 'cars' | 'documents' | 'reports' | 'chat' | 'history' | 'settings';

export function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [references, setReferences] = useState<AdminReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocumentRow | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<DocumentRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void; label: string } | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<Profile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<AdminVehicle | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [viewingUser, setViewingUser] = useState<Profile | null>(null);
  const [viewingHistory, setViewingHistory] = useState<AdminHistory | null>(null);
  const [history, setHistory] = useState<AdminHistory[]>([]);
  const [changingPinUser, setChangingPinUser] = useState<Profile | null>(null);
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);

  const load = async () => {
    const [{ data: u }, { data: v }, { data: r }, { data: d }, { data: h }, { data: refs }] = await Promise.all([
      supabase.rpc('admin_list_profiles'),
      supabase.from('vehicles').select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*)`).order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
      supabase.from('documents').select(`*, user:profiles!documents_user_id_fkey(${PUBLIC_PROFILE_FIELDS}), vehicle:vehicles!documents_vehicle_id_fkey(id,make,model,year)`).in('type', TRUST_EVIDENCE_TYPES).order('created_at', { ascending: false }),
      supabase.from('driver_platform_history').select(`*, driver:profiles!driver_platform_history_driver_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('created_at', { ascending: false }),
      supabase.from('trust_references').select(`*, user:profiles!trust_references_user_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('created_at', { ascending: false }),
    ]);
    setUsers((u as Profile[]) || []);
    setVehicles((v as AdminVehicle[]) || []);
    setReports((r as Report[]) || []);
    setDocuments((d as AdminDocument[]) || []);
    setHistory((h as AdminHistory[]) || []);
    setReferences((refs as AdminReference[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const drivers = users.filter((u) => u.role === 'driver');
  const owners = users.filter((u) => u.role === 'owner');
  const pendingVerifications = users.filter((u) => u.role === 'driver' && u.verification_status === 'pending');
  const pendingDocs = documents.filter((d) => !d.verified && !d.rejected);
  const pendingVehiclePhotos = vehicles.flatMap((v) => (v.photos || []).filter((photo) => !photo.approved && !photo.rejected).map((photo) => ({ ...photo, vehicle: v })));
  const pendingReferences = references.filter((reference) => reference.status === 'pending');

  const approveVerification = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', p.id);
    if (error) { toast('Update failed: ' + error.message); return; }
    await notifyUser(p.id, 'trust', 'Trust Passport approved', 'Your Trust Passport is now approved on GariLink.');
    toast('Trust Passport approved.');
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
    await notifyUser(p.id, 'suspension', 'Account suspended', `Your account has been suspended: ${reason}`);
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
    await notifyUser(d.user_id, 'trust', 'Evidence approved', `Your ${d.label || d.type.replace(/_/g, ' ')} was approved.`);
    toast('Evidence approved.');
    load();
  };

  const rejectDoc = async (d: DocumentRow, reason: string) => {
    await supabase.from('documents').update({ verified: false, rejected: true, rejection_reason: reason }).eq('id', d.id);
    await notifyUser(
      d.user_id,
      'trust',
      'Evidence rejected',
      `Your ${d.label || d.type.replace(/_/g, ' ')} was rejected: ${reason}. Please re-upload a corrected version.`,
    );
    toast('Evidence rejected with reason.');
    setRejectingDoc(null);
    setRejectReason('');
    load();
  };

  const approveVehiclePhoto = async (photo: VehiclePhoto, ownerId: string) => {
    let publicUrl: string;
    try {
      publicUrl = await publishApprovedImage(photo.photo_url, ownerId, 'vehicle-approved');
    } catch (error) {
      toast('Could not publish vehicle photo: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
      return;
    }
    const { error } = await supabase.from('vehicle_photos').update({ photo_url: publicUrl, approved: true, rejected: false, rejection_reason: null }).eq('id', photo.id);
    if (error) { toast('Could not approve vehicle photo: ' + error.message, 'error'); return; }
    await notifyUser(ownerId, 'upload', 'Vehicle photo approved', 'A vehicle photo is now visible on your listing.');
    toast('Vehicle photo approved.');
    load();
  };

  const rejectVehiclePhoto = async (photo: VehiclePhoto, ownerId: string) => {
    const reason = window.prompt('Why is this vehicle photo being rejected?');
    if (!reason?.trim()) return;
    const { error } = await supabase.from('vehicle_photos').update({ approved: false, rejected: true, rejection_reason: reason.trim() }).eq('id', photo.id);
    if (error) { toast('Could not reject vehicle photo: ' + error.message, 'error'); return; }
    await notifyUser(ownerId, 'upload', 'Vehicle photo rejected', reason.trim());
    toast('Vehicle photo rejected.');
    load();
  };

  const reviewReference = async (reference: AdminReference, status: 'approved' | 'rejected') => {
    const reason = status === 'rejected' ? window.prompt('Why is this reference being rejected?') : null;
    if (status === 'rejected' && !reason?.trim()) return;
    const { error } = await supabase.from('trust_references').update({ status, rejection_reason: reason?.trim() || null }).eq('id', reference.id);
    if (error) { toast('Could not review reference: ' + error.message, 'error'); return; }
    await notifyUser(reference.user_id, 'trust', `Reference ${status}`, status === 'approved' ? `${reference.referee_name} now counts toward your Trust Passport.` : reason!.trim());
    toast(`Reference ${status}.`);
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

  const deleteUser = async (p: Profile) => {
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: p.id });
    if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
    toast(`${p.full_name} has been permanently deleted.`);
    setDeletingUser(null);
    load();
  };

  const adminChangePin = async (p: Profile, newPin: string) => {
    if (newPin.length < 10 || !/[a-z]/.test(newPin) || !/[A-Z]/.test(newPin) || !/\d/.test(newPin)) { toast('Password must be at least 10 characters with uppercase, lowercase, and a number.', 'error'); return; }
    const { error } = await supabase.rpc('admin_change_user_pin', { p_user_id: p.id, p_new_password: newPin });
    if (error) { toast('Failed to change password: ' + error.message, 'error'); return; }
    toast(`Password changed for ${p.full_name}.`);
    setChangingPinUser(null);
  };

  const adminStartChat = async (targetUser: Profile) => {
    if (!user) return;
    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('admin_id', user.id)
      .or(`driver_id.eq.${targetUser.id},owner_id.eq.${targetUser.id}`)
      .maybeSingle();
    if (existing) {
      setTab('chat');
      window.dispatchEvent(new CustomEvent('admin-open-chat', { detail: existing.id }));
      return;
    }
    // Create new conversation
    const isDriver = targetUser.role === 'driver';
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ admin_id: user.id, driver_id: isDriver ? targetUser.id : null, owner_id: isDriver ? null : targetUser.id })
      .select()
      .maybeSingle();
    if (error) { toast('Could not start chat: ' + error.message, 'error'); return; }
    setTab('chat');
    window.dispatchEvent(new CustomEvent('admin-open-chat', { detail: conv?.id }));
  };

  const stats = [
    { label: 'Total users', value: users.length, icon: Users },
    { label: 'Drivers', value: drivers.length, icon: Users },
    { label: 'Car owners', value: owners.length, icon: ShieldCheck },
    { label: 'Active listings', value: vehicles.filter((v) => v.status === 'active').length, icon: Car },
    { label: 'Pending Trust Passports', value: pendingVerifications.length, icon: TrendingUp },
    { label: 'Pending uploads', value: pendingDocs.length + pendingVehiclePhotos.length, icon: FileText },
    { label: 'Open reports', value: reports.filter((r) => r.status === 'open').length, icon: Flag },
    { label: 'Trusted drivers', value: drivers.filter((u) => u.is_verified).length, icon: BadgeCheck },
  ];

  const tabs: { key: Tab; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'drivers', label: 'Drivers', icon: Users, badge: drivers.length },
    { key: 'owners', label: 'Car Owners', icon: ShieldCheck, badge: owners.length },
    { key: 'cars', label: 'Cars', icon: Car, badge: vehicles.length },
    { key: 'documents', label: 'Uploads & trust', icon: FileText, badge: pendingDocs.length + pendingVehiclePhotos.length + pendingReferences.length },
    { key: 'reports', label: 'Reports', icon: Flag, badge: reports.filter((r) => r.status === 'open').length },
    { key: 'history', label: 'History', icon: TrendingUp, badge: history.filter((h) => !h.approved).length },
    { key: 'chat', label: 'Chat', icon: MessageSquare },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const filteredDrivers = drivers.filter((d) => d.full_name.toLowerCase().includes(search.toLowerCase()) || (d.phone || '').includes(search));
  const filteredOwners = owners.filter((o) => o.full_name.toLowerCase().includes(search.toLowerCase()) || (o.phone || '').includes(search));
  const filteredVehicles = vehicles.filter((v) => `${v.make} ${v.model}`.toLowerCase().includes(search.toLowerCase()) || v.location.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="container-content py-8">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-brand-600" />
        <h1 className="font-display text-2xl font-bold text-ink-900">Admin Portal</h1>
      </div>
      <p className="mt-1 text-sm text-ink-500">Manage Trust Passports, upload approvals, listings, reports and member support.</p>

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
              <h3 className="font-semibold text-ink-900">Pending Trust Passports</h3>
              <div className="mt-3 space-y-2">
                {pendingVerifications.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{p.full_name} <span className="capitalize text-ink-400">({p.role})</span></span>
                    <div className="flex gap-1">
                      <button onClick={() => setViewingUser(p)} className="btn-ghost px-3 py-1 text-xs"><Eye className="h-3 w-3" /> View</button>
                      <button onClick={() => setViewingUser(p)} className="btn-primary px-3 py-1 text-xs">Approve</button>
                    </div>
                  </div>
                ))}
                {pendingVerifications.length === 0 && <p className="text-sm text-ink-400">No pending Trust Passports.</p>}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Pending trust evidence</h3>
              <div className="mt-3 space-y-2">
                {pendingDocs.slice(0, 5).map((d) => (
                  <div key={d.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{d.user?.full_name} — {d.label || d.type.replace(/_/g, ' ')}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setViewingDoc(d)} className="btn-ghost px-2 py-1 text-xs"><Eye className="h-3 w-3" /> View</button>
                      <button onClick={() => verifyDoc(d)} className="btn-primary px-2 py-1 text-xs"><Check className="h-3 w-3" /></button>
                      <button onClick={() => { setRejectingDoc(d); }} className="btn-secondary px-2 py-1 text-xs"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
                {pendingDocs.length === 0 && <p className="text-sm text-ink-400">No pending trust evidence.</p>}
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
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  {!u.is_suspended && u.verification_status !== 'approved' && <button onClick={() => setViewingUser(u)} className="btn-primary px-3 py-1 text-xs">Approve</button>}
                  {!u.is_suspended && u.verification_status !== 'rejected' && <button onClick={() => rejectVerification(u)} className="btn-secondary px-3 py-1 text-xs">Reject</button>}
                  <button onClick={() => setEditingUser(u)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Chat</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
                  )}
                  <button onClick={() => setDeletingUser(u)} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /> Delete</button>
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
                <Avatar name={u.full_name} src={u.avatar_url} size={40} />
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{u.full_name}</p>
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'} · {timeAgo(u.created_at)}</p>
                  <p className="text-xs text-ink-400">{vehicles.filter((v) => v.owner_id === u.id).length} car(s) listed</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  <button onClick={() => setEditingUser(u)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Chat</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
                  )}
                  <button onClick={() => setDeletingUser(u)} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /> Delete</button>
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

        {/* ---------- Uploads and trust evidence ---------- */}
        {tab === 'documents' && !loading && (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 font-semibold text-ink-900">Vehicle photos</h3>
              <div className="space-y-2">
                {pendingVehiclePhotos.map((photo) => (
                  <div key={photo.id} className="card flex flex-wrap items-center gap-3 p-4">
                    <ModeratedImage src={photo.photo_url} alt="Pending vehicle" className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-200" />
                    <div className="min-w-0 flex-1"><p className="font-medium text-ink-900">{photo.vehicle.make} {photo.vehicle.model}</p><p className="text-xs text-ink-500">Owner: {photo.vehicle.owner?.full_name || 'Unknown'}</p></div>
                    <button onClick={() => approveVehiclePhoto(photo, photo.vehicle.owner_id)} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Approve</button>
                    <button onClick={() => rejectVehiclePhoto(photo, photo.vehicle.owner_id)} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button>
                  </div>
                ))}
                {pendingVehiclePhotos.length === 0 && <p className="text-sm text-ink-400">No pending vehicle photos.</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold text-ink-900">References</h3>
              <div className="space-y-2">
                {references.map((reference) => (
                  <div key={reference.id} className="card flex flex-wrap items-center gap-3 p-4">
                    <Users className="h-7 w-7 text-brand-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{reference.referee_name} · {reference.relationship}</p>
                      <p className="text-xs text-ink-500">For {reference.user?.full_name || 'Unknown'} · {reference.referee_contact}</p>
                      {reference.note && <p className="mt-1 text-xs text-ink-600">{reference.note}</p>}
                      {reference.rejection_reason && <p className="mt-1 text-xs text-danger">{reference.rejection_reason}</p>}
                    </div>
                    {reference.status === 'pending' ? <><button onClick={() => reviewReference(reference, 'approved')} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Approve</button><button onClick={() => reviewReference(reference, 'rejected')} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button></> : <span className={cn('badge capitalize', reference.status === 'approved' ? 'badge-success' : 'badge-danger')}>{reference.status}</span>}
                  </div>
                ))}
                {references.length === 0 && <p className="text-sm text-ink-400">No references submitted.</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold text-ink-900">Private trust evidence</h3>
              <div className="space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="card flex items-center gap-3 p-4">
                <FileText className={cn('h-8 w-8', d.verified ? 'text-success' : d.rejected ? 'text-danger' : 'text-amber-500')} />
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{d.label || d.type.replace(/_/g, ' ')}</p>
                  {d.vehicle && <p className="text-xs text-brand-700">Vehicle: {d.vehicle.year} {d.vehicle.make} {d.vehicle.model}</p>}
                  <p className="text-xs text-ink-500">{d.user?.full_name} ({d.user?.role}) · {timeAgo(d.created_at)}</p>
                  {d.expiry_date && <p className="text-xs text-ink-400">Expires: {d.expiry_date}</p>}
                  {d.rejected && d.rejection_reason && <p className="mt-1 text-xs text-danger">Rejected: {d.rejection_reason}</p>}
                </div>
                <button onClick={() => setViewingDoc(d)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                {!d.verified ? (
                  <>
                    <button onClick={() => verifyDoc(d)} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Approve</button>
                    <button onClick={() => setRejectingDoc(d)} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button>
                  </>
                ) : (
                  <span className="badge badge-success">Approved</span>
                )}
                <button onClick={() => setConfirmAction({ message: 'Delete this document? This cannot be undone.', label: 'Delete', onConfirm: () => deleteDoc(d.id) })} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
              {documents.length === 0 && <p className="text-sm text-ink-500">No trust evidence uploaded yet.</p>}
              </div>
            </section>
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
                  {h.proof_url && <span className="text-xs text-brand-600">Private proof attached</span>}
                </div>
                {h.approved ? (
                  <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> Approved</span>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => setViewingHistory(h)} className="btn-ghost px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> View</button>
                    <button onClick={() => setViewingHistory(h)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Approve</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------- Chat ---------- */}
        {tab === 'chat' && !loading && <AdminChat user={user} />}

        {/* ---------- Settings ---------- */}
        {tab === 'settings' && !loading && <AdminSettings />}
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

      {/* User profile viewer modal */}
      {viewingUser && (
        <ViewUserModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onApprove={() => { approveVerification(viewingUser); setViewingUser(null); }}
          onReject={() => { rejectVerification(viewingUser); setViewingUser(null); }}
          onSuspend={() => { setSuspendingUser(viewingUser); setSuspendReason(''); setViewingUser(null); }}
          onViewDoc={async (doc: DocumentRow) => {
            const { data } = await supabase.from('documents').select('*').eq('user_id', viewingUser.id).eq('type', doc.type).maybeSingle();
            if (data) setViewingDoc(data as DocumentRow);
          }}
          onChangePin={() => { setChangingPinUser(viewingUser); setViewingUser(null); }}
          onDelete={() => { setDeletingUser(viewingUser); setViewingUser(null); }}
          onMessage={() => { adminStartChat(viewingUser); setViewingUser(null); }}
        />
      )}

      {/* Platform history viewer modal */}
      {viewingHistory && (
        <Modal title={`Platform history: ${viewingHistory.platform}`} onClose={() => setViewingHistory(null)}>
          <div className="space-y-2 text-sm">
            <p><span className="text-ink-500">Driver:</span> {viewingHistory.driver?.full_name || 'Unknown'}</p>
            <p><span className="text-ink-500">Platform:</span> <span className="capitalize">{viewingHistory.platform}</span></p>
            <p><span className="text-ink-500">Months active:</span> {viewingHistory.months_active}</p>
            <p><span className="text-ink-500">Trips:</span> {viewingHistory.trips}</p>
            {viewingHistory.rating != null && <p><span className="text-ink-500">Rating:</span> {viewingHistory.rating.toFixed(1)}</p>}
            {viewingHistory.proof_url && (
              <div>
                <p className="text-ink-500">Proof:</p>
                <button onClick={() => setViewingDoc({
                  id: viewingHistory.id,
                  user_id: viewingHistory.driver_id,
                  type: 'work_history',
                  file_url: viewingHistory.proof_url!,
                  label: `${viewingHistory.platform} platform proof`,
                  expiry_date: null,
                  verified: viewingHistory.approved,
                  rejected: false,
                  rejection_reason: null,
                  created_at: viewingHistory.created_at,
                })} className="btn-secondary mt-2"><Eye className="h-4 w-4" /> Open private proof</button>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setViewingHistory(null)} className="btn-secondary">Close</button>
            <button onClick={async () => {
              const reason = window.prompt('Why is this platform history being rejected?');
              if (!reason?.trim()) return;
              await supabase.from('driver_platform_history').update({ approved: false, proof_url: null }).eq('id', viewingHistory.id);
              await notifyUser(viewingHistory.driver_id, 'trust', 'Platform history rejected', reason.trim());
              toast('Platform history rejected.'); setViewingHistory(null); load();
            }} className="btn-secondary"><X className="h-4 w-4" /> Reject</button>
            <button onClick={async () => { await supabase.from('driver_platform_history').update({ approved: true }).eq('id', viewingHistory.id); toast('Platform history approved.'); setViewingHistory(null); load(); }} className="btn-primary"><Check className="h-4 w-4" /> Approve</button>
          </div>
        </Modal>
      )}

      {/* Edit user modal */}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onDone={() => { setEditingUser(null); load(); }} toast={toast} />
      )}

      {/* Change password modal */}
      {changingPinUser && (
        <AdminChangePinModal user={changingPinUser} onClose={() => setChangingPinUser(null)} onConfirm={(pin) => adminChangePin(changingPinUser, pin)} />
      )}

      {/* Delete user confirm */}
      {deletingUser && (
        <ConfirmDialog
          title="Delete user permanently"
          message={`This will permanently delete ${deletingUser.full_name} and ALL their data (vehicles, messages, documents, connections). This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          onConfirm={() => deleteUser(deletingUser)}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </div>
  );
}

// ---------- Admin change password modal ----------
function AdminChangePinModal({ user, onClose, onConfirm }: { user: Profile; onClose: () => void; onConfirm: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <Modal title={`Change password: ${user.full_name}`} onClose={onClose}>
      <p className="text-sm text-ink-600">Set a password with at least 10 characters, uppercase, lowercase, and a number.</p>
      <div className="mt-3 space-y-3">
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="New password" className="input" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" className="input" />
      </div>
      {pin && confirm && pin !== confirm && <p className="mt-2 text-xs text-danger">Passwords do not match.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={() => onConfirm(pin)} disabled={pin.length < 10 || pin !== confirm} className="btn-primary"><KeyRound className="h-4 w-4" /> Set new password</button>
      </div>
    </Modal>
  );
}

// ---------- Admin Settings ----------
function AdminSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettings>({ ...DEFAULT_SITE_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('site_settings').select('key, value');
      if (error) {
        toast('Could not load settings: ' + error.message, 'error');
      } else {
        setSettings(normalizeSiteSettings(data));
      }
      setLoading(false);
    })();
  }, [toast]);

  const save = async () => {
    setSaving(true);
    const updated_at = new Date().toISOString();
    const { error } = await supabase.from('site_settings').upsert(
      Object.entries(settings).map(([key, value]) => ({ key, value, updated_at })),
      { onConflict: 'key' },
    );
    setSaving(false);
    if (error) { toast('Could not save settings: ' + error.message, 'error'); return; }
    toast('Settings saved.');
  };

  if (loading) return <div className="card h-40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">Site Settings</h2>
        <p className="mt-1 text-sm text-ink-500">Configure platform-wide settings.</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label">Site name</label>
            <input value={settings['site_name'] || ''} onChange={(e) => setSettings({ ...settings, site_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Maintenance mode</label>
            <select value={settings['maintenance_mode'] || 'false'} onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.value })} className="input">
              <option value="false">Off</option>
              <option value="true">On (blocks all access)</option>
            </select>
          </div>
          <div>
            <label className="label">Require email at registration</label>
            <select value={settings['require_email'] || 'true'} onChange={(e) => setSettings({ ...settings, require_email: e.target.value })} className="input">
              <option value="true">Yes (required)</option>
              <option value="false">No (optional)</option>
            </select>
          </div>
          <div>
            <label className="label">Max vehicles per owner</label>
            <input type="number" value={settings['max_vehicles_per_owner'] || '10'} onChange={(e) => setSettings({ ...settings, max_vehicles_per_owner: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Platform fee (%)</label>
            <input type="number" value={settings['platform_fee_percent'] || '0'} onChange={(e) => setSettings({ ...settings, platform_fee_percent: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Admin contact email</label>
            <input value={settings['admin_contact_email'] || ''} onChange={(e) => setSettings({ ...settings, admin_contact_email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Admin contact phone</label>
            <input value={settings.admin_contact_phone} onChange={(e) => setSettings({ ...settings, admin_contact_phone: e.target.value })} className="input" />
          </div>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary mt-4"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}

// ---------- Edit Vehicle Modal ----------
function EditVehicleModal({ vehicle, onClose, onDone, toast }: { vehicle: AdminVehicle; onClose: () => void; onDone: () => void; toast: ToastFn }) {
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
        <Field label="Transmission"><select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })} className="input"><option value="manual">Manual</option><option value="automatic">Automatic</option></select></Field>
        <Field label="Fuel type"><select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })} className="input"><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option></select></Field>
        <Field label="Weekly target (KES)"><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: +e.target.value })} className="input" /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle['status'] })} className="input"><option value="active">Active</option><option value="closed">Closed</option></select></Field>
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
            <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value as VehicleIssue['severity'] })} className="input w-auto">
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
function EditUserModal({ user, onClose, onDone, toast }: { user: Profile; onClose: () => void; onDone: () => void; toast: ToastFn }) {
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
        {user.role === 'driver' && <Field label="Trust Passport status"><select value={form.verification_status} onChange={(e) => setForm({ ...form, verification_status: e.target.value as VerificationStatus, is_verified: e.target.value === 'approved' })} className="input"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field>}
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

// ---------- View User Modal ----------
function ViewUserModal({ user, onClose, onApprove, onReject, onSuspend, onViewDoc, onChangePin, onDelete, onMessage }: {
  user: Profile;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onViewDoc: (doc: DocumentRow) => void;
  onChangePin: () => void;
  onDelete: () => void;
  onMessage: () => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    if (user.role !== 'driver') {
      setDocs([]);
      setLoadingDocs(false);
      return;
    }
    (async () => {
      const { data } = await supabase.from('documents').select('*').eq('user_id', user.id).in('type', TRUST_EVIDENCE_TYPES).order('created_at', { ascending: false });
      setDocs((data as DocumentRow[]) || []);
      setLoadingDocs(false);
    })();
  }, [user.id, user.role]);

  return (
    <Modal title={`${user.full_name} — Profile`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        {/* Profile info */}
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name} src={user.avatar_url} size={64} verified={user.is_verified} />
          <div>
            <p className="font-display text-lg font-bold text-ink-900">{user.full_name}</p>
            <p className="text-sm capitalize text-ink-500">{user.role}</p>
            <p className="text-xs text-ink-400">{user.phone}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {user.role === 'driver' && <InfoRow label="Trust Passport" value={<span className="capitalize">{user.verification_status}</span>} />}
          <InfoRow label="Suspended" value={user.is_suspended ? 'Yes' : 'No'} />
          <InfoRow label="Rating" value={user.rating > 0 ? `${user.rating.toFixed(1)} (${user.rating_count})` : 'No ratings'} />
          <InfoRow label="Contracts" value={String(user.contracts_completed)} />
          <InfoRow label="Availability" value={<span className="capitalize">{user.availability}</span>} />
          <InfoRow label="Location" value={user.location || 'Not set'} />
          {user.role === 'driver' && <InfoRow label="Age" value={user.age ? String(user.age) : 'Not set'} />}
          {user.role === 'driver' && <InfoRow label="Experience" value={`${user.driving_experience_years} yrs`} />}
          {user.role === 'driver' && <InfoRow label="Licence #" value={user.licence_number || 'Not set'} />}
          {user.role === 'driver' && <InfoRow label="Languages" value={user.languages.join(', ') || 'None'} />}
          {user.role === 'driver' && <InfoRow label="Platforms" value={user.platforms_worked.join(', ') || 'None'} />}
        </div>

        {user.bio && (
          <div>
            <p className="label">Bio</p>
            <p className="text-sm text-ink-600">{user.bio}</p>
          </div>
        )}

        {user.role === 'driver' && <div>
          <p className="label">Trust evidence</p>
          {loadingDocs ? (
            <div className="h-20 animate-pulse rounded-lg bg-ink-100" />
          ) : docs.length === 0 ? (
            <p className="text-sm text-ink-400">No trust evidence uploaded.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-ink-400" />
                    <div>
                      <p className="text-sm font-medium text-ink-900">{d.label || d.type.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-ink-400">
                        {d.verified ? 'Approved' : d.rejected ? 'Rejected' : 'Pending'}
                        {d.expiry_date && ` · Expires ${new Date(d.expiry_date).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => onViewDoc(d)} className="btn-ghost text-xs"><Eye className="h-3.5 w-3.5" /> View</button>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
        <button onClick={onClose} className="btn-secondary">Close</button>
        <button onClick={onMessage} className="btn-secondary"><MessageSquare className="h-4 w-4" /> Message</button>
        {user.role === 'driver' && !user.is_suspended && user.verification_status !== 'approved' && (
          <button onClick={onApprove} className="btn-primary"><Check className="h-4 w-4" /> Approve</button>
        )}
        {user.role === 'driver' && !user.is_suspended && user.verification_status !== 'rejected' && (
          <button onClick={onReject} className="btn-secondary"><X className="h-4 w-4" /> Reject</button>
        )}
        <button onClick={onChangePin} className="btn-secondary"><KeyRound className="h-4 w-4" /> Change password</button>
        {user.is_suspended ? (
          <button onClick={onSuspend} className="btn-secondary"><ShieldCheck className="h-4 w-4" /> Manage suspension</button>
        ) : (
          <button onClick={onSuspend} className="btn-secondary text-danger"><Ban className="h-4 w-4" /> Suspend</button>
        )}
        <button onClick={onDelete} className="btn-secondary text-danger"><Trash2 className="h-4 w-4" /> Delete user</button>
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="text-sm font-medium text-ink-900">{value}</p>
    </div>
  );
}

// ---------- Admin Chat component ----------
function AdminChat({ user }: { user: { id: string; email: string } | null }) {
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
      .select(`*, driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .not('admin_id', 'is', null)
      .eq('admin_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((data as (Conversation & { driver?: Profile; owner?: Profile })[]) || []);
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
          setMessages((prev) => prev.some((item) => item.id === m.id) ? prev : [...prev, m]);
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
      setMessages((prev) => prev.some((item) => item.id === data.id) ? prev : [...prev, data as Message]);
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
