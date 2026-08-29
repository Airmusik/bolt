import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, Car, Flag, TrendingUp, ShieldCheck, MessageSquare, Check, X, Ban, Send, ArrowLeft, FileText, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle, Plus, Settings as SettingsIcon, KeyRound, Save, Mail, UserPlus, UserMinus, LockKeyhole, Upload, ImageIcon, ImagePlus, Loader2, Headphones, CalendarDays } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET, VEHICLE_BUCKET, SITE_ASSETS_BUCKET, CHAT_MEDIA_BUCKET } from '@/lib/supabase';
import type { Profile, Vehicle, Report, DocumentRow, Conversation, Message, VehicleIssue, PlatformHistory, VerificationStatus, VehiclePhoto, ContactMessage, UserWarning } from '@/lib/types';
import { type SiteSettings, useSiteSettings } from '@/lib/siteSettings';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { cn, timeAgo, formatDate, formatDateTime } from '@/lib/utils';

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
const TRUST_EVIDENCE_TYPES = ['work_history', 'other_trust_evidence'];
import { useToast } from '@/components/useToast';
import { useAuth } from '@/lib/useAuth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DocumentViewer } from '@/components/DocumentViewer';
import { Modal } from '@/components/Modal';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import type { LucideIcon } from 'lucide-react';
import type { ToastType } from '@/components/toastContext';
import { ModeratedImage } from '@/components/ModeratedImage';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { ChatMediaImage } from '@/components/ChatMediaImage';
import { prepareChatImageUpload } from '@/lib/trustUpload';

type AdminVehicle = Vehicle & { owner?: Profile; photos?: VehiclePhoto[]; issues?: VehicleIssue[]; description?: string };
type AdminDocument = DocumentRow & { user?: Profile; vehicle?: Pick<Vehicle, 'id' | 'make' | 'model' | 'year'> };
type AdminHistory = PlatformHistory & { driver?: Profile };
type AdminReport = Report & { reporter?: Profile; reported?: Profile; warnings?: UserWarning[] };
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

type Tab = 'overview' | 'members' | 'drivers' | 'owners' | 'cars' | 'documents' | 'reports' | 'contact' | 'chat' | 'history' | 'settings';

const ADMIN_TABS: Tab[] = ['overview', 'members', 'drivers', 'owners', 'cars', 'documents', 'reports', 'contact', 'chat', 'history', 'settings'];

export function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: siteSettings } = useSiteSettings();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    return requested && ADMIN_TABS.includes(requested) ? requested : 'overview';
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocumentRow | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<DocumentRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void | Promise<void>; label: string } | null>(null);
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
  const [reviewingVehicle, setReviewingVehicle] = useState<AdminVehicle | null>(null);
  const [listingActionLoading, setListingActionLoading] = useState(false);
  const [viewingReport, setViewingReport] = useState<AdminReport | null>(null);
  const [carStatusFilter, setCarStatusFilter] = useState<'all' | 'live' | 'pending'>('all');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | 'driver' | 'owner'>('all');
  const [suspensionReportId, setSuspensionReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersResult, vehiclesResult, reportsResult, documentsResult, historyResult, contactsResult] = await Promise.all([
      supabase.rpc('admin_list_profiles'),
      supabase.from('vehicles').select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`).order('created_at', { ascending: false }),
      supabase.from('reports').select(`*, reporter:profiles!reports_reporter_id_fkey(${PUBLIC_PROFILE_FIELDS}), reported:profiles!reports_reported_id_fkey(${PUBLIC_PROFILE_FIELDS}), warnings:user_warnings(*)`).order('created_at', { ascending: false }),
      supabase.from('documents').select(`*, user:profiles!documents_user_id_fkey(${PUBLIC_PROFILE_FIELDS}), vehicle:vehicles!documents_vehicle_id_fkey(id,make,model,year)`).in('type', TRUST_EVIDENCE_TYPES).order('created_at', { ascending: false }),
      supabase.from('driver_platform_history').select(`*, driver:profiles!driver_platform_history_driver_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('created_at', { ascending: false }),
      supabase.from('contact_messages').select('*').order('created_at', { ascending: false }),
    ]);
    const loadError = [usersResult, vehiclesResult, reportsResult, documentsResult, historyResult, contactsResult].find((result) => result.error)?.error;
    if (loadError) toast('Some admin data could not be loaded: ' + loadError.message, 'error');
    const { data: u } = usersResult;
    const { data: v } = vehiclesResult;
    const { data: r } = reportsResult;
    const { data: d } = documentsResult;
    const { data: h } = historyResult;
    const { data: contacts } = contactsResult;
    const loadedUsers = (u as Profile[]) || [];
    const usersById = new Map(loadedUsers.map((member) => [member.id, member]));
    setUsers(loadedUsers);
    setVehicles((v as AdminVehicle[]) || []);
    setReports(((r as AdminReport[]) || []).map((report) => ({
      ...report,
      reporter: usersById.get(report.reporter_id) || report.reporter,
      reported: report.reported_id ? usersById.get(report.reported_id) || report.reported : report.reported,
    })));
    setDocuments((d as AdminDocument[]) || []);
    setHistory((h as AdminHistory[]) || []);
    setContactMessages((contacts as ContactMessage[]) || []);
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const drivers = users.filter((u) => u.role === 'driver');
  const owners = users.filter((u) => u.role === 'owner');
  const pendingVerifications = users.filter((u) => u.role === 'driver' && u.verification_status === 'pending');
  const pendingDocs = documents.filter((d) => !d.verified && !d.rejected);
  const pendingVehiclePhotos = vehicles.flatMap((v) => (v.photos || []).filter((photo) => !photo.approved && !photo.rejected).map((photo) => ({ ...photo, vehicle: v })));
  const pendingListings = vehicles.filter((vehicle) => vehicle.approval_status === 'pending');
  const newContactMessages = contactMessages.filter((message) => message.status === 'new');
  const unsolvedReports = reports.filter((report) => report.status === 'open' || report.status === 'reviewing');

  const approveVerification = async (p: Profile) => {
    const { count, error: historyError } = await supabase.from('driver_platform_history').select('id', { count: 'exact', head: true }).eq('driver_id', p.id).eq('approved', true);
    if (historyError) { toast('Could not check platform history: ' + historyError.message, 'error'); return; }
    if (!count) { toast('Approve at least one uploaded platform-history proof before approving this driver.', 'error'); return; }
    const { error } = await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', p.id);
    if (error) { toast('Update failed: ' + error.message, 'error'); return; }
    await notifyUser(p.id, 'trust', 'Platform history approved', `Your recent driver platform history is now approved on ${siteSettings.site_name}.`);
    toast('Driver platform history approved.');
    load();
  };
  const rejectVerification = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_verified: false, verification_status: 'rejected' }).eq('id', p.id);
    if (error) { toast('Update failed: ' + error.message, 'error'); return; }
    toast('Driver platform history rejected.');
    load();
  };
  const suspend = async (p: Profile, reason: string) => {
    setSuspending(true);
    const { error } = await supabase.from('profiles').update({ is_suspended: true, suspension_reason: reason, suspended_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { toast('Suspend failed: ' + error.message, 'error'); setSuspending(false); return; }
    await notifyUser(p.id, 'suspension', 'Account suspended', `Your account has been suspended: ${reason}`);
    if (suspensionReportId) {
      const { error: reportError } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', suspensionReportId);
      if (reportError) toast('The user was suspended, but the report could not be marked solved: ' + reportError.message, 'error');
    }
    toast(suspensionReportId ? 'User suspended and report marked solved.' : 'User suspended.');
    setSuspendingUser(null);
    setSuspendReason('');
    setSuspensionReportId(null);
    setSuspending(false);
    load();
  };
  const unban = async (p: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_suspended: false, suspension_reason: null, suspended_at: null }).eq('id', p.id);
    if (error) { toast('Reinstate failed: ' + error.message, 'error'); return; }
    toast('User reinstated.');
    setViewingUser(null);
    load();
  };
  const resolveReport = async (r: Report, status: 'resolved' | 'dismissed') => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', r.id);
    if (error) { toast('Could not update report: ' + error.message, 'error'); return; }
    toast(status === 'resolved' ? 'Report marked solved.' : 'Report dismissed.');
    load();
  };

  const verifyDoc = async (d: DocumentRow) => {
    const { error } = await supabase.from('documents').update({ verified: true, rejected: false, rejection_reason: null }).eq('id', d.id);
    if (error) { toast('Could not approve evidence: ' + error.message, 'error'); return; }
    await notifyUser(d.user_id, 'trust', 'Evidence approved', `Your ${d.label || d.type.replace(/_/g, ' ')} was approved.`);
    toast('Evidence approved.');
    load();
  };

  const rejectDoc = async (d: DocumentRow, reason: string) => {
    const { error } = await supabase.from('documents').update({ verified: false, rejected: true, rejection_reason: reason }).eq('id', d.id);
    if (error) { toast('Could not reject evidence: ' + error.message, 'error'); return; }
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

  const resolveContactMessage = async (message: ContactMessage) => {
    const { error } = await supabase.from('contact_messages').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', message.id);
    if (error) { toast('Could not resolve message: ' + error.message, 'error'); return; }
    toast('Contact message marked resolved.');
    load();
  };

  const issueReportWarning = async (report: AdminReport, message: string) => {
    const { data, error } = await supabase.rpc('admin_issue_report_warning', { p_report_id: report.id, p_message: message.trim() });
    if (error) { toast('Could not send warning: ' + error.message, 'error'); return false; }
    toast(`Warning ${Number(data) || 1} sent. The report is now solved.`);
    setViewingReport(null);
    await load();
    return true;
  };

  const deleteContactMessage = async (message: ContactMessage) => {
    const { error } = await supabase.from('contact_messages').delete().eq('id', message.id);
    if (error) { toast('Could not delete message: ' + error.message, 'error'); return; }
    toast('Contact message deleted.');
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

  const approveListing = async (vehicle: AdminVehicle) => {
    if (!user) return;
    const photos = vehicle.photos || [];
    if (photos.length === 0) { toast('A listing needs at least one vehicle image before approval.', 'error'); return; }
    if (photos.some((photo) => photo.rejected)) { toast('This listing has a rejected image. The owner must replace it before approval.', 'error'); return; }
    setListingActionLoading(true);
    try {
      for (const photo of photos.filter((item) => !item.approved)) {
        const publicUrl = await publishApprovedImage(photo.photo_url, vehicle.owner_id, `vehicle-${photo.position + 1}`);
        const { error: photoError } = await supabase.from('vehicle_photos').update({ photo_url: publicUrl, approved: true, rejected: false, rejection_reason: null }).eq('id', photo.id);
        if (photoError) throw photoError;
      }
      const { error } = await supabase.from('vehicles').update({ approval_status: 'approved', approval_note: null, approved_at: new Date().toISOString(), approved_by: user.id }).eq('id', vehicle.id);
      if (error) throw error;
      await notifyUser(vehicle.owner_id, 'listing', 'Vehicle listing approved', `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} is now live.`, { vehicle_id: vehicle.id });
      toast('Listing approved and published.');
      setReviewingVehicle(null);
      await load();
    } catch (error) {
      toast('Could not approve listing: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    } finally {
      setListingActionLoading(false);
    }
  };

  const rejectListing = async (vehicle: AdminVehicle, reason: string) => {
    if (!reason.trim()) { toast('Give the owner a reason so they know what to correct.', 'error'); return; }
    setListingActionLoading(true);
    const { error } = await supabase.from('vehicles').update({ approval_status: 'rejected', approval_note: reason.trim(), approved_at: null, approved_by: null }).eq('id', vehicle.id);
    if (error) { toast('Could not reject listing: ' + error.message, 'error'); setListingActionLoading(false); return; }
    await notifyUser(vehicle.owner_id, 'listing', 'Vehicle listing needs changes', `${reason.trim()} Edit the listing and submit it again.`, { vehicle_id: vehicle.id });
    toast('Listing returned to the owner with your note.');
    setReviewingVehicle(null);
    setListingActionLoading(false);
    load();
  };

  const toggleVehicle = async (v: Vehicle) => {
    const newStatus = v.status === 'active' ? 'closed' : 'active';
    const { error } = await supabase.from('vehicles').update({ status: newStatus }).eq('id', v.id);
    if (error) { toast('Could not update listing: ' + error.message, 'error'); return; }
    toast(`Vehicle ${newStatus === 'active' ? 'restored' : 'removed'}.`);
    load();
  };

  const deleteVehicle = async (id: string) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) { toast('Could not delete listing: ' + error.message, 'error'); return; }
    toast('Vehicle listing deleted.');
    load();
  };

  const deleteDoc = async (id: string) => {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) { toast('Could not delete document: ' + error.message, 'error'); return; }
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

  const adminStartChat = async (targetUser: Profile, report?: AdminReport) => {
    if (!user) return;
    const prefill = report
      ? `I am contacting you about a ${report.target_type} report: "${report.reason}".${report.description ? ` Report details: ${report.description}` : ''} `
      : '';
    // Check if conversation already exists
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('admin_id', user.id)
      .or(`driver_id.eq.${targetUser.id},owner_id.eq.${targetUser.id}`)
      .maybeSingle();
    if (existing) {
      setTab('chat');
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('admin-open-chat', { detail: { conversationId: existing.id, prefill } })), 50);
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
    if (conv?.id) window.setTimeout(() => window.dispatchEvent(new CustomEvent('admin-open-chat', { detail: { conversationId: conv.id, prefill } })), 50);
  };

  const stats: { label: string; value: number; icon: LucideIcon }[] = [
    { label: 'Members', value: users.length, icon: Users },
    { label: 'Live listings', value: vehicles.filter((v) => v.status === 'active' && v.approval_status === 'approved').length, icon: Car },
    { label: 'Pending reviews', value: pendingListings.length + pendingVerifications.length + pendingDocs.length + pendingVehiclePhotos.length, icon: FileText },
    { label: 'Unsolved reports', value: unsolvedReports.length, icon: Flag },
  ];

  const tabs: { key: Tab; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'members', label: 'Members', icon: Users, badge: users.length },
    { key: 'cars', label: 'Cars', icon: Car, badge: pendingListings.length || vehicles.length },
    { key: 'documents', label: 'Uploads & trust', icon: FileText, badge: pendingDocs.length + pendingVehiclePhotos.length },
    { key: 'reports', label: 'Reports', icon: Flag, badge: unsolvedReports.length },
    { key: 'contact', label: 'Contact forms', icon: Mail, badge: newContactMessages.length },
    { key: 'history', label: 'History', icon: TrendingUp, badge: history.filter((h) => !h.approved).length },
    { key: 'chat', label: 'Support chats', icon: MessageSquare, badge: reports.filter((report) => report.target_type === 'conversation' && report.reason === 'Support requested' && ['open', 'reviewing'].includes(report.status)).length },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const filteredDrivers = drivers.filter((d) => `${d.full_name} ${d.email || ''} ${d.phone || ''}`.toLowerCase().includes(search.toLowerCase()));
  const filteredOwners = owners.filter((o) => `${o.full_name} ${o.email || ''} ${o.phone || ''}`.toLowerCase().includes(search.toLowerCase()));
  const filteredUsers = users.filter((member) => {
    const matchesRole = memberRoleFilter === 'all' || member.role === memberRoleFilter;
    return matchesRole && `${member.full_name} ${member.email || ''} ${member.phone || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch = `${v.make} ${v.model} ${v.location}`.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (carStatusFilter === 'live') return v.status === 'active' && v.approval_status === 'approved';
    if (carStatusFilter === 'pending') return v.approval_status === 'pending';
    return true;
  });

  return (
    <div className="container-content py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-brand-600" />
          <h1 className="font-display text-2xl font-bold text-ink-900">Admin Portal</h1>
        </div>
        <button type="button" onClick={() => setTab('overview')} className="btn-secondary px-3 py-2 text-xs"><TrendingUp className="h-4 w-4" /> Dashboard</button>
      </div>
      <p className="mt-1 text-sm text-ink-500">Manage driver platform-history reviews, upload approvals, listings, reports and member support.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 font-display text-xl font-bold text-ink-900">{loading ? '—' : s.value}</p>
            <p className="text-xs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-100">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { if (t.key === 'cars') setCarStatusFilter('all'); setTab(t.key); }} className={cn('flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium', tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {(tab === 'members' || tab === 'cars') && (
          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-ink-400" />
            <input
              type="search"
              name="member-filter-query"
              autoComplete="one-time-code"
              data-form-type="other"
              data-1p-ignore="true"
              data-lpignore="true"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'cars' ? 'Search cars…' : 'Search name, email, or phone…'}
              className="input max-w-xs"
            />
          </div>
        )}

        {loading && <div className="card h-64 animate-pulse" />}

        {/* ---------- Overview ---------- */}
        {tab === 'overview' && !loading && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-ink-900">Listings awaiting approval</h3><p className="mt-1 text-xs text-ink-500">Open a listing to inspect every image and all owner-provided details before it can go live.</p></div>{pendingListings.length > 0 && <span className="badge-warning">{pendingListings.length} pending</span>}</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {pendingListings.slice(0, 6).map((vehicle) => (
                  <div key={vehicle.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 p-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-ink-800">{vehicle.year} {vehicle.make} {vehicle.model}</p><p className="truncate text-xs text-ink-500">{vehicle.owner?.full_name || 'Unknown owner'} · {vehicle.photos?.length || 0} image(s)</p></div>
                    <button onClick={() => setReviewingVehicle(vehicle)} className="btn-primary shrink-0 px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> Review</button>
                  </div>
                ))}
                {pendingListings.length === 0 && <p className="text-sm text-ink-400">No listings are waiting for review.</p>}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Pending platform-history reviews</h3>
              <div className="mt-3 space-y-2">
                {pendingVerifications.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{p.full_name} <span className="capitalize text-ink-400">({p.role})</span></span>
                    <button onClick={() => setViewingUser(p)} className="btn-primary px-3 py-1 text-xs"><Eye className="h-3 w-3" /> Review</button>
                  </div>
                ))}
                {pendingVerifications.length === 0 && <p className="text-sm text-ink-400">No platform-history reviews are pending.</p>}
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
                      <button onClick={() => verifyDoc(d)} aria-label={`Approve ${d.label || 'document'}`} className="btn-primary px-2 py-1 text-xs"><Check className="h-3 w-3" /></button>
                      <button onClick={() => { setRejectingDoc(d); }} aria-label={`Reject ${d.label || 'document'}`} className="btn-secondary px-2 py-1 text-xs"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
                {pendingDocs.length === 0 && <p className="text-sm text-ink-400">No pending trust evidence.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ---------- All members ---------- */}
        {tab === 'members' && !loading && (
          <div className="space-y-2">
            <div className="mb-3 flex flex-wrap gap-2">
              {(['all', 'driver', 'owner'] as const).map((role) => (
                <button key={role} onClick={() => setMemberRoleFilter(role)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium capitalize ring-1', memberRoleFilter === role ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200')}>
                  {role === 'all' ? `All members (${users.length})` : `${role === 'driver' ? 'Drivers' : 'Owners'} (${role === 'driver' ? drivers.length : owners.length})`}
                </button>
              ))}
            </div>
            {filteredUsers.map((member) => (
              <div key={member.id} className="card flex flex-wrap items-center gap-3 p-4">
                <Avatar name={member.full_name} src={member.avatar_url} size={42} verified={member.is_verified} />
                <div className="min-w-0 flex-1"><p className="font-medium text-ink-900">{member.full_name || 'Unnamed member'}</p><p className="truncate text-xs text-ink-500">{member.email || 'No email'} · {member.phone || 'No phone'} · <span className="capitalize">{member.role}</span></p><p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-700"><CalendarDays className="h-3.5 w-3.5" /> Joined {formatDate(member.created_at)}</p></div>
                {member.is_suspended && <span className="badge-danger"><Ban className="h-3 w-3" /> Suspended</span>}
                {member.is_suspended && <button onClick={() => unban(member)} className="btn-secondary px-3 py-2 text-sm text-success"><ShieldCheck className="h-4 w-4" /> Reinstate</button>}
                <button onClick={() => setViewingUser(member)} className="btn-primary px-3 py-2 text-sm"><Eye className="h-4 w-4" /> Manage profile</button>
              </div>
            ))}
            {filteredUsers.length === 0 && <p className="text-sm text-ink-500">No users found.</p>}
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
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'}</p><p className="mt-0.5 text-xs font-medium text-brand-700">Joined {formatDate(u.created_at)} · {timeAgo(u.created_at)}</p>
                  {u.licence_number && <p className="text-xs text-ink-400">Licence: {u.licence_number} (exp. {u.licence_expiry || '—'})</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  {!u.is_suspended && u.verification_status === 'approved' && <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> History approved</span>}
                  {!u.is_suspended && u.verification_status === 'rejected' && <span className="badge badge-danger"><XCircle className="inline h-3 w-3" /> History rejected</span>}
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  {!u.is_suspended && u.verification_status !== 'approved' && <button onClick={() => setViewingUser(u)} className="btn-primary px-3 py-1 text-xs">Approve history</button>}
                  {!u.is_suspended && u.verification_status !== 'rejected' && <button onClick={() => rejectVerification(u)} className="btn-secondary px-3 py-1 text-xs">Reject history</button>}
                  <button onClick={() => setEditingUser(u)} aria-label={`Edit ${u.full_name}`} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Chat</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspensionReportId(null); setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
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
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'}</p><p className="mt-0.5 text-xs font-medium text-brand-700">Joined {formatDate(u.created_at)} · {timeAgo(u.created_at)}</p>
                  <p className="text-xs text-ink-400">{vehicles.filter((v) => v.owner_id === u.id).length} car(s) listed</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  <button onClick={() => setEditingUser(u)} aria-label={`Edit ${u.full_name}`} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Chat</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => unban(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
                  ) : (
                    <button onClick={() => { setSuspensionReportId(null); setSuspendingUser(u); setSuspendReason(''); }} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
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
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(['all', 'live', 'pending'] as const).map((filter) => <button key={filter} onClick={() => setCarStatusFilter(filter)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium capitalize ring-1', carStatusFilter === filter ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200')}>{filter === 'all' ? 'All listings' : `${filter} listings`}</button>)}
            </div>
            {filteredVehicles.map((v) => (
              <div key={v.id} className="card flex items-center gap-3 p-4">
                <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-ink-100">
                  {v.photos && v.photos[0] ? (
                    <ModeratedImage src={v.photos[0].photo_url} alt={`${v.make} ${v.model}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Car className="h-6 w-6 text-ink-300" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{v.make} {v.model} ({v.year})</p>
                  <p className="text-xs text-ink-500">{v.location} · {v.transmission} · {v.fuel_type} · KES {v.weekly_target || 0}/week</p>
                  <p className="text-xs text-ink-400">Owner: {v.owner?.full_name || 'Unknown'} · {v.status} · {timeAgo(v.created_at)}</p>
                  <span className={cn('mt-1 inline-flex badge capitalize', v.approval_status === 'approved' ? 'badge-success' : v.approval_status === 'rejected' ? 'badge-danger' : 'badge-warning')}>{v.approval_status}</span>
                  {v.approval_note && <p className="mt-1 text-xs text-danger">Admin note: {v.approval_note}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setReviewingVehicle(v)} className="btn-primary px-3 py-2 text-sm"><Eye className="h-4 w-4" /> View all images</button>
                  <button onClick={() => setEditingVehicle(v)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /> Edit</button>
                  <button onClick={() => setConfirmAction({ message: `${v.status === 'active' ? 'Remove' : 'Restore'} "${v.make} ${v.model}"?`, label: v.status === 'active' ? 'Remove' : 'Restore', onConfirm: () => toggleVehicle(v) })} className={cn('text-sm', v.status === 'active' ? 'btn-secondary' : 'btn-primary')}>
                    {v.status === 'active' ? 'Remove' : 'Restore'}
                  </button>
                  <button onClick={() => setConfirmAction({ message: `Permanently delete "${v.make} ${v.model}"? This cannot be undone.`, label: 'Delete', onConfirm: () => deleteVehicle(v.id) })} aria-label={`Delete ${v.make} ${v.model}`} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /></button>
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
                <button onClick={() => setConfirmAction({ message: 'Delete this document? This cannot be undone.', label: 'Delete', onConfirm: () => deleteDoc(d.id) })} aria-label={`Delete ${d.label || 'document'}`} className="btn-ghost text-danger text-sm"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
              {documents.length === 0 && <p className="text-sm text-ink-500">No trust evidence uploaded yet.</p>}
              </div>
            </section>
          </div>
        )}

        {/* ---------- Reports ---------- */}
        {tab === 'contact' && !loading && (
          <div className="space-y-3">
            {contactMessages.map((message) => (
              <div key={message.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-900">{message.name} <span className={message.status === 'new' ? 'badge-warning ml-2' : 'badge-success ml-2'}>{message.status}</span></p>
                    <a href={`mailto:${message.email}`} className="text-sm text-brand-700 hover:underline">{message.email}</a>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{message.message}</p>
                    <p className="mt-2 text-xs text-ink-400">{formatDateTime(message.created_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {message.status === 'new' && <button onClick={() => resolveContactMessage(message)} className="btn-primary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Resolve</button>}
                    <button onClick={() => setConfirmAction({ message: `Delete the message from ${message.name}?`, label: 'Delete', onConfirm: () => deleteContactMessage(message) })} className="btn-ghost px-3 py-1.5 text-xs text-danger"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {contactMessages.length === 0 && <p className="text-sm text-ink-500">No contact messages yet.</p>}
          </div>
        )}

        {/* ---------- Reports ---------- */}
        {tab === 'reports' && !loading && (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-medium text-ink-900">{r.reason} <span className="capitalize text-ink-400">({r.target_type})</span></p><p className="mt-0.5 text-xs text-ink-500">Reported: {r.reported?.full_name || 'Unknown user'} · By: {r.reporter?.full_name || 'Unknown reporter'}</p></div>
                  <span className={cn('badge capitalize', ['open', 'reviewing'].includes(r.status) && 'badge-warning', r.status === 'resolved' && 'badge-success', r.status === 'dismissed' && 'badge-neutral')}>{r.status === 'resolved' ? 'Solved' : r.status}</span>
                </div>
                {r.description && <p className="mt-2 line-clamp-2 text-sm text-ink-600">{r.description}</p>}
                <p className="mt-1 text-xs text-ink-400">{timeAgo(r.created_at)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={() => setViewingReport(r)} className="btn-primary px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> View report and actions</button>{(r.warnings || []).length > 0 && <span className="badge-warning">Warning sent</span>}</div>
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
                  <button onClick={() => setViewingHistory(h)} className="btn-primary px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> Review</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------- Chat ---------- */}
        {tab === 'chat' && !loading && <AdminChat user={user} onDataChange={load} />}

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
        <Modal title={`Suspend ${suspendingUser.full_name}`} onClose={() => { setSuspendingUser(null); setSuspendReason(''); setSuspensionReportId(null); }}>
          <p className="text-sm text-ink-600">This user will be immediately logged out and shown a suspension message. They will not be able to use {siteSettings.site_name} until reinstated.</p>
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
            <button onClick={() => { setSuspendingUser(null); setSuspendReason(''); setSuspensionReportId(null); }} className="btn-secondary flex-1">Cancel</button>
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
          onSuspend={() => { setSuspensionReportId(null); setSuspendingUser(viewingUser); setSuspendReason(''); setViewingUser(null); }}
          onReinstate={() => unban(viewingUser)}
          onViewDoc={async (doc: DocumentRow) => {
            const { data } = await supabase.from('documents').select('*').eq('user_id', viewingUser.id).eq('type', doc.type).maybeSingle();
            if (data) setViewingDoc(data as DocumentRow);
          }}
          onChangePin={() => { setChangingPinUser(viewingUser); setViewingUser(null); }}
          onDelete={() => { setDeletingUser(viewingUser); setViewingUser(null); }}
          onMessage={() => { adminStartChat(viewingUser); setViewingUser(null); }}
          onEdit={() => { setEditingUser(viewingUser); setViewingUser(null); }}
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
              const { error } = await supabase.from('driver_platform_history').update({ approved: false, proof_url: null }).eq('id', viewingHistory.id);
              if (error) { toast('Could not reject platform history: ' + error.message, 'error'); return; }
              const { count } = await supabase.from('driver_platform_history').select('id', { count: 'exact', head: true }).eq('driver_id', viewingHistory.driver_id).eq('approved', true);
              if (count === 0) await supabase.from('profiles').update({ is_verified: false, verification_status: 'rejected' }).eq('id', viewingHistory.driver_id);
              await notifyUser(viewingHistory.driver_id, 'trust', 'Platform history rejected', reason.trim());
              toast('Platform history rejected.'); setViewingHistory(null); load();
            }} className="btn-secondary"><X className="h-4 w-4" /> Reject</button>
            <button onClick={async () => { const { error } = await supabase.from('driver_platform_history').update({ approved: true }).eq('id', viewingHistory.id); if (error) { toast('Could not approve platform history: ' + error.message, 'error'); return; } const { error: profileError } = await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', viewingHistory.driver_id); if (profileError) { toast('History was approved, but the driver signal could not be updated: ' + profileError.message, 'error'); return; } await notifyUser(viewingHistory.driver_id, 'trust', 'Platform history approved', `Your recent ${viewingHistory.platform} history is now approved on ${siteSettings.site_name}.`); toast('Platform history approved and public signal updated.'); setViewingHistory(null); load(); }} className="btn-primary"><Check className="h-4 w-4" /> Approve</button>
          </div>
        </Modal>
      )}

      {/* Edit user modal */}
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onDone={() => { setEditingUser(null); load(); }} toast={toast} />
      )}

      {reviewingVehicle && (
        <ReviewVehicleModal
          vehicle={reviewingVehicle}
          loading={listingActionLoading}
          onClose={() => setReviewingVehicle(null)}
          onApprove={() => approveListing(reviewingVehicle)}
          onReject={(reason) => rejectListing(reviewingVehicle, reason)}
        />
      )}

      {viewingReport && (
        <ReportReviewModal
          report={viewingReport}
          onClose={() => setViewingReport(null)}
          onWarn={(message) => issueReportWarning(viewingReport, message)}
          onContact={() => {
            if (!viewingReport.reported) return;
            adminStartChat(viewingReport.reported, viewingReport);
            setViewingReport(null);
          }}
          onOpenConversation={viewingReport.target_type === 'conversation' && viewingReport.target_id ? () => {
            const conversationId = viewingReport.target_id!;
            setViewingReport(null);
            setTab('chat');
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('admin-open-chat', { detail: conversationId })), 50);
          } : undefined}
          onViewProfile={() => {
            if (viewingReport.reported) setViewingUser(viewingReport.reported);
            setViewingReport(null);
          }}
          onSuspend={() => {
            if (viewingReport.reported) {
              setSuspensionReportId(viewingReport.id);
              setSuspendingUser(viewingReport.reported);
              setSuspendReason(`Report: ${viewingReport.reason}${viewingReport.description ? ` — ${viewingReport.description}` : ''}`);
            }
            setViewingReport(null);
          }}
          onStatus={async (status) => { await resolveReport(viewingReport, status); setViewingReport(null); }}
        />
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

function ReportReviewModal({ report, onClose, onWarn, onContact, onOpenConversation, onViewProfile, onSuspend, onStatus }: {
  report: AdminReport;
  onClose: () => void;
  onWarn: (message: string) => Promise<boolean>;
  onContact: () => void;
  onOpenConversation?: () => void;
  onViewProfile: () => void;
  onSuspend: () => void;
  onStatus: (status: 'resolved' | 'dismissed') => void | Promise<void>;
}) {
  const [warningMessage, setWarningMessage] = useState('Please review our community rules and correct this behaviour immediately.');
  const [sending, setSending] = useState(false);
  const warningSent = (report.warnings || []).length > 0;
  const sendWarning = async () => {
    setSending(true);
    await onWarn(warningMessage);
    setSending(false);
  };
  return (
    <Modal title={`Report: ${report.reason}`} onClose={onClose} size="xl">
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <div className="grid gap-3 rounded-xl bg-ink-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow label="Status" value={<span className="capitalize">{report.status === 'resolved' ? 'Solved' : report.status}</span>} />
          <InfoRow label="Target" value={<span className="capitalize">{report.target_type}</span>} />
          <InfoRow label="Submitted" value={formatDateTime(report.created_at)} />
          <InfoRow label="Target ID" value={report.target_id || 'Not supplied'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Reported user</p><p className="mt-1 font-semibold text-ink-900">{report.reported?.full_name || 'Unknown user'}</p><p className="text-sm text-ink-500">{report.reported?.email || 'No email'} · {report.reported?.phone || 'No phone'}</p></div>
          <div className="rounded-xl border border-ink-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Reported by</p><p className="mt-1 font-semibold text-ink-900">{report.reporter?.full_name || 'Unknown reporter'}</p><p className="text-sm text-ink-500">{report.reporter?.email || 'No email'} · {report.reporter?.phone || 'No phone'}</p></div>
        </div>
        <div><p className="label">What was reported</p><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-semibold text-amber-900">{report.reason}</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">{report.description || 'No additional description was supplied.'}</p></div></div>
        {warningSent ? (
          <div className="rounded-xl border border-amber-200 p-4"><p className="font-semibold text-amber-800">Warning already sent for this report</p>{report.warnings!.map((warning) => <div key={warning.id} className="mt-2 text-sm text-ink-600"><p>{warning.message}</p><p className="text-xs text-ink-400">{formatDateTime(warning.created_at)}</p></div>)}</div>
        ) : report.reported ? (
          <div><label className="label">Warning message</label><textarea value={warningMessage} onChange={(event) => setWarningMessage(event.target.value)} rows={3} className="input" /><p className="mt-1 text-xs text-ink-500">The member will also receive the report reason, report details, their warning count, and: “Three warnings may lead to account suspension.”</p><button onClick={sendWarning} disabled={sending || warningMessage.trim().length < 3} className="btn-secondary mt-3 text-amber-800"><Flag className="h-4 w-4" /> {sending ? 'Sending…' : 'Send warning'}</button></div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          {onOpenConversation && <button onClick={onOpenConversation} className="btn-primary"><Headphones className="h-4 w-4" /> Open connection chat</button>}
          {report.reported && <><button onClick={onViewProfile} className="btn-secondary"><Eye className="h-4 w-4" /> User profile</button><button onClick={onContact} className="btn-secondary"><MessageSquare className="h-4 w-4" /> Contact user</button><button onClick={onSuspend} className="btn-secondary text-danger"><Ban className="h-4 w-4" /> Suspend user</button></>}
          <div className="flex-1" />
          <button onClick={() => onStatus('dismissed')} className="btn-ghost">Dismiss report</button>
          <button onClick={() => onStatus('resolved')} className="btn-primary"><Check className="h-4 w-4" /> Mark resolved</button>
        </div>
      </div>
    </Modal>
  );
}

function ReviewVehicleModal({ vehicle, loading, onClose, onApprove, onReject }: {
  vehicle: AdminVehicle;
  loading: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState(vehicle.approval_note || '');
  const photos = [...(vehicle.photos || [])].sort((a, b) => a.position - b.position);
  return (
    <Modal title={`Review listing: ${vehicle.make} ${vehicle.model}`} onClose={onClose} size="xl">
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('badge capitalize', vehicle.approval_status === 'approved' ? 'badge-success' : vehicle.approval_status === 'rejected' ? 'badge-danger' : 'badge-warning')}>{vehicle.approval_status}</span>
          <span className="text-sm text-ink-500">Owner: {vehicle.owner?.full_name || 'Unknown'} · {vehicle.location}</span>
        </div>
        <section>
          <div className="flex items-center justify-between"><h4 className="font-semibold text-ink-900">All vehicle images</h4><span className="text-xs text-ink-500">{photos.length} total</span></div>
          {photos.length > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo, index) => (
            <figure key={photo.id} className="overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
              <ModeratedImage src={photo.photo_url} alt={`${vehicle.make} ${vehicle.model}, image ${index + 1}`} className="aspect-[4/3] w-full object-contain" />
              <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-ink-500"><span>Image {index + 1}</span><span className={cn('badge', photo.approved ? 'badge-success' : photo.rejected ? 'badge-danger' : 'badge-warning')}>{photo.approved ? 'Approved' : photo.rejected ? 'Rejected' : 'Pending'}</span></figcaption>
            </figure>
          ))}</div> : <div className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">No images uploaded. This listing cannot be approved.</div>}
        </section>
        <section className="grid gap-3 rounded-xl bg-ink-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Vehicle" value={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
          <InfoRow label="Location" value={vehicle.location} />
          <InfoRow label="Transmission" value={vehicle.transmission} />
          <InfoRow label="Fuel" value={vehicle.fuel_type} />
          <InfoRow label="Minimum experience" value={`${vehicle.minimum_driver_experience_years || 0}+ years`} />
          <InfoRow label="Platform readiness" value={vehicle.registered_platforms?.length ? vehicle.registered_platforms.map((platform) => platform === 'little' ? 'Little Cab' : platform.charAt(0).toUpperCase() + platform.slice(1)).join(', ') : 'None selected'} />
          <InfoRow label="Insurance" value={vehicle.insurance_type} />
          <InfoRow label="Weekly target" value={`KES ${vehicle.weekly_target || 0}`} />
          <InfoRow label="Deposit" value={`KES ${vehicle.deposit || 0}`} />
          <InfoRow label="Availability" value={vehicle.availability} />
        </section>
        {vehicle.requirements && <div><p className="label">Driver requirements</p><p className="text-sm text-ink-600">{vehicle.requirements}</p></div>}
        {(vehicle.issues || []).length > 0 && <div><p className="label">Known issues</p><ul className="space-y-1">{vehicle.issues!.map((issue) => <li key={issue.id} className="text-sm text-ink-600">• {issue.description} <span className="capitalize text-ink-400">({issue.severity})</span></li>)}</ul></div>}
        <div><label className="label">Reason if changes are required</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="input" placeholder="Explain exactly what the owner must correct…" /></div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
          <button onClick={onClose} disabled={loading} className="btn-ghost">Close</button>
          <button onClick={() => onReject(reason)} disabled={loading || !reason.trim()} className="btn-secondary text-danger"><X className="h-4 w-4" /> Require changes</button>
          <button onClick={onApprove} disabled={loading || photos.length === 0 || photos.some((photo) => photo.rejected)} className="btn-primary"><Check className="h-4 w-4" /> {loading ? 'Working…' : 'Approve and publish'}</button>
        </div>
      </div>
    </Modal>
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
  const { settings: liveSettings, loading, refreshSettings } = useSiteSettings();
  const [settings, setSettings] = useState<SiteSettings>(liveSettings);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    setSettings(liveSettings);
  }, [liveSettings]);

  const save = async () => {
    const siteName = settings.site_name.trim();
    if (siteName.length < 2 || siteName.length > 40) { toast('Site name must be between 2 and 40 characters.', 'error'); return; }
    const siteTagline = settings.site_tagline.trim();
    if (siteTagline.length < 10 || siteTagline.length > 100) { toast('Tagline must be between 10 and 100 characters.', 'error'); return; }
    if (Number(settings.max_vehicles_per_owner) < 1 || Number(settings.max_vehicles_per_owner) > 100) { toast('Vehicle limit must be between 1 and 100.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.admin_contact_email.trim())) { toast('Enter a valid admin contact email.', 'error'); return; }
    if (settings.admin_contact_phone.trim().length < 7) { toast('Enter a valid admin contact phone number.', 'error'); return; }
    for (const [label, value] of [['Facebook', settings.facebook_url], ['Instagram', settings.instagram_url], ['LinkedIn', settings.linkedin_url]]) {
      if (!value) continue;
      try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
      catch { toast(`${label} URL must start with http:// or https://.`, 'error'); return; }
    }
    setSaving(true);
    const updated_at = new Date().toISOString();
    const nextSettings = {
      ...settings,
      site_name: siteName,
      site_tagline: siteTagline,
      admin_contact_email: settings.admin_contact_email.trim().toLowerCase(),
      admin_contact_phone: settings.admin_contact_phone.trim(),
      facebook_url: settings.facebook_url.trim(),
      instagram_url: settings.instagram_url.trim(),
      linkedin_url: settings.linkedin_url.trim(),
    };
    const { error } = await supabase.from('site_settings').upsert(
      Object.entries(nextSettings).map(([key, value]) => ({ key, value, updated_at })),
      { onConflict: 'key' },
    );
    if (error) { setSaving(false); toast('Could not save settings: ' + error.message, 'error'); return; }
    await refreshSettings();
    setSaving(false);
    toast('Settings saved and applied across the site.');
  };

  const uploadSiteLogo = async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) { toast('Choose a JPG, PNG, or WebP site image.', 'error'); return; }
    if (file.size > 3 * 1024 * 1024) { toast('Site image must be smaller than 3 MB.', 'error'); return; }
    setUploadingLogo(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `branding/site-logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(SITE_ASSETS_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadError) { setUploadingLogo(false); toast('Could not upload site image: ' + uploadError.message, 'error'); return; }
    const { data } = supabase.storage.from(SITE_ASSETS_BUCKET).getPublicUrl(path);
    const updated_at = new Date().toISOString();
    const { error } = await supabase.from('site_settings').upsert({ key: 'site_logo_url', value: data.publicUrl, updated_at }, { onConflict: 'key' });
    if (error) { setUploadingLogo(false); toast('Image uploaded, but the site setting could not be updated: ' + error.message, 'error'); return; }
    setSettings((current) => ({ ...current, site_logo_url: data.publicUrl }));
    await refreshSettings();
    setUploadingLogo(false);
    toast('Site image updated across the site.');
  };

  const removeSiteLogo = async () => {
    setUploadingLogo(true);
    const { error } = await supabase.from('site_settings').upsert({ key: 'site_logo_url', value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) { setUploadingLogo(false); toast('Could not remove site image: ' + error.message, 'error'); return; }
    setSettings((current) => ({ ...current, site_logo_url: '' }));
    await refreshSettings();
    setUploadingLogo(false);
    toast('Site image removed. The default car icon is active.');
  };

  if (loading) return <div className="card h-40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink-900">Site Settings</h2>
        <p className="mt-1 text-sm text-ink-500">Configure platform-wide settings.</p>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="admin-site-name" className="label">Site name</label>
            <input id="admin-site-name" value={settings['site_name'] || ''} onChange={(e) => setSettings({ ...settings, site_name: e.target.value })} className="input" />
          </div>
          <div>
            <label htmlFor="admin-site-tagline" className="label">Site tagline</label>
            <input id="admin-site-tagline" maxLength={100} value={settings.site_tagline} onChange={(e) => setSettings({ ...settings, site_tagline: e.target.value })} className="input" placeholder="A short promise to your members" />
            <p className="mt-1 text-xs text-ink-400">Shown prominently on the homepage and in the footer.</p>
          </div>
          <div>
            <label className="label">Site image / logo</label>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-4 dark:bg-[#101012]">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink-100 dark:bg-[#1d1d20]">
                {settings.site_logo_url ? <img src={settings.site_logo_url} alt="Current site logo" className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-ink-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-800">Used in the header, footer, sign-in pages, and browser icon.</p>
                <p className="mt-1 text-xs text-ink-500">Upload a square JPG, PNG, or WebP up to 3 MB. A transparent PNG works best.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="btn-secondary cursor-pointer text-sm">
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingLogo} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadSiteLogo(file); event.target.value = ''; }} />
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {settings.site_logo_url ? 'Replace image' : 'Upload image'}
                  </label>
                  {settings.site_logo_url && <button type="button" onClick={removeSiteLogo} disabled={uploadingLogo} className="btn-ghost text-sm text-danger">Remove image</button>}
                </div>
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="admin-maintenance" className="label">Maintenance mode</label>
            <select id="admin-maintenance" value={settings['maintenance_mode'] || 'false'} onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.value })} className="input">
              <option value="false">Off</option>
              <option value="true">On (blocks all access)</option>
            </select>
          </div>
          <div>
            <label htmlFor="admin-require-email" className="label">Require email at registration</label>
            <select id="admin-require-email" value={settings['require_email'] || 'true'} onChange={(e) => setSettings({ ...settings, require_email: e.target.value })} className="input">
              <option value="true">Yes (required)</option>
              <option value="false">No (optional)</option>
            </select>
          </div>
          <div>
            <label htmlFor="admin-max-vehicles" className="label">Max vehicles per owner</label>
            <input id="admin-max-vehicles" type="number" value={settings['max_vehicles_per_owner'] || '10'} onChange={(e) => setSettings({ ...settings, max_vehicles_per_owner: e.target.value })} className="input" />
          </div>
          <div>
            <label htmlFor="admin-contact-email" className="label">Admin contact email</label>
            <input id="admin-contact-email" type="email" value={settings['admin_contact_email'] || ''} onChange={(e) => setSettings({ ...settings, admin_contact_email: e.target.value })} className="input" />
          </div>
          <div>
            <label htmlFor="admin-contact-phone" className="label">Admin contact phone</label>
            <input id="admin-contact-phone" inputMode="tel" value={settings.admin_contact_phone} onChange={(e) => setSettings({ ...settings, admin_contact_phone: e.target.value })} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label htmlFor="admin-facebook-url" className="label">Facebook URL</label><input id="admin-facebook-url" type="url" value={settings.facebook_url} onChange={(e) => setSettings({ ...settings, facebook_url: e.target.value })} className="input" placeholder="https://facebook.com/…" /></div>
            <div><label htmlFor="admin-instagram-url" className="label">Instagram URL</label><input id="admin-instagram-url" type="url" value={settings.instagram_url} onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })} className="input" placeholder="https://instagram.com/…" /></div>
            <div><label htmlFor="admin-linkedin-url" className="label">LinkedIn URL</label><input id="admin-linkedin-url" type="url" value={settings.linkedin_url} onChange={(e) => setSettings({ ...settings, linkedin_url: e.target.value })} className="input" placeholder="https://linkedin.com/…" /></div>
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
    registered_platforms: vehicle.registered_platforms || [] as Vehicle['registered_platforms'],
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
    const { data, error } = await supabase.from('vehicle_issues').insert({ vehicle_id: vehicle.id, description: newIssue.description.trim(), severity: newIssue.severity }).select().maybeSingle();
    if (error) { toast('Could not add issue: ' + error.message, 'error'); return; }
    if (data) setIssues([...issues, data as VehicleIssue]);
    setNewIssue({ description: '', severity: 'minor' });
  };

  const removeIssue = async (id: string) => {
    const { error } = await supabase.from('vehicle_issues').delete().eq('id', id);
    if (error) { toast('Could not remove issue: ' + error.message, 'error'); return; }
    setIssues(issues.filter((i) => i.id !== id));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('vehicles').update(form).eq('id', vehicle.id);
    setSaving(false);
    if (error) { toast('Failed to save vehicle: ' + error.message, 'error'); return; }
    toast('Vehicle updated.');
    onDone();
  };

  return (
    <Modal title={`Edit: ${vehicle.make} ${vehicle.model}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Make"><input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="input" /></Field>
        <Field label="Model"><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" /></Field>
        <Field label="Year"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: +e.target.value })} className="input" /></Field>
        <Field label="Location"><PlaceAutocomplete value={form.location} onChange={(location) => setForm({ ...form, location })} /></Field>
        <Field label="Transmission"><select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })} className="input"><option value="manual">Manual</option><option value="automatic">Automatic</option></select></Field>
        <Field label="Fuel type"><select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })} className="input"><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option></select></Field>
        <Field label="Weekly target (KES)"><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: +e.target.value })} className="input" /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vehicle['status'] })} className="input"><option value="active">Active</option><option value="closed">Closed</option></select></Field>
      </div>
      <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input mt-3" /></Field>

      <div className="mt-4">
        <label className="label">Ride-hailing platform readiness</label>
        <div className="flex flex-wrap gap-2">
          {([
            ['uber', 'Uber ready'], ['bolt', 'Bolt ready'], ['little', 'Little Cab ready'], ['faras', 'Faras ready'], ['other', 'Other platform'],
          ] as const).map(([value, label]) => {
            const selected = form.registered_platforms.includes(value);
            return <button key={value} type="button" aria-pressed={selected} onClick={() => setForm({ ...form, registered_platforms: selected ? form.registered_platforms.filter((platform) => platform !== value) : [...form.registered_platforms, value] })} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition', selected ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200 dark:bg-[#1d1d20]')}>{selected ? '✓ ' : ''}{label}</button>;
          })}
        </div>
      </div>

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
            <button onClick={addIssue} aria-label="Add vehicle issue" className="btn-secondary"><Plus className="h-4 w-4" /></button>
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
        <Field label="Location"><PlaceAutocomplete value={form.location} onChange={(location) => setForm({ ...form, location })} /></Field>
        <Field label="Availability"><select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} className="input"><option value="available">Available</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></Field>
        {user.role === 'driver' && <Field label="Platform-history review"><select value={form.verification_status} onChange={(e) => setForm({ ...form, verification_status: e.target.value as VerificationStatus, is_verified: e.target.value === 'approved' })} className="input"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></Field>}
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
function ViewUserModal({ user, onClose, onApprove, onReject, onSuspend, onReinstate, onViewDoc, onChangePin, onDelete, onMessage, onEdit }: {
  user: Profile;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onViewDoc: (doc: DocumentRow) => void;
  onChangePin: () => void;
  onDelete: () => void;
  onMessage: () => void;
  onEdit: () => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [profileReports, setProfileReports] = useState<AdminReport[]>([]);
  const [profileWarnings, setProfileWarnings] = useState<UserWarning[]>([]);

  useEffect(() => {
    (async () => {
      const [docsResult, reportsResult, warningsResult] = await Promise.all([
        user.role === 'driver'
          ? supabase.from('documents').select('*').eq('user_id', user.id).in('type', TRUST_EVIDENCE_TYPES).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase.from('reports').select('*, warnings:user_warnings(*)').eq('reported_id', user.id).order('created_at', { ascending: false }),
        supabase.from('user_warnings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      setDocs((docsResult.data as DocumentRow[]) || []);
      setProfileReports((reportsResult.data as AdminReport[]) || []);
      setProfileWarnings((warningsResult.data as UserWarning[]) || []);
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
            <p className="text-xs text-ink-400">{user.email || 'No registered email'}</p>
            <p className="text-xs text-ink-400">{user.phone || 'No phone'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-50 to-sky-50 p-4 ring-1 ring-brand-100 dark:from-brand-950/20 dark:to-sky-950/20">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm dark:bg-[#1d1d20]"><CalendarDays className="h-5 w-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Platform member since</p><p className="font-display text-lg font-bold text-ink-900">{formatDate(user.created_at)}</p><p className="text-xs text-ink-500">Joined {timeAgo(user.created_at)}</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {user.role === 'driver' && <InfoRow label="Platform-history review" value={<span className="capitalize">{user.verification_status}</span>} />}
          <InfoRow label="Suspended" value={user.is_suspended ? 'Yes' : 'No'} />
          <InfoRow label="Rating" value={user.rating > 0 ? `${user.rating.toFixed(1)} (${user.rating_count})` : 'No ratings'} />
          <InfoRow label="Availability" value={<span className="capitalize">{user.availability}</span>} />
          <InfoRow label="Location" value={user.location || 'Not set'} />
          <InfoRow label="Registered email" value={user.email || 'Not set'} />
          {user.role === 'driver' && <InfoRow label="Age" value={user.age ? String(user.age) : 'Not set'} />}
          {user.role === 'driver' && <InfoRow label="Experience" value={`${user.driving_experience_years} ${user.driving_experience_years === 1 ? 'year' : 'years'}`} />}
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

        <div>
          <div className="flex items-center justify-between"><p className="label">Reports and warnings</p><span className={cn('badge', profileWarnings.length >= 3 ? 'badge-danger' : profileWarnings.length > 0 ? 'badge-warning' : 'badge-neutral')}>{profileWarnings.length} warning{profileWarnings.length === 1 ? '' : 's'}</span></div>
          {profileReports.length === 0 ? <p className="text-sm text-ink-400">No reports have been filed against this user.</p> : (
            <div className="space-y-4">
              {(['open', 'reviewing', 'resolved', 'dismissed'] as const).map((status) => {
                const grouped = profileReports.filter((report) => report.status === status);
                if (grouped.length === 0) return null;
                return <section key={status}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{status === 'resolved' ? 'Solved' : status} ({grouped.length})</p><div className="space-y-2">{grouped.map((report) => <div key={report.id} className="rounded-xl border border-ink-100 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink-800">{report.reason}</p>{(report.warnings || []).length > 0 && <span className="badge-warning">Warned</span>}</div><p className="mt-1 text-xs text-ink-600">{report.description || 'No additional details.'}</p><p className="mt-1 text-[11px] capitalize text-ink-400">{report.target_type} · {formatDateTime(report.created_at)}</p></div>)}</div></section>;
              })}
            </div>
          )}
          {profileWarnings.length >= 3 && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">This user has reached three warnings. Review the reports before deciding whether suspension is appropriate.</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
        <button onClick={onClose} className="btn-secondary">Close</button>
        <button onClick={onMessage} className="btn-secondary"><MessageSquare className="h-4 w-4" /> Message</button>
        <button onClick={onEdit} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit profile</button>
        {user.role === 'driver' && !user.is_suspended && user.verification_status !== 'approved' && (
          <button onClick={onApprove} className="btn-primary"><Check className="h-4 w-4" /> Approve history</button>
        )}
        {user.role === 'driver' && !user.is_suspended && user.verification_status !== 'rejected' && (
          <button onClick={onReject} className="btn-secondary"><X className="h-4 w-4" /> Reject history</button>
        )}
        <button onClick={onChangePin} className="btn-secondary"><KeyRound className="h-4 w-4" /> Change password</button>
        {user.is_suspended ? (
          <button onClick={onReinstate} className="btn-primary"><ShieldCheck className="h-4 w-4" /> Reinstate account</button>
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
function AdminChat({ user, onDataChange }: { user: { id: string; email: string } | null; onDataChange: () => void | Promise<void> }) {
  const { toast } = useToast();
  const { settings: siteSettings } = useSiteSettings();
  const [conversations, setConversations] = useState<(Conversation & { driver?: Profile; owner?: Profile })[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [joinedConversationIds, setJoinedConversationIds] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState(false);
  const [confirmCloseChat, setConfirmCloseChat] = useState(false);
  const [confirmLeaveChat, setConfirmLeaveChat] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const [{ data }, { data: memberships }] = await Promise.all([
      supabase.from('conversations').select(`*, driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('last_message_at', { ascending: false, nullsFirst: false }),
      supabase.from('conversation_admins').select('conversation_id').eq('admin_id', user.id),
    ]);
    setConversations((data as (Conversation & { driver?: Profile; owner?: Profile })[]) || []);
    setJoinedConversationIds(new Set((memberships || []).map((membership) => membership.conversation_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string | { conversationId: string; prefill?: string }>).detail;
      if (typeof detail === 'string') {
        setActiveId(detail);
      } else {
        setActiveId(detail.conversationId);
        if (detail.prefill) setText(detail.prefill);
      }
    };
    window.addEventListener('admin-open-chat', handler);
    return () => window.removeEventListener('admin-open-chat', handler);
  }, []);

  const active = conversations.find((c) => c.id === activeId) || null;

  const loadMessages = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase.from('messages').select(`*, sender:profiles!messages_sender_id_fkey(${PUBLIC_PROFILE_FIELDS})`).eq('conversation_id', activeId).order('created_at', { ascending: true });
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
          loadMessages();
          if (m.sender_id !== user.id) supabase.from('messages').update({ read: true }).eq('id', m.id);
        }
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeId, loadConversations, loadMessages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!user || !activeId || !text.trim()) return;
    if (!active || (active.admin_id !== user.id && !joinedConversationIds.has(active.id))) { toast('Join this conversation before sending a message.', 'error'); return; }
    const content = text.trim();
    const { error } = await supabase.rpc('send_message', { p_conversation_id: activeId, p_content: content });
    if (error) { toast('Could not send message: ' + error.message, 'error'); return; }
    setText('');
    await loadMessages();
    loadConversations();
  };

  const uploadChatImage = async (file: File) => {
    if (!user || !activeId || !active) return;
    if (active.closed_at) { toast('This chat is read-only. Reopen it before sending an image.', 'error'); return; }
    if (active.admin_id !== user.id && !joinedConversationIds.has(active.id)) { toast('Join this conversation before sending an image.', 'error'); return; }
    setUploadingImage(true);
    let path: string | null = null;
    try {
      const prepared = await prepareChatImageUpload(file);
      path = `${active.id}/${user.id}/chat-${Date.now()}-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, prepared, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: messageError } = await supabase.rpc('send_chat_image', {
        p_conversation_id: active.id,
        p_path: path,
      });
      if (messageError) throw messageError;
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (error) {
      if (path) await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path]);
      toast(`Could not send image: ${error instanceof Error ? error.message : 'Please try again.'}`, 'error');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const joinConversation = async (conversationId: string) => {
    const wasClosed = conversations.find((conversation) => conversation.id === conversationId)?.closed_at != null;
    setJoining(true);
    const { error } = await supabase.rpc('admin_join_conversation', { p_conversation_id: conversationId });
    setJoining(false);
    if (error) { toast('Could not join conversation: ' + error.message, 'error'); return; }
    setJoinedConversationIds((current) => new Set(current).add(conversationId));
    toast(wasClosed ? 'Support session opened. Both members can message again.' : 'You joined the conversation. Both members were notified in chat.');
    await loadMessages();
    loadConversations();
  };

  const leaveConversation = async () => {
    if (!active) return;
    setLeaving(true);
    const { error } = await supabase.rpc('admin_leave_conversation', { p_conversation_id: active.id });
    setLeaving(false);
    setConfirmLeaveChat(false);
    if (error) { toast('Could not leave conversation: ' + error.message, 'error'); return; }
    setJoinedConversationIds((current) => {
      const next = new Set(current);
      next.delete(active.id);
      return next;
    });
    toast('You left the conversation. Its history remains available to admins.');
    await Promise.all([loadMessages(), loadConversations()]);
  };

  const closeMemberChat = async () => {
    if (!active) return;
    const { data, error } = await supabase.rpc('admin_close_conversation_chat', { p_conversation_id: active.id });
    if (error) { toast('Could not close the chat: ' + error.message, 'error'); return; }
    toast(data === 'support_resolved'
      ? 'Support session resolved. The chat is read-only again and its history remains saved.'
      : 'Chat closed by admin. Members can no longer send messages.');
    await loadMessages();
    await loadConversations();
    await onDataChange();
  };

  if (loading) return <div className="card h-64 animate-pulse" />;

  if (conversations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-ink-300" />
        <p className="mt-3 text-sm text-ink-500">No conversations yet. Member chats and direct support conversations will appear here.</p>
      </div>
    );
  }

  const other = active?.driver || active?.owner;
  const activeJoined = Boolean(active && (active.admin_id === user?.id || joinedConversationIds.has(active.id)));
  const supportSessionActive = Boolean(active?.support_reopened_at && !active.support_resolved_at && !active.closed_at);
  const canLeaveLiveChat = Boolean(active && active.driver && active.owner && !active.closed_at && !supportSessionActive && active.admin_id !== user?.id && joinedConversationIds.has(active.id));

  return (
    <div className="grid h-[70vh] gap-4 lg:grid-cols-[300px_1fr]">
      <div className={cn('card overflow-y-auto', active && 'hidden lg:block')}>
        {conversations.map((c) => {
          const u = c.driver || c.owner;
          const joined = c.admin_id === user?.id || joinedConversationIds.has(c.id);
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={cn('flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left hover:bg-ink-50', activeId === c.id && 'bg-brand-50')}>
              <Avatar name={u?.full_name || 'User'} src={u?.avatar_url} size={44} verified={u?.is_verified} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{c.driver && c.owner ? `Driver: ${c.driver.full_name} ↔ Car owner: ${c.owner.full_name}` : u?.full_name}</p>
                <p className="text-xs text-ink-500">{c.driver && c.owner ? 'Driver and car-owner conversation' : `${u?.role === 'owner' ? 'Car owner' : u?.role === 'driver' ? 'Driver' : 'Member'} · direct support`}</p>
                <p className="mt-0.5 text-[10px] text-ink-400">{formatDateTime(c.last_message_at || c.created_at)}</p>
              </div>
              <div className="text-right">{c.support_reopened_at && !c.support_resolved_at && !c.closed_at ? <span className="badge bg-violet-100 text-[10px] text-violet-700">Support open</span> : joined && <span className="badge badge-success text-[10px]">Joined</span>}{c.last_message_at && <span className="mt-1 block text-[10px] text-ink-400">{timeAgo(c.last_message_at)}</span>}</div>
            </button>
          );
        })}
      </div>

      <div className={cn('card flex flex-col overflow-hidden', !active && 'hidden lg:flex')}>
        {active && other ? (
          <>
            <div className="flex items-center gap-3 border-b border-ink-100 p-4">
              <button onClick={() => setActiveId(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /> Back</button>
              <Avatar name={other.full_name} src={other.avatar_url} size={40} verified={other.role === 'driver' && other.is_verified} />
              <div>
                <p className="font-semibold text-ink-900">{active.driver && active.owner ? `Driver: ${active.driver.full_name} ↔ Car owner: ${active.owner.full_name}` : other.full_name}</p>
                <p className="text-xs text-brand-600">{active.closed_at ? 'Ended · preserved history' : supportSessionActive ? 'Reopened support session · members can chat' : active.driver && active.owner ? 'Active driver and car-owner chat' : `${other.role === 'owner' ? 'Car owner' : 'Driver'} · direct support`}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{active.closed_at ? <button onClick={() => joinConversation(active.id)} disabled={joining} className="btn-primary text-xs"><Headphones className="h-4 w-4" /> {joining ? 'Reopening…' : 'Reopen with support'}</button> : !activeJoined ? <button onClick={() => joinConversation(active.id)} disabled={joining} className="btn-primary text-xs"><UserPlus className="h-4 w-4" /> {joining ? 'Joining…' : 'Join chat'}</button> : <span className="badge badge-success"><Check className="h-3.5 w-3.5" /> Joined</span>}{canLeaveLiveChat && <button onClick={() => setConfirmLeaveChat(true)} disabled={leaving} className="btn-secondary text-xs"><UserMinus className="h-4 w-4" /> Leave chat</button>}{active.driver && active.owner && !active.closed_at && <button onClick={() => setConfirmCloseChat(true)} className="btn-secondary text-xs"><LockKeyhole className="h-4 w-4" /> {supportSessionActive ? 'End support chat' : 'Close chat'}</button>}</div>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-ink-50/50 p-4">
              {messages.map((m) => {
                const mine = m.sender_id === user?.id;
                const senderName = m.type === 'system' ? `${siteSettings.site_name} system` : (m.sender?.full_name || (mine ? 'Administrator' : 'Member'));
                return (
                  <div key={m.id} className={cn('flex', m.type === 'system' ? 'justify-center' : mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', m.type === 'system' ? 'bg-violet-50 text-center text-xs text-violet-800 ring-1 ring-violet-100' : mine ? 'bg-brand-600 text-white' : 'bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}>
                      <p className={cn('mb-1 text-[10px] font-bold', mine && m.type !== 'system' ? 'text-brand-100' : m.sender?.role === 'admin' || m.type === 'system' ? 'text-violet-600' : 'text-brand-700')}>{senderName}{m.sender?.role === 'admin' && m.type !== 'system' ? ' · Admin' : ''}</p>
                      {m.type === 'image' ? <ChatMediaImage src={m.content || ''} alt={`Image from ${senderName}`} /> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      <div className={cn('mt-0.5 text-[10px]', mine && m.type !== 'system' ? 'text-brand-100' : 'text-ink-400')}>{formatMessageTimestamp(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {activeJoined && !active.closed_at ? <div className="flex items-center gap-2 border-t border-ink-100 p-3">
              <input ref={imageInputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadChatImage(file); }} />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} aria-label="Send an image" title="Send an image" className="rounded-full p-2 text-ink-500 hover:bg-ink-100 disabled:cursor-wait disabled:opacity-60">{uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}</button>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" className="input flex-1" />
              <button onClick={send} disabled={!text.trim()} aria-label="Send message" className="btn-primary px-3"><Send className="h-4 w-4" /></button>
            </div> : <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><LockKeyhole className="h-4 w-4" />This history is read-only. Click Reopen with support to let both members and support message again.</div>}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ink-400">
            <p className="text-sm">Select a conversation to start chatting.</p>
          </div>
        )}
      </div>
      {confirmCloseChat && <ConfirmDialog title={supportSessionActive ? 'End this support session?' : 'Close this member chat?'} message={supportSessionActive ? 'Both members will lose the ability to send new messages again. The complete history will remain saved and readable.' : 'Both members will immediately lose the ability to send new messages in this chat. This does not delete the history.'} confirmLabel={supportSessionActive ? 'End support chat' : 'Close chat'} danger={!supportSessionActive} onConfirm={closeMemberChat} onClose={() => setConfirmCloseChat(false)} />}
      {confirmLeaveChat && <ConfirmDialog title="Leave this live chat?" message="You will stop participating in this conversation. The members can keep chatting, the full history remains saved, and you can join again later." confirmLabel={leaving ? 'Leaving…' : 'Leave chat'} onConfirm={leaveConversation} onClose={() => { if (!leaving) setConfirmLeaveChat(false); }} />}
    </div>
  );
}

function formatMessageTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
