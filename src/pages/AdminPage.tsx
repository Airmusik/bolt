import { ProfileName } from '@/components/ProfileName';
import { SupportReceipt } from '@/components/SupportReceipt';
import { AdminMemberUpload } from '@/components/AdminMemberUpload';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AdminAdvertisements } from '@/components/AdminAdvertisements';
import { AdminSiteAnalytics } from '@/components/AdminSiteAnalytics';
import { AdminMemberUpdates } from '@/components/AdminMemberUpdates';
import { AdminSupportChatHeader } from '@/components/AdminSupportChatHeader';
import { AdminLegalContent } from '@/components/AdminLegalContent';
import { AdminAddMember } from '@/components/AdminAddMember';
import { AdminControlCentre } from '@/components/AdminControlCentre';
import { ADMIN_CONTROL_SETTING_KEYS } from '@/lib/adminControlFields';
import { adminView, canonicalAdminParams, adminDestination, adminNavOrder, type AdminTab, type LegacyAdminTab, type SettingsSection } from '@/lib/adminNavigation';
import { changedSettings, mergeSettingsDraft } from '@/lib/adminSettingsDraft';
import { AdminSecurityCentre } from '@/components/AdminSecurityCentre';
import { AdminMfaSetup } from '@/components/AdminMfaSetup';
import { AdminDiagnostics } from '@/components/AdminDiagnostics';
import { CommunityPage } from '@/pages/CommunityPage';
import { AdminChatbot } from '@/components/AdminChatbot';
import { AdminFeedback } from '@/components/AdminFeedback';
import { ReportRemovalAction } from '@/components/ReportRemovalAction';
import { normalizeReportWarnings } from '@/lib/reportWarnings';
import { Users, Car, Flag, TrendingUp, ShieldCheck, MessageSquare, Check, X, Ban, Send, ArrowLeft, FileText, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle, Plus, Settings as SettingsIcon, KeyRound, Save, Mail, UserPlus, LockKeyhole, Upload, ImageIcon, ImagePlus, Loader2, Headphones, CalendarDays, Palette, Megaphone, ChevronUp, ChevronDown, SlidersHorizontal, RotateCcw, Bot } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET, VEHICLE_BUCKET, SITE_ASSETS_BUCKET, CHAT_MEDIA_BUCKET } from '@/lib/supabase';
import type { Profile, Vehicle, Report, DocumentRow, Conversation, Message, VehicleIssue, PlatformHistory, VerificationStatus, VehiclePhoto, ContactMessage, ContactMessageEntry, UserWarning } from '@/lib/types';
import { groupSupportThreads, mergeSupportHistory } from '@/lib/supportHistory';
import { useLegacySupportMessages } from '@/lib/useLegacySupportMessages';
import { LegacySupportContent } from '@/components/LegacySupportContent';
import { type SiteSettings, useSiteSettings } from '@/lib/siteSettings';
import { applySiteTheme, DEFAULT_SITE_THEME, isSiteTheme, SITE_THEMES } from '@/lib/siteTheme';
import { AdminPromotions, OwnerListingAllowance } from '@/components/AdminPromotions';
import { AdminExpiredDocuments } from '@/components/AdminExpiredDocuments';
import { DocumentExpiry } from '@/components/DocumentExpiry';
import { historyState } from '@/lib/documentLifecycle';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { cn, timeAgo, formatDate, formatDateTime } from '@/lib/utils';
import '@/styles/admin.css';

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
import { openContactAttachment, uploadContactAttachment } from '@/lib/contactAttachments';
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea';

type AdminVehicle = Vehicle & { owner?: Profile; photos?: VehiclePhoto[]; issues?: VehicleIssue[]; description?: string };
type AdminDocument = DocumentRow & { user?: Profile; vehicle?: Pick<Vehicle, 'id' | 'make' | 'model' | 'year'> };
type AdminHistory = PlatformHistory & { driver?: Profile };
type AdminReportRow = Report & { reporter?: Profile; reported?: Profile; warnings?: UserWarning | UserWarning[] | null };
type AdminReport = Omit<AdminReportRow, 'warnings'> & { warnings: UserWarning[] };
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

type Tab = AdminTab;

export function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: siteSettings, refreshSettings } = useSiteSettings();
  const [composeTarget, setComposeTarget] = useState<Profile | null>(null);
  const [firstMessage, setFirstMessage] = useState('');
  const [startingSupport, setStartingSupport] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = adminView(searchParams);
  const { tab } = view;
  useEffect(() => {
    const canonical = canonicalAdminParams(searchParams);
    if (canonical.toString() !== searchParams.toString()) setSearchParams(canonical, { replace: true });
  }, [searchParams, setSearchParams]);
  const setTab = useCallback((next: Tab | LegacyAdminTab) => {
    if (next === tab) return;
    setSearchParams(current => adminDestination(current, next));
  }, [tab, setSearchParams]);
  const setReviewSection = (review: typeof view.review) => setSearchParams(current => {
    const next = canonicalAdminParams(current); next.set('tab', 'reviews'); next.set('review', review); return next;
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [uploadUser, setUploadUser] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocumentRow | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<DocumentRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [photoRejection, setPhotoRejection] = useState<{ photo: VehiclePhoto; ownerId: string } | null>(null);
  const [historyRejection, setHistoryRejection] = useState<AdminHistory | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [moderationLoading, setModerationLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void | Promise<void>; label: string } | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<Profile | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [reinstatingUser, setReinstatingUser] = useState<Profile | null>(null);
  const [reinstatementMessage, setReinstatementMessage] = useState('');
  const [reinstating, setReinstating] = useState(false);
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
  const [addingMember, setAddingMember] = useState(false);
  const [organizingTabs, setOrganizingTabs] = useState(false);
  const [navOrderDraft, setNavOrderDraft] = useState<Tab[]>([]);
  const [savingNavOrder, setSavingNavOrder] = useState(false);
  const [suspensionReportId, setSuspensionReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersResult, vehiclesResult, reportsResult, documentsResult, historyResult, contactsResult] = await Promise.all([
      supabase.rpc('admin_list_members'),
      supabase.from('vehicles').select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('reports').select(`*, reporter:profiles!reports_reporter_id_fkey(${PUBLIC_PROFILE_FIELDS}), reported:profiles!reports_reported_id_fkey(${PUBLIC_PROFILE_FIELDS}), warnings:user_warnings(*)`).order('created_at', { ascending: false }),
      supabase.from('documents').select(`*, user:profiles!documents_user_id_fkey(${PUBLIC_PROFILE_FIELDS}), vehicle:vehicles!documents_vehicle_id_fkey(id,make,model,year)`).in('type', TRUST_EVIDENCE_TYPES).order('created_at', { ascending: false }),
      supabase.from('driver_platform_history').select(`*, driver:profiles!driver_platform_history_driver_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('created_at', { ascending: false }),
      supabase.from('contact_messages').select(`*, user:profiles!contact_messages_user_id_fkey(${PUBLIC_PROFILE_FIELDS}), entries:contact_message_entries(*, sender:profiles!contact_message_entries_sender_id_fkey(${PUBLIC_PROFILE_FIELDS}))`).order('updated_at', { ascending: false }),
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
    setReports(((r as AdminReportRow[]) || []).map((report) => ({
      ...normalizeReportWarnings(report),
      reporter: usersById.get(report.reporter_id) || report.reporter,
      reported: report.reported_id ? usersById.get(report.reported_id) || report.reported : report.reported,
    })));
    setDocuments((d as AdminDocument[]) || []);
    setHistory((h as AdminHistory[]) || []);
    setContactMessages(((contacts as ContactMessage[]) || []).map((message) => ({
      ...message,
      message: '',
      entries: [...(message.entries || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('admin-work-queues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_message_entries' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_platform_history' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const drivers = users.filter((u) => u.role === 'driver');
  const owners = users.filter((u) => u.role === 'owner');
  const pendingVerifications = users.filter((u) => u.role === 'driver' && u.verification_status === 'pending');
  const pendingDocs = documents.filter((d) => !d.verified && !d.rejected);
  const pendingVehiclePhotos = vehicles.flatMap((v) => (v.photos || []).filter((photo) => !photo.approved && !photo.rejected).map((photo) => ({ ...photo, vehicle: v })));
  const pendingListings = vehicles.filter((vehicle) => vehicle.approval_status === 'pending');
  const newContactMessages = groupSupportThreads(contactMessages).filter(group => group.latest.status === 'new');
  const unsolvedReports = reports.filter((report) => report.status === 'open' || report.status === 'reviewing');

  const suspend = async (p: Profile, reason: string) => {
    setSuspending(true);
    const { error } = await supabase.rpc('admin_suspend_member', { p_user_id: p.id, p_reason: reason });
    if (error) { toast('Suspend failed: ' + error.message, 'error'); setSuspending(false); return; }
    if (suspensionReportId) {
      const { error: reportError } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', suspensionReportId);
      if (reportError) toast('The user was suspended, but the report could not be marked solved: ' + reportError.message, 'error');
    }
    toast(suspensionReportId ? 'User suspended, notified by email and in-app, and report marked solved.' : 'User suspended and notified by email and in-app.');
    setSuspendingUser(null);
    setSuspendReason('');
    setSuspensionReportId(null);
    setSuspending(false);
    load();
  };
  const reinstate = async (p: Profile, message: string) => {
    setReinstating(true);
    const { error } = await supabase.rpc('admin_reinstate_member', { p_user_id: p.id, p_message: message.trim() || null });
    setReinstating(false);
    if (error) { toast('Reinstate failed: ' + error.message, 'error'); return; }
    toast('User reinstated and notified by email and in-app.');
    setReinstatingUser(null);
    setReinstatementMessage('');
    setViewingUser(null);
    load();
  };
  const openReinstate = (p: Profile) => { setReinstatingUser(p); setReinstatementMessage(''); };
  const resolveReport = async (r: Report, status: 'resolved') => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', r.id);
    if (error) { toast('Could not update report: ' + error.message, 'error'); return false; }
    toast('Report marked solved.');
    await load();
    return true;
  };
  const overturnReport = async (r: Report, reason: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_overturn_report', { p_report_id: r.id, p_reason: reason });
      if (error) throw error;
      toast(data?.rating_after == null ? 'Report removed. Audit history preserved.' : `Report removed. Rating: ${Number(data.rating_before).toFixed(1)} → ${Number(data.rating_after).toFixed(1)}. Its warning no longer counts.`);
      setViewingReport(null);
      await load();
      return true;
    } catch (error) { toast('Could not remove report: ' + ((error as { message?: string })?.message || 'Please try again.'), 'error'); return false; }
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
    const ids = contactMessages.filter(item => message.user_id ? item.user_id === message.user_id : item.id === message.id).map(item => item.id);
    const { error } = await supabase.from('contact_messages').update({ status: 'resolved', resolved_at: new Date().toISOString() }).in('id', ids);
    if (error) { toast('Could not resolve message: ' + error.message, 'error'); return; }
    toast('Contact message marked resolved.');
    load();
  };

  const issueReportWarning = async (report: AdminReport, message: string) => {
    const { data, error } = await supabase.rpc('admin_issue_report_warning', { p_report_id: report.id, p_message: message.trim() });
    if (error) { toast('Could not send warning: ' + error.message, 'error'); return false; }
    toast(`Warning ${Number(data) || 1} recorded. The report is now solved.`);
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

  const rejectVehiclePhoto = async (photo: VehiclePhoto, ownerId: string, reason: string) => {
    setModerationLoading(true);
    const cleanReason = reason.trim();
    const { error } = await supabase.from('vehicle_photos').update({ approved: false, rejected: true, rejection_reason: cleanReason }).eq('id', photo.id);
    if (error) {
      toast('Could not reject vehicle photo: ' + error.message, 'error');
      setModerationLoading(false);
      return;
    }
    await notifyUser(ownerId, 'upload', 'Vehicle photo rejected', `${cleanReason} Please replace it with a corrected image.`);
    toast('Vehicle photo rejected with a reason.');
    setPhotoRejection(null);
    setModerationReason('');
    setModerationLoading(false);
    await load();
  };

  const rejectPlatformHistory = async (item: AdminHistory, reason: string) => {
    setModerationLoading(true);
    const cleanReason = reason.trim();
    const { error } = await supabase.rpc('review_platform_history', { p_id: item.id, p_decision: 'rejected', p_reason: cleanReason, p_submitted_at: item.submitted_at });
    if (error) {
      toast('Could not reject platform history: ' + error.message, 'error');
      setModerationLoading(false);
      return;
    }
    toast('Platform history rejected with a reason.');
    setHistoryRejection(null);
    setModerationReason('');
    setModerationLoading(false);
    await load();
  };

  const approvePlatformHistory = async (item: AdminHistory) => {
    setModerationLoading(true);
    const { error } = await supabase.rpc('review_platform_history', { p_id: item.id, p_decision: 'approved', p_submitted_at: item.submitted_at });
    if (error) {
      toast('Could not approve platform history: ' + error.message, 'error');
      setModerationLoading(false);
      return;
    }
    toast('Platform history approved for six months. The driver was notified.');
    setViewingHistory(null);
    setModerationLoading(false);
    await load();
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
    const { data: existing } = await supabase
      .from('contact_messages')
      .select('id')
      .eq('user_id', targetUser.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const threadId = existing?.id || null;
    if (!threadId) {
      setComposeTarget(targetUser); setFirstMessage(prefill); return;
    }
    setSearchParams({ tab: 'contact', message: threadId });
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
    { key: 'updates', label: 'Member updates', icon: Megaphone },
    { key: 'content', label: 'Page content', icon: FileText },
    { key: 'security', label: 'Security', icon: ShieldCheck },
    { key: 'cars', label: 'Cars', icon: Car, badge: pendingListings.length || vehicles.length },
    { key: 'contact', label: 'Messages', icon: Mail, badge: newContactMessages.length },
    { key: 'feedback', label: 'Feedback', icon: MessageSquare },
    { key: 'community', label: 'Community', icon: Users },
    { key: 'chat', label: 'Support chats', icon: MessageSquare, badge: reports.filter((report) => report.target_type === 'conversation' && report.reason === 'Support requested' && ['open', 'reviewing'].includes(report.status)).length },
    { key: 'reviews', label: 'Uploads & reviews', icon: FileText, badge: pendingDocs.length + pendingVehiclePhotos.length + history.filter(h => historyState(h) === 'pending').length },
    { key: 'reports', label: 'Reports', icon: Flag, badge: unsolvedReports.length },
    { key: 'analytics', label: 'Site analytics', icon: TrendingUp },
    { key: 'promotions', label: 'Promotions', icon: TrendingUp },
    { key: 'advertisements', label: 'Advertisements', icon: Eye },
    { key: 'assistant', label: 'Chat assistant', icon: Bot },
    { key: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const completeNavOrder = adminNavOrder(siteSettings.admin_nav_order, tabs.map(item => item.key));
  const orderedTabs = completeNavOrder.map((key) => tabs.find((item) => item.key === key)).filter((item): item is (typeof tabs)[number] => Boolean(item));
  const openTabOrganizer = () => { setNavOrderDraft(orderedTabs.map((item) => item.key)); setOrganizingTabs(true); };
  const moveNavItem = (index: number, direction: -1 | 1) => setNavOrderDraft((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const saveNavOrder = async () => {
    setSavingNavOrder(true);
    const { error } = await supabase.from('site_settings').upsert({ key: 'admin_nav_order', value: navOrderDraft.join(','), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSavingNavOrder(false);
    if (error) { toast('Could not save the admin button order: ' + error.message, 'error'); return; }
    await refreshSettings();
    setOrganizingTabs(false);
    toast('Admin button order saved.');
  };

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
    <div className="admin-portal container-content py-5 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-brand-600" />
          <h1 className="font-display text-2xl font-bold text-ink-900">Admin Portal</h1>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-500">Manage driver platform-history reviews, upload approvals, listings, reports and member support.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-5 w-5 text-ink-500" />
            <p className="mt-2 font-display text-xl font-bold text-ink-900">{loading ? '—' : s.value}</p>
            <p className="text-xs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="admin-navigation mt-6 flex items-center gap-2 rounded-2xl border border-ink-200 p-2">
        <div className="admin-section-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="Admin sections">
        {orderedTabs.map((t) => (
          <button type="button" key={t.key} aria-pressed={tab === t.key} onClick={() => { if (t.key === 'cars') setCarStatusFilter('all'); setTab(t.key); }} className="admin-nav-button flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900">
            <t.icon className="h-4 w-4" /> {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="admin-nav-count ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{t.badge}</span>}
          </button>
        ))}
        </div>
        <button type="button" onClick={openTabOrganizer} className="btn-secondary min-h-11 shrink-0 px-3" title="Rearrange admin buttons" aria-label="Rearrange admin buttons"><SlidersHorizontal className="h-4 w-4" /><span className="hidden xl:inline">Arrange</span></button>
      </div>

      {organizingTabs && <Modal title="Arrange admin buttons" onClose={() => setOrganizingTabs(false)}>
        <p className="mb-4 text-sm text-ink-500">Move the most-used sections toward the front. The saved order applies to the admin navigation on every device.</p>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {navOrderDraft.map((key, index) => {
            const item = tabs.find((entry) => entry.key === key);
            if (!item) return null;
            return <div key={key} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-sky-800">{index + 1}</span>
              <item.icon className="h-4 w-4 text-teal-700" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">{item.label}</span>
              <button type="button" className="btn-secondary h-9 w-9 p-0" disabled={index === 0} onClick={() => moveNavItem(index, -1)} aria-label={`Move ${item.label} up`}><ChevronUp className="h-4 w-4" /></button>
              <button type="button" className="btn-secondary h-9 w-9 p-0" disabled={index === navOrderDraft.length - 1} onClick={() => moveNavItem(index, 1)} aria-label={`Move ${item.label} down`}><ChevronDown className="h-4 w-4" /></button>
            </div>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={() => setNavOrderDraft(tabs.map((item) => item.key))}><RotateCcw className="h-4 w-4" />Reset</button>
          <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setOrganizingTabs(false)}>Cancel</button><button type="button" className="btn-primary" disabled={savingNavOrder} onClick={() => void saveNavOrder()}><Save className="h-4 w-4" />{savingNavOrder ? 'Saving…' : 'Save order'}</button></div>
        </div>
      </Modal>}

      <div className="mt-6">
        {tab === 'cars' && (
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
              placeholder="Search cars…"
              aria-label="Search cars"
              className="input max-w-xs"
            />
          </div>
        )}

        {loading && <div className="card h-64 animate-pulse" />}

        {/* ---------- Overview ---------- */}
        {composeTarget && <Modal title={`Message ${composeTarget.full_name}`} onClose={() => { if (!startingSupport) setComposeTarget(null); }}><p className="text-sm text-ink-500">Write your first message. Nothing is sent until you press Send.</p><textarea aria-label="First support message" className="input mt-3 min-h-28" maxLength={5000} value={firstMessage} onChange={e => setFirstMessage(e.target.value)} /><button className="btn-primary mt-3" disabled={startingSupport || firstMessage.trim().length < 5} onClick={async () => { setStartingSupport(true); const { data, error } = await supabase.rpc('admin_start_support_thread', { p_user_id: composeTarget.id, p_message: firstMessage.trim() }); setStartingSupport(false); if (error) { toast(error.message, 'error'); return; } await load(); setComposeTarget(null); setSearchParams({ tab: 'contact', message: String(data) }); }}> {startingSupport ? 'Sending…' : 'Send message'}</button></Modal>}
        {tab === 'analytics' && <AdminSiteAnalytics />}
        {tab === 'advertisements' && <AdminAdvertisements />}
        {tab === 'updates' && !loading && <AdminMemberUpdates users={users} />}
        {tab === 'content' && !loading && <AdminLegalContent />}
        {tab === 'security' && !loading && <><AdminMfaSetup /><div className="h-5"/><AdminDiagnostics /><div className="h-5"/><AdminSecurityCentre /></>}
        {tab === 'assistant' && !loading && <AdminChatbot />}
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
                    <button
                      onClick={() => {
                        const pendingItem = history.find((item) => item.driver_id === p.id && !item.approved);
                        if (pendingItem) setViewingHistory(pendingItem);
                        else setViewingUser(p);
                      }}
                      className="btn-primary px-3 py-1 text-xs"
                    ><Eye className="h-3 w-3" /> Review</button>
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
          <section className="admin-members space-y-3" aria-labelledby="admin-members-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 id="admin-members-heading" className="text-xl font-semibold text-ink-900">Members</h2><p className="mt-1 text-sm text-ink-500">Find an account and manage its profile.</p></div>
              <button type="button" onClick={() => setAddingMember(true)} className="admin-add-member btn-primary min-h-11 px-4"><UserPlus className="h-4 w-4" /> Add member</button>
            </div>
            <div className="admin-member-toolbar flex flex-col gap-3 rounded-xl border border-ink-200 p-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-sm">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input type="search" name="member-filter-query" autoComplete="one-time-code" data-form-type="other" data-1p-ignore="true" data-lpignore="true" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, or phone…" aria-label="Search members by name, email, or phone" className="input min-h-11 pl-10" />
              </div>
              <div className="grid grid-cols-3 gap-1.5 xl:flex" role="group" aria-label="Filter members by role">
              {(['all', 'driver', 'owner'] as const).map((role) => (
                <button type="button" key={role} aria-pressed={memberRoleFilter === role} onClick={() => setMemberRoleFilter(role)} className="admin-member-filter min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold sm:px-3">
                  {role === 'all' ? 'All members' : role === 'driver' ? 'Drivers' : 'Owners'} <span className="ml-1 opacity-80">({role === 'all' ? users.length : role === 'driver' ? drivers.length : owners.length})</span>
                </button>
              ))}
              </div>
            </div>
            {addingMember && <AdminAddMember onClose={() => setAddingMember(false)} onCreated={load} />}
            {filteredUsers.map((member) => (
              <article key={member.id} className="admin-member-card card grid min-w-0 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar className="admin-member-avatar" name={member.full_name} src={member.avatar_url} size={44} verified={member.role === 'driver' && member.is_verified} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="break-words font-semibold text-ink-900"><ProfileName id={member.id} name={member.full_name} /></p><span className="admin-member-role rounded-md bg-ink-50 px-2 py-1 text-[11px] font-medium text-ink-600">{member.role === 'owner' ? 'Car owner' : member.role === 'driver' ? 'Driver' : 'Admin'}</span></div>
                    <div className="mt-1 flex flex-col gap-x-3 gap-y-1 text-xs leading-5 text-ink-600 sm:flex-row sm:flex-wrap"><span className="min-w-0 break-all">{member.email || 'No email'}</span><span>{member.phone || 'No phone'}</span></div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500"><CalendarDays className="h-3.5 w-3.5 shrink-0" /> Joined {formatDate(member.created_at)}</p>
                  </div>
                </div>
                <div className="admin-member-controls flex min-w-0 flex-col gap-3 border-t border-ink-100 pt-3 xl:items-end xl:border-0 xl:pt-0">
                  <div className="flex flex-wrap gap-2">
                    <span className={member.email_confirmed ? 'badge-success' : 'badge-warning'}>{member.email_confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}{member.email_confirmed ? 'Email confirmed' : 'Email not confirmed'}</span>
                    {member.is_suspended && <span className="badge-danger"><Ban className="h-3 w-3" /> Suspended</span>}
                  </div>
                  <div className="admin-member-actions flex flex-wrap gap-2">
                {member.email_confirmed === false && member.role !== 'admin' && <button className="btn-secondary px-3 py-2 text-sm" onClick={() => setConfirmAction({ message: `Manually confirm ${member.email}? This bypasses the email-link check. Continue only if you have independently verified that this member owns the address. This action is recorded.`, label: 'Confirm email', onConfirm: async () => { const { error } = await supabase.rpc('admin_confirm_member_email', { p_user: member.id }); if (error) { toast(error.message, 'error'); return; } toast('Email confirmed.'); await load(); } })}>Confirm email</button>}
                {member.is_suspended && <button onClick={() => openReinstate(member)} className="btn-secondary px-3 py-2 text-sm text-success"><ShieldCheck className="h-4 w-4" /> Reinstate</button>}
                <button type="button" onClick={() => setViewingUser(member)} className="admin-member-manage btn-secondary px-3 py-2 text-sm"><Eye className="h-4 w-4" /> Manage profile</button>
                  </div>
                </div>
              </article>
            ))}
            {filteredUsers.length === 0 && <p className="rounded-xl border border-ink-200 p-6 text-center text-sm text-ink-500">No members match this search or filter.</p>}
          </section>
        )}

        {/* ---------- Drivers ---------- */}
        {tab === 'drivers' && !loading && (
          <div className="space-y-2">
            {filteredDrivers.map((u) => (
              <div key={u.id} className="card flex items-center gap-3 p-4">
                <Avatar name={u.full_name} src={u.avatar_url} size={40} verified={u.is_verified} />
                <div className="flex-1">
                  <p className="flex items-center gap-1 font-medium text-ink-900"><ProfileName id={u.id} name={u.full_name} /> <VerifiedBadge verified={u.is_verified} size={12} /></p>
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'}</p><p className="mt-0.5 text-xs font-medium text-brand-700">Joined {formatDate(u.created_at)} · {timeAgo(u.created_at)}</p>
                  {u.licence_number && <p className="text-xs text-ink-400">Licence: {u.licence_number} (exp. {u.licence_expiry || '—'})</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  {!u.is_suspended && u.verification_status === 'approved' && <span className="badge badge-success"><CheckCircle2 className="inline h-3 w-3" /> History approved</span>}
                  {!u.is_suspended && u.verification_status === 'rejected' && <span className="badge badge-danger"><XCircle className="inline h-3 w-3" /> History rejected</span>}
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  {!u.is_suspended && u.verification_status !== 'approved' && <button onClick={() => setTab('history')} className="btn-primary px-3 py-1 text-xs">Review uploads</button>}
                  <button onClick={() => setEditingUser(u)} aria-label={`Edit ${u.full_name}`} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Message</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => openReinstate(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
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
                  <p className="font-medium text-ink-900"><ProfileName id={u.id} name={u.full_name} /></p>
                  <p className="text-xs text-ink-500">{u.phone || 'No phone'} · {u.location || 'No location'}</p><p className="mt-0.5 text-xs font-medium text-brand-700">Joined {formatDate(u.created_at)} · {timeAgo(u.created_at)}</p>
                  <p className="text-xs text-ink-400">{vehicles.filter((v) => v.owner_id === u.id).length} car(s) listed</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.is_suspended && <span className="badge badge-danger"><Ban className="inline h-3 w-3" /> Suspended</span>}
                  <button onClick={() => setViewingUser(u)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> View</button>
                  <button onClick={() => setEditingUser(u)} aria-label={`Edit ${u.full_name}`} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => adminStartChat(u)} className="btn-ghost text-sm"><MessageSquare className="h-4 w-4" /> Message</button>
                  <button onClick={() => setChangingPinUser(u)} className="btn-ghost text-sm"><KeyRound className="h-4 w-4" /> Password</button>
                  {u.is_suspended ? (
                    <button onClick={() => openReinstate(u)} className="btn-ghost text-success text-sm"><ShieldCheck className="h-4 w-4" /> Reinstate</button>
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
              {(['all', 'live', 'pending'] as const).map((filter) => <button key={filter} type="button" aria-pressed={carStatusFilter === filter} onClick={() => setCarStatusFilter(filter)} className="admin-member-filter rounded-full border px-3 py-1.5 text-xs font-medium capitalize">{filter === 'all' ? 'All listings' : `${filter} listings`}</button>)}
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

        {tab === 'reviews' && !loading && <section className="mb-5 space-y-4" aria-labelledby="admin-reviews-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="admin-reviews-heading" className="text-xl font-bold text-ink-900">Uploads &amp; reviews</h2><p className="mt-1 text-sm text-ink-500">Review platform history, photos and evidence, or follow up on expiry—all in one place.</p></div>
            <AdminMemberUpload users={users} onSaved={load} />
          </div>
          <nav aria-label="Upload review sections" className="grid grid-cols-1 gap-2 rounded-xl border border-ink-200 bg-ink-50 p-2 sm:grid-cols-3">
            {([
              ['history', 'Platform history', history.filter(h => historyState(h) === 'pending').length],
              ['files', 'Photos & evidence', pendingDocs.length + pendingVehiclePhotos.length],
              ['expired', 'Expiry & reminders', 0],
            ] as const).map(([key, label, count]) => <button key={key} type="button" aria-pressed={view.review === key} onClick={() => setReviewSection(key)} className="admin-nav-button min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900">
              {label}{count > 0 && <span className="admin-nav-count ml-2 rounded-full px-2 py-0.5 text-xs">{count}</span>}
            </button>)}
          </nav>
        </section>}

        {/* ---------- Uploads and trust evidence ---------- */}
        {tab === 'reviews' && view.review === 'files' && !loading && (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 font-semibold text-ink-900">Vehicle photos</h3>
              <div className="space-y-2">
                {pendingVehiclePhotos.map((photo) => (
                  <div key={photo.id} className="card flex flex-wrap items-center gap-3 p-4">
                    <ModeratedImage src={photo.photo_url} alt="Pending vehicle" className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink-200" />
                    <div className="min-w-0 flex-1"><p className="font-medium text-ink-900">{photo.vehicle.make} {photo.vehicle.model}</p><p className="text-xs text-ink-500">Owner: {photo.vehicle.owner?.full_name || 'Unknown'}</p></div>
                    <button onClick={() => approveVehiclePhoto(photo, photo.vehicle.owner_id)} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Approve</button>
                    <button onClick={() => { setPhotoRejection({ photo, ownerId: photo.vehicle.owner_id }); setModerationReason(''); }} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button>
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
                  {d.uploaded_by && <span className="badge badge-brand">Uploaded by admin</span>}
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

        {tab === 'feedback' && <AdminFeedback />}
        {tab === 'community' && <CommunityPage embedded />}

        {/* ---------- Reports ---------- */}
        {tab === 'contact' && !loading && <AdminMessageInbox messages={contactMessages} adminId={user?.id || null} siteName={siteSettings.site_name} onRefresh={load} onResolve={resolveContactMessage} onDelete={(message) => setConfirmAction({ message: `Delete the latest support request from ${message.name}? Older requests and original chat history will remain saved.`, label: 'Delete', onConfirm: () => deleteContactMessage(message) })} onViewUser={setViewingUser} />}

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
                <div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={() => setViewingReport(r)} className="btn-primary px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> View report and actions</button>{(r.warnings || []).some(w => !w.revoked_at) && <span className="badge-warning">Warning sent</span>}{r.dismissed_at && <span className="badge-success">Removed · no rating deduction</span>}</div>
              </div>
            ))}
            {reports.length === 0 && <p className="text-sm text-ink-500">No reports.</p>}
          </div>
        )}

        {/* ---------- Platform History ---------- */}
        {tab === 'reviews' && view.review === 'history' && !loading && (
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-ink-500">No platform history entries yet.</p>}
            {history.filter(h => historyState(h) !== 'draft').map((h) => (
              <div key={h.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-ink-900 capitalize">{h.platform} — {h.driver?.full_name || 'Unknown driver'}</p>{h.uploaded_by && <span className="badge badge-brand">Uploaded by admin</span>}
                  <p className="text-xs text-ink-500">{h.months_active} {h.months_active === 1 ? 'month' : 'months'} active{h.rating != null ? ` · ${h.rating.toFixed(1)} rating` : ''}</p>
                  {h.proof_url && <span className="text-xs text-brand-600">Private proof attached</span>}
                  {h.expires_at && <DocumentExpiry expiresAt={h.expires_at} />}
                  {h.rejection_reason && <p className="mt-1 text-xs text-danger">{h.rejection_reason}</p>}
                </div>
                <span className={cn('badge capitalize', historyState(h) === 'approved' ? 'badge-success' : 'badge-warning')}>{historyState(h)}</span>
                <button onClick={() => setViewingHistory(h)} className="btn-primary px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> {historyState(h) === 'pending' ? 'Review' : 'View'}</button>
              </div>
            ))}
          </div>
        )}

        {/* ---------- Chat ---------- */}
        {tab === 'chat' && !loading && <AdminChat user={user} onDataChange={load} onViewUser={setViewingUser} />}

        {/* ---------- Settings ---------- */}
        {tab === 'settings' && !loading && <AdminSettings section={view.settings} onSectionChange={(section) => setSearchParams(current => {
          const next = canonicalAdminParams(current); next.set('settings', section); return next;
        })} />}
        {tab === 'promotions' && !loading && <AdminPromotions />}
        {tab === 'reviews' && view.review === 'expired' && !loading && <AdminExpiredDocuments onContact={(id) => { const member = users.find(item => item.id === id); if (member) void adminStartChat(member); }} onChanged={load} />}
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
          <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
            <button onClick={() => { setRejectingDoc(null); setRejectReason(''); }} className="btn-secondary w-full sm:w-auto">Cancel</button>
            <button onClick={() => rejectDoc(rejectingDoc, rejectReason || 'Document does not meet requirements.')} disabled={!rejectReason.trim()} className="btn w-full bg-danger text-white hover:bg-red-700 sm:w-auto">Reject document</button>
          </div>
        </Modal>
      )}

      {photoRejection && (
        <Modal title="Reject vehicle photo" onClose={() => { if (!moderationLoading) { setPhotoRejection(null); setModerationReason(''); } }}>
          <p className="text-sm text-ink-600">Give the owner a clear reason so they know exactly what to replace or correct.</p>
          <label htmlFor="photo-rejection-reason" className="label mt-4">Reason</label>
          <textarea
            id="photo-rejection-reason"
            value={moderationReason}
            onChange={(event) => setModerationReason(event.target.value)}
            rows={4}
            placeholder="e.g. The image is too dark to identify the vehicle."
            className="input"
          />
          <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={() => { setPhotoRejection(null); setModerationReason(''); }} disabled={moderationLoading} className="btn-secondary w-full sm:w-auto">Cancel</button>
            <button type="button" onClick={() => void rejectVehiclePhoto(photoRejection.photo, photoRejection.ownerId, moderationReason)} disabled={moderationLoading || moderationReason.trim().length < 3} className="btn-danger w-full sm:w-auto">
              {moderationLoading ? 'Rejecting…' : 'Reject photo'}
            </button>
          </div>
        </Modal>
      )}

      {historyRejection && (
        <Modal title={`Reject ${historyRejection.platform} platform history`} onClose={() => { if (!moderationLoading) { setHistoryRejection(null); setModerationReason(''); } }}>
          <p className="text-sm text-ink-600">The proof will be marked rejected and retained in review history. Explain what the driver should correct before resubmitting.</p>
          <label htmlFor="history-rejection-reason" className="label mt-4">Reason</label>
          <textarea
            id="history-rejection-reason"
            value={moderationReason}
            onChange={(event) => setModerationReason(event.target.value)}
            rows={4}
            placeholder="e.g. The screenshot does not show recent trip activity or the platform name."
            className="input"
          />
          <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={() => { setHistoryRejection(null); setModerationReason(''); }} disabled={moderationLoading} className="btn-secondary w-full sm:w-auto">Cancel</button>
            <button type="button" onClick={() => void rejectPlatformHistory(historyRejection, moderationReason)} disabled={moderationLoading || moderationReason.trim().length < 3} className="btn-danger w-full sm:w-auto">
              {moderationLoading ? 'Rejecting…' : 'Reject history'}
            </button>
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
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button onClick={() => { setSuspendingUser(null); setSuspendReason(''); setSuspensionReportId(null); }} className="btn-secondary w-full">Cancel</button>
            <button onClick={() => suspend(suspendingUser, suspendReason.trim() || 'Violation of platform rules.')} disabled={suspending} className="btn w-full bg-danger text-white hover:bg-red-700">
              {suspending ? 'Suspending…' : 'Suspend user'}
            </button>
          </div>
        </Modal>
      )}

      {reinstatingUser && (
        <Modal title={`Reinstate ${reinstatingUser.full_name}`} onClose={() => { if (!reinstating) { setReinstatingUser(null); setReinstatementMessage(''); } }}>
          <p className="text-sm text-ink-600">Access will be restored immediately. The member will receive an in-app notification and email.</p>
          <label htmlFor="reinstatement-message" className="label mt-4">Message <span className="font-normal text-ink-400">(optional)</span></label>
          <textarea id="reinstatement-message" value={reinstatementMessage} onChange={e => setReinstatementMessage(e.target.value)} rows={4} maxLength={1000} placeholder="Add a personal note, next steps, or guidance for the member…" className="input" />
          <p className="mt-1 text-right text-xs text-ink-400">{reinstatementMessage.length}/1000</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={reinstating} onClick={() => { setReinstatingUser(null); setReinstatementMessage(''); }} className="btn-secondary w-full">Cancel</button>
            <button type="button" disabled={reinstating} onClick={() => void reinstate(reinstatingUser, reinstatementMessage)} className="btn-primary w-full"><ShieldCheck className="h-4 w-4" />{reinstating ? 'Reinstating…' : 'Reinstate and notify'}</button>
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
      {uploadUser && <AdminMemberUpload key={uploadUser.id} users={[uploadUser]} initialUser={uploadUser} onSaved={load} onClosed={() => { setViewingUser(uploadUser); setUploadUser(null); }} />}
      {viewingUser && (
        <ViewUserModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onSuspend={() => { setSuspensionReportId(null); setSuspendingUser(viewingUser); setSuspendReason(''); setViewingUser(null); }}
          onReinstate={() => { openReinstate(viewingUser); setViewingUser(null); }}
          onViewDoc={async (doc: DocumentRow) => {
            const { data } = await supabase.from('documents').select('*').eq('user_id', viewingUser.id).eq('type', doc.type).maybeSingle();
            if (data) setViewingDoc(data as DocumentRow);
          }}
          onChangePin={() => { setChangingPinUser(viewingUser); setViewingUser(null); }}
          onDelete={() => { setDeletingUser(viewingUser); setViewingUser(null); }}
          onMessage={() => { adminStartChat(viewingUser); setViewingUser(null); }}
          onEdit={() => { setEditingUser(viewingUser); setViewingUser(null); }}
          onUpload={() => { setUploadUser(users.find(member => member.id === viewingUser.id) || viewingUser); setViewingUser(null); }}
        />
      )}

      {/* Platform history viewer modal */}
      {viewingHistory && (
        <Modal title={`Platform history: ${viewingHistory.platform}`} onClose={() => setViewingHistory(null)}>
          <div className="space-y-2 text-sm">
            <p><span className="text-ink-500">Driver:</span> {viewingHistory.driver?.full_name || 'Unknown'}</p>
            <p><span className="text-ink-500">Platform:</span> <span className="capitalize">{viewingHistory.platform}</span></p>
            <p><span className="text-ink-500">Months active:</span> {viewingHistory.months_active}</p>
            {viewingHistory.rating != null && <p><span className="text-ink-500">Rating:</span> {viewingHistory.rating.toFixed(1)}</p>}
            {viewingHistory.proof_url && (
              <div>
                <p className="text-ink-500">Proof:</p>
                <button onClick={() => setViewingDoc({
                  id: viewingHistory.id,
                  user_id: viewingHistory.driver_id,
                  type: 'work_history',
                  file_url: viewingHistory.proof_url!,
                  uploaded_by: viewingHistory.uploaded_by,
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
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button onClick={() => setViewingHistory(null)} className="btn-secondary w-full sm:w-auto">Close</button>
            <button
              type="button"
              onClick={() => { setHistoryRejection(viewingHistory); setModerationReason(''); setViewingHistory(null); }}
              disabled={moderationLoading || historyState(viewingHistory) !== 'pending'}
              className="btn-secondary w-full sm:w-auto"
            ><X className="h-4 w-4" /> Reject</button>
            <button type="button" onClick={() => void approvePlatformHistory(viewingHistory)} disabled={moderationLoading || historyState(viewingHistory) !== 'pending'} className="btn-primary w-full sm:w-auto">
              {moderationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </button>
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
            sessionStorage.setItem('admin-open-conversation', conversationId);
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
          onStatus={async (status) => { if (await resolveReport(viewingReport, status)) setViewingReport(null); }}
          onRemove={(reason) => overturnReport(viewingReport, reason)}
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

function ReportReviewModal({ report, onClose, onWarn, onContact, onOpenConversation, onViewProfile, onSuspend, onStatus, onRemove }: {
  report: AdminReport;
  onClose: () => void;
  onWarn: (message: string) => Promise<boolean>;
  onContact: () => void;
  onOpenConversation?: () => void;
  onViewProfile: () => void;
  onSuspend: () => void;
  onStatus: (status: 'resolved') => void | Promise<void>;
  onRemove: (reason: string) => Promise<boolean>;
}) {
  const [warningMessage, setWarningMessage] = useState('Please review our community rules and correct this behaviour immediately.');
  const [sending, setSending] = useState(false);
  const warningSent = (report.warnings || []).some(w => !w.revoked_at);
  const sendWarning = async () => {
    setSending(true);
    await onWarn(warningMessage);
    setSending(false);
  };
  return (
    <Modal title={`Report: ${report.reason}`} onClose={onClose} size="xl">
      <div className="space-y-5 sm:max-h-[75dvh] sm:overflow-y-auto sm:pr-1">
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
        <div><p className="label">What was reported</p><div className="rounded-xl border border-ink-200 bg-ink-50 p-4"><p className="font-semibold text-ink-900">{report.reason}</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-600">{report.description || 'No additional description was supplied.'}</p></div></div>
        {report.dismissed_at ? <div className="rounded-xl border border-emerald-200 p-4"><p className="font-semibold text-emerald-700 dark:text-emerald-300">Removed from account standing</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-600">{report.dismissal_reason}</p><p className="mt-2 text-xs text-ink-500">{formatDateTime(report.dismissed_at)} · Rating recalculated; this report and its warning no longer count. Audit history retained.</p>{report.warnings?.map(w => <p key={w.id} className="mt-2 text-xs text-ink-500">Revoked warning: {w.message}</p>)}</div> : null}
        {warningSent ? (
          <div className="rounded-xl border border-amber-200 p-4"><p className="font-semibold text-amber-800">Warning already sent for this report</p>{report.warnings!.map((warning) => <div key={warning.id} className="mt-2 text-sm text-ink-600"><p>{warning.message}</p><p className="text-xs text-ink-400">{formatDateTime(warning.created_at)}</p></div>)}</div>
        ) : report.reported && report.status !== 'dismissed' ? (
          <div><label className="label">Warning message</label><textarea value={warningMessage} onChange={(event) => setWarningMessage(event.target.value)} rows={3} className="input" /><p className="mt-1 text-xs text-ink-500">The member will also receive the report reason, report details, their warning count, and: “Three warnings may lead to account suspension.”</p><button onClick={sendWarning} disabled={sending || warningMessage.trim().length < 3} className="btn-secondary mt-3 text-amber-800"><Flag className="h-4 w-4" /> {sending ? 'Sending…' : 'Send warning'}</button></div>
        ) : null}
        {!report.dismissed_at && <ReportRemovalAction onRemove={onRemove} />}
        <div className="grid gap-2 border-t border-ink-100 pt-4 sm:flex sm:flex-wrap">
          {onOpenConversation && <button onClick={onOpenConversation} className="btn-primary w-full sm:w-auto"><Headphones className="h-4 w-4" /> Open connection chat</button>}
          {report.reported && <><button onClick={onViewProfile} className="btn-secondary w-full sm:w-auto"><Eye className="h-4 w-4" /> User profile</button><button onClick={onContact} className="btn-secondary w-full sm:w-auto"><MessageSquare className="h-4 w-4" /> Contact user</button>{report.status !== 'dismissed' && <button onClick={onSuspend} className="btn-secondary w-full text-danger sm:w-auto"><Ban className="h-4 w-4" /> Suspend user</button>}</>}
          <div className="hidden flex-1 sm:block" />
          {report.status !== 'dismissed' && report.status !== 'resolved' && <button disabled={sending} onClick={async () => { setSending(true); try { await onStatus('resolved'); } finally { setSending(false); } }} className="btn-primary w-full sm:w-auto"><Check className="h-4 w-4" /> Mark resolved</button>}
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
      <div className="space-y-5 sm:max-h-[75dvh] sm:overflow-y-auto sm:pr-1">
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
        <div className="grid gap-2 border-t border-ink-100 pt-4 sm:flex sm:flex-wrap sm:justify-end">
          <button onClick={onClose} disabled={loading} className="btn-ghost w-full sm:w-auto">Close</button>
          <button onClick={() => onReject(reason)} disabled={loading || !reason.trim()} className="btn-secondary w-full text-danger sm:w-auto"><X className="h-4 w-4" /> Require changes</button>
          <button onClick={onApprove} disabled={loading || photos.length === 0 || photos.some((photo) => photo.rejected)} className="btn-primary w-full sm:w-auto"><Check className="h-4 w-4" /> {loading ? 'Working…' : 'Approve and publish'}</button>
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
      <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
        <button onClick={onClose} className="btn-secondary w-full sm:w-auto">Cancel</button>
        <button onClick={() => onConfirm(pin)} disabled={pin.length < 10 || pin !== confirm} className="btn-primary w-full sm:w-auto"><KeyRound className="h-4 w-4" /> Set new password</button>
      </div>
    </Modal>
  );
}

// ---------- Admin Settings ----------
const ADMIN_SETTINGS_KEYS = [
  ...ADMIN_CONTROL_SETTING_KEYS,
  'admin_contact_email',
  'admin_contact_phone',
  'facebook_url',
  'footer_company_about_label',
  'footer_company_contact_label',
  'footer_company_faq_label',
  'footer_company_how_label',
  'footer_company_title',
  'footer_contact_title',
  'footer_copyright_note',
  'footer_description',
  'footer_legal_contact_label',
  'footer_legal_privacy_label',
  'footer_legal_terms_label',
  'footer_legal_title',
  'footer_location',
  'header_name_animation',
  'header_name_colours',
  'homepage_background_enabled',
  'homepage_background_overlay',
  'homepage_background_position_x',
  'homepage_background_position_y',
  'homepage_background_type',
  'homepage_background_url',
  'instagram_url',
  'launch_intro_background_enabled',
  'launch_intro_enabled',
  'linkedin_url',
  'site_logo_url',
  'site_name',
  'site_tagline',
  'site_theme',
];
function AdminSettings({ section, onSectionChange }: { section: SettingsSection; onSectionChange: (section: SettingsSection) => void }) {
  const { toast } = useToast();
  const { settings: liveSettings, loading, refreshSettings } = useSiteSettings();
  const [settings, setSettings] = useState<SiteSettings>(liveSettings);
  const baseline = useRef(liveSettings);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHomepageBackground, setUploadingHomepageBackground] = useState(false);

  useEffect(() => {
    const previous = baseline.current;
    setSettings(draft => mergeSettingsDraft(draft, previous, liveSettings));
    baseline.current = liveSettings;
  }, [liveSettings]);

  useEffect(() => {
    applySiteTheme(settings.site_theme);
    return () => { applySiteTheme(liveSettings.site_theme); };
  }, [settings.site_theme, liveSettings.site_theme]);

  const save = async () => {
    const siteName = settings.site_name.trim();
    if (siteName.length < 2 || siteName.length > 40) { toast('Site name must be between 2 and 40 characters.', 'error'); return; }
    const siteTagline = settings.site_tagline.trim();
    if (siteTagline.length < 10 || siteTagline.length > 100) { toast('Tagline must be between 10 and 100 characters.', 'error'); return; }
    if (Number(settings.max_vehicles_per_owner) < 1 || Number(settings.max_vehicles_per_owner) > 100) { toast('Vehicle limit must be between 1 and 100.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.admin_contact_email.trim())) { toast('Enter a valid admin contact email.', 'error'); return; }
    if (settings.admin_contact_phone.trim().length < 7) { toast('Enter a valid admin contact phone number.', 'error'); return; }
    const footerFields = [settings.footer_description, settings.footer_company_title, settings.footer_company_about_label, settings.footer_company_contact_label, settings.footer_company_faq_label, settings.footer_company_how_label, settings.footer_legal_title, settings.footer_legal_terms_label, settings.footer_legal_privacy_label, settings.footer_legal_contact_label, settings.footer_contact_title, settings.footer_location, settings.footer_copyright_note];
    if (footerFields.some(value => !value.trim())) { toast('Footer fields cannot be empty.', 'error'); return; }
    for (const [label, value] of [['Facebook', settings.facebook_url], ['Instagram', settings.instagram_url], ['LinkedIn', settings.linkedin_url]]) {
      if (!value) continue;
      try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
      catch { toast(`${label} URL must start with http:// or https://.`, 'error'); return; }
    }
    setSaving(true);
    const updated_at = new Date().toISOString();
    const nextSettings = {
      ...settings,
      site_theme: isSiteTheme(settings.site_theme) ? settings.site_theme : DEFAULT_SITE_THEME,
      site_name: siteName,
      site_tagline: siteTagline,
      admin_contact_email: settings.admin_contact_email.trim().toLowerCase(),
      admin_contact_phone: settings.admin_contact_phone.trim(),
      facebook_url: settings.facebook_url.trim(),
      instagram_url: settings.instagram_url.trim(),
      linkedin_url: settings.linkedin_url.trim(),
      footer_description: settings.footer_description.trim(),
      footer_company_title: settings.footer_company_title.trim(),
      footer_company_about_label: settings.footer_company_about_label.trim(),
      footer_company_contact_label: settings.footer_company_contact_label.trim(),
      footer_company_faq_label: settings.footer_company_faq_label.trim(),
      footer_company_how_label: settings.footer_company_how_label.trim(),
      footer_legal_title: settings.footer_legal_title.trim(),
      footer_legal_terms_label: settings.footer_legal_terms_label.trim(),
      footer_legal_privacy_label: settings.footer_legal_privacy_label.trim(),
      footer_legal_contact_label: settings.footer_legal_contact_label.trim(),
      footer_contact_title: settings.footer_contact_title.trim(),
      footer_location: settings.footer_location.trim(),
      footer_copyright_note: settings.footer_copyright_note.trim(),
    };
    const changes = changedSettings(nextSettings, baseline.current, ADMIN_SETTINGS_KEYS);
    if (!changes.length) { setSaving(false); toast('No unsaved changes.'); return; }
    const { error } = await supabase.from('site_settings').upsert(
      changes.map(([key, value]) => ({ key, value, updated_at })),
      { onConflict: 'key' },
    );
    if (error) { setSaving(false); toast('Could not save settings: ' + error.message, 'error'); return; }
    // Acknowledge only this editor's settings; navigation, ads and other editors are untouched.
    for (const [key, value] of changes) baseline.current = { ...baseline.current, [key]: value };
    setSettings(current => ({ ...current, ...Object.fromEntries(changes) }));
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

  const uploadHomepageBackground = async (file: File) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/webm'];
    const mediaType = imageTypes.includes(file.type) ? 'image' : videoTypes.includes(file.type) ? 'video' : null;
    if (!mediaType) { toast('Choose a JPG, PNG, WebP, MP4, or WebM file.', 'error'); return; }
    const limit = mediaType === 'video' ? 8 * 1024 * 1024 : 3 * 1024 * 1024;
    if (file.size > limit) { toast(`${mediaType === 'video' ? 'Video' : 'Image'} must be smaller than ${limit / 1024 / 1024} MB.`, 'error'); return; }
    setUploadingHomepageBackground(true);
    const extension = file.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'webp');
    const path = `branding/homepage-background-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(SITE_ASSETS_BUCKET).upload(path, file, { cacheControl: '86400', upsert: false, contentType: file.type });
    if (uploadError) { setUploadingHomepageBackground(false); toast('Could not upload background: ' + uploadError.message, 'error'); return; }
    const url = supabase.storage.from(SITE_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
    const updated_at = new Date().toISOString();
    const updates = { homepage_background_url: url, homepage_background_type: mediaType, homepage_background_enabled: 'true' };
    const { error } = await supabase.from('site_settings').upsert(Object.entries(updates).map(([key, value]) => ({ key, value, updated_at })), { onConflict: 'key' });
    setUploadingHomepageBackground(false);
    if (error) { toast('Background uploaded, but could not be activated: ' + error.message, 'error'); return; }
    setSettings((current) => ({ ...current, ...updates }));
    await refreshSettings();
    toast(`Homepage background ${mediaType} uploaded and activated.`);
  };

  const removeHomepageBackground = async () => {
    setUploadingHomepageBackground(true);
    const updated_at = new Date().toISOString();
    const updates = { homepage_background_url: '', homepage_background_type: 'none', homepage_background_enabled: 'false' };
    const { error } = await supabase.from('site_settings').upsert(Object.entries(updates).map(([key, value]) => ({ key, value, updated_at })), { onConflict: 'key' });
    setUploadingHomepageBackground(false);
    if (error) { toast('Could not remove the homepage background: ' + error.message, 'error'); return; }
    setSettings((current) => ({ ...current, ...updates }));
    await refreshSettings();
    toast('Homepage background removed.');
  };

  if (loading) return <div className="card h-40 animate-pulse" />;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div><h2 className="font-display text-xl font-bold text-ink-900">Settings</h2><p className="mt-1 text-sm text-ink-500">Branding, contact details and platform controls. Save applies your edits from both sections.</p></div>
        <button type="button" onClick={() => void save()} disabled={saving || uploadingLogo || uploadingHomepageBackground} className="btn-primary min-h-11"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}</button>
      </div>
      <nav aria-label="Settings sections" className="grid grid-cols-1 gap-2 rounded-xl border border-ink-200 bg-ink-50 p-2 sm:grid-cols-2">
        {([['branding', 'Branding & contact'], ['controls', 'Platform controls']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => onSectionChange(key)} className="admin-nav-button min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900">{label}</button>)}
      </nav>
      <div hidden={section !== 'branding'} className="card p-5">
        <h3 className="font-display text-lg font-bold text-ink-900">Branding &amp; contact</h3>
        <p className="mt-1 text-sm text-ink-500">Site name, appearance, background, footer and public contact details.</p>
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="label flex items-center gap-2"><Palette className="h-4 w-4" /> Theme &amp; colours</legend>
            <p className="mb-3 text-xs text-ink-500">Choose a single-colour palette or a professional colour combination. Every swatch shows its exact HEX code. Selecting one previews it immediately; save settings to publish it for everyone.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SITE_THEMES.map((theme) => {
                const selected = settings.site_theme === theme.id;
                return <button key={theme.id} type="button" aria-pressed={selected} onClick={() => setSettings({ ...settings, site_theme: theme.id })} className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${selected ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-200' : 'border-ink-200 bg-white hover:border-ink-400 dark:bg-[#141416]'}`}>
                  <span className="flex items-center justify-between gap-3"><span className="font-semibold text-ink-900">{theme.name}</span>{selected ? <Check className="h-4 w-4 text-accent-600" /> : 'kind' in theme && <span className="text-[9px] font-bold uppercase tracking-wide text-ink-600">Pro combination</span>}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-500">{theme.description}</span>
                  <span className={`mt-3 grid gap-2 ${theme.swatches.length === 4 ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-3'}`}>{theme.swatches.map((colour, index) => <span key={colour} className="min-w-0"><span className="flex items-center gap-1.5"><span className="h-7 w-7 shrink-0 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: colour }} aria-hidden="true" /><span className="truncate text-[10px] font-semibold uppercase text-ink-700">{colour}</span></span><span className="mt-1 block text-[9px] uppercase tracking-wide text-ink-400">{theme.swatches.length === 4 ? `Colour ${index + 1}` : index === 0 ? 'Base' : index === 1 ? 'Action' : 'Surface'}</span></span>)}</span>
                </button>;
              })}
            </div>
            <button type="button" className="btn-ghost mt-2 px-3 py-2 text-xs" onClick={() => setSettings({ ...settings, site_theme: DEFAULT_SITE_THEME })}>Restore default theme</button>
          </fieldset>
          <div>
            <label htmlFor="admin-site-name" className="label">Site name</label>
            <input id="admin-site-name" value={settings['site_name'] || ''} onChange={(e) => setSettings({ ...settings, site_name: e.target.value })} className="input" />
          </div>
          <div>
            <label htmlFor="admin-header-name-animation" className="label">Top header name animation</label>
            <div className="grid gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-4 dark:bg-[#101012] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div><select id="admin-header-name-animation" value={settings.header_name_animation} onChange={(event) => setSettings({ ...settings, header_name_animation: event.target.value })} className="input">
                <option value="off">Off — no movement</option>
                <option value="pulse">Soft pulse</option>
                <option value="float">Gentle float</option>
              </select><p className="mt-1 text-xs text-ink-500">Controls only the site name in the top navigation. Reduced-motion preferences are always respected.</p></div>
              <span className={`site-wordmark site-wordmark--${settings.header_name_animation === 'glow' ? 'off' : settings.header_name_animation} site-wordmark-colours--${settings.header_name_colours || 'split'} inline-block truncate px-2 font-display text-2xl font-extrabold tracking-tight`}>{settings.site_name === '11Drive' ? <><span className="site-wordmark-eleven">11</span><span className="site-wordmark-drive text-[0.85em]">Drive</span></> : settings.site_name}</span>
            </div>
          </div>
          <fieldset>
            <legend className="label">Top header name colours</legend>
            <p className="mb-3 text-xs text-ink-500">Choose a static, professional colour arrangement for 11Drive.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['split', '11 dark · Drive theme'],
                ['reverse', '11 theme · Drive dark'],
                ['base', 'Both dark'],
                ['action', 'Both theme colour'],
              ] as const).map(([value, label]) => {
                const selected = (settings.header_name_colours || 'split') === value;
                return <button key={value} type="button" aria-pressed={selected} onClick={() => setSettings({ ...settings, header_name_colours: value })} className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${selected ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-200' : 'border-ink-200 bg-white hover:border-ink-400 dark:bg-[#141416]'}`}>
                  <span className={`site-wordmark site-wordmark-colours--${value} block font-display text-xl font-extrabold tracking-tight`}><span className="site-wordmark-eleven">11</span><span className="site-wordmark-drive text-[0.85em]">Drive</span></span>
                  <span className="mt-1 block text-[11px] font-medium text-ink-500">{label}</span>
                </button>;
              })}
            </div>
          </fieldset>
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
            <label className="label">Full homepage background</label>
            <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4 dark:bg-[#101012]">
              {settings.homepage_background_url && <div className="mb-4 aspect-[16/6] overflow-hidden rounded-xl bg-ink-900">
                {settings.homepage_background_type === 'video' ? <video src={settings.homepage_background_url} muted loop autoPlay playsInline preload="metadata" className="h-full w-full object-cover" style={{ objectPosition: `${settings.homepage_background_position_x}% ${settings.homepage_background_position_y}%` }} /> : <img src={settings.homepage_background_url} alt="Homepage background preview" className="h-full w-full object-cover" style={{ objectPosition: `${settings.homepage_background_position_x}% ${settings.homepage_background_position_y}%` }} />}
              </div>}
              <div className="flex flex-wrap items-center gap-3">
                <label className="btn-secondary cursor-pointer text-sm"><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="hidden" disabled={uploadingHomepageBackground} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadHomepageBackground(file); event.target.value = ''; }} />{uploadingHomepageBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{settings.homepage_background_url ? 'Replace background' : 'Upload image or video'}</label>
                {settings.homepage_background_url && <><label className="inline-flex items-center gap-2 text-sm font-medium text-ink-700"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={settings.homepage_background_enabled === 'true'} onChange={(event) => setSettings({ ...settings, homepage_background_enabled: String(event.target.checked) })} />Show background</label><button type="button" className="btn-ghost text-sm text-danger" disabled={uploadingHomepageBackground} onClick={() => void removeHomepageBackground()}>Remove</button></>}
              </div>
              <p className="mt-2 text-xs text-ink-500">JPG, PNG, or WebP up to 3 MB; muted MP4 or WebM up to 8 MB. Video pauses for visitors using reduced-motion or data-saving mode.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-100 bg-white p-3 dark:bg-[#17171a]">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" checked={settings.launch_intro_enabled === 'true'} onChange={(event) => setSettings({ ...settings, launch_intro_enabled: String(event.target.checked) })} />
                  <span><span className="block text-sm font-semibold text-ink-900">Animated 11Drive launch</span><span className="mt-1 block text-xs leading-5 text-ink-500">Show the full-page logo entrance, “True Connections” tagline, and loading line once per browsing session.</span></span>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-3 dark:bg-[#17171a] ${settings.launch_intro_enabled === 'true' && settings.homepage_background_url ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}>
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" disabled={settings.launch_intro_enabled !== 'true' || !settings.homepage_background_url} checked={settings.launch_intro_background_enabled === 'true'} onChange={(event) => setSettings({ ...settings, launch_intro_background_enabled: String(event.target.checked) })} />
                  <span><span className="block text-sm font-semibold text-ink-900">Background during launch</span><span className="mt-1 block text-xs leading-5 text-ink-500">Show the selected image or video behind the animated name.</span></span>
                </label>
              </div>
              {settings.homepage_background_url && <label className="label mt-4">Readability overlay: {settings.homepage_background_overlay}%<input type="range" min="20" max="95" step="1" value={settings.homepage_background_overlay} onChange={(event) => setSettings({ ...settings, homepage_background_overlay: event.target.value })} className="mt-2 w-full accent-orange-600" /></label>}
              {settings.homepage_background_url && <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="label">Horizontal focus: {settings.homepage_background_position_x}%<input type="range" min="0" max="100" step="1" value={settings.homepage_background_position_x} onChange={(event) => setSettings({ ...settings, homepage_background_position_x: event.target.value })} className="mt-2 w-full accent-orange-600" /><span className="mt-1 flex justify-between text-[10px] font-normal text-ink-400"><span>Left</span><span>Centre</span><span>Right</span></span></label>
                <label className="label">Vertical focus: {settings.homepage_background_position_y}%<input type="range" min="0" max="100" step="1" value={settings.homepage_background_position_y} onChange={(event) => setSettings({ ...settings, homepage_background_position_y: event.target.value })} className="mt-2 w-full accent-orange-600" /><span className="mt-1 flex justify-between text-[10px] font-normal text-ink-400"><span>Top</span><span>Centre</span><span>Bottom</span></span></label>
              </div>}
            </div>
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
          <fieldset className="rounded-2xl border border-ink-200 p-4 sm:p-5">
            <legend className="px-2 font-display text-base font-bold text-ink-900">Footer content</legend>
            <p className="mb-4 text-xs leading-5 text-ink-500">Edit the footer wording. Each link remains connected to its existing safe destination.</p>
            <div className="grid gap-5 lg:grid-cols-3">
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-ink-800">Brand area</h3>
                <div><label htmlFor="footer-description" className="label">Description</label><textarea id="footer-description" maxLength={180} rows={3} className="input" value={settings.footer_description} onChange={e => setSettings({ ...settings, footer_description: e.target.value })} /></div>
                <div><label htmlFor="footer-copyright" className="label">Copyright note</label><textarea id="footer-copyright" maxLength={180} rows={3} className="input" value={settings.footer_copyright_note} onChange={e => setSettings({ ...settings, footer_copyright_note: e.target.value })} /><p className="mt-1 text-xs text-ink-400">The year and site name are added automatically.</p></div>
              </section>
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-ink-800">Company column</h3>
                <FooterSettingInput id="footer-company-title" label="Column heading" value={settings.footer_company_title} onChange={value => setSettings({ ...settings, footer_company_title: value })} />
                <FooterSettingInput id="footer-company-about" label="About link label" value={settings.footer_company_about_label} onChange={value => setSettings({ ...settings, footer_company_about_label: value })} />
                <FooterSettingInput id="footer-company-contact" label="Contact link label" value={settings.footer_company_contact_label} onChange={value => setSettings({ ...settings, footer_company_contact_label: value })} />
                <FooterSettingInput id="footer-company-faq" label="FAQ link label" value={settings.footer_company_faq_label} onChange={value => setSettings({ ...settings, footer_company_faq_label: value })} />
                <FooterSettingInput id="footer-company-how" label="How it works label" value={settings.footer_company_how_label} onChange={value => setSettings({ ...settings, footer_company_how_label: value })} />
              </section>
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-ink-800">Legal &amp; contact columns</h3>
                <FooterSettingInput id="footer-legal-title" label="Legal heading" value={settings.footer_legal_title} onChange={value => setSettings({ ...settings, footer_legal_title: value })} />
                <FooterSettingInput id="footer-legal-terms" label="Terms link label" value={settings.footer_legal_terms_label} onChange={value => setSettings({ ...settings, footer_legal_terms_label: value })} />
                <FooterSettingInput id="footer-legal-privacy" label="Privacy link label" value={settings.footer_legal_privacy_label} onChange={value => setSettings({ ...settings, footer_legal_privacy_label: value })} />
                <FooterSettingInput id="footer-legal-contact" label="Legal contact label" value={settings.footer_legal_contact_label} onChange={value => setSettings({ ...settings, footer_legal_contact_label: value })} />
                <FooterSettingInput id="footer-contact-title" label="Contact heading" value={settings.footer_contact_title} onChange={value => setSettings({ ...settings, footer_contact_title: value })} />
                <FooterSettingInput id="footer-location" label="Displayed location" value={settings.footer_location} onChange={value => setSettings({ ...settings, footer_location: value })} />
              </section>
            </div>
          </fieldset>
        </div>
      </div>
      <div hidden={section !== 'controls'}><AdminControlCentre settings={settings} onChange={setSettings} /></div>
    </div>
  );
}

function FooterSettingInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div><label htmlFor={id} className="label">{label}</label><input id={id} maxLength={60} className="input" value={value} onChange={event => onChange(event.target.value)} /></div>;
}

// ---------- Edit Vehicle Modal ----------
function EditVehicleModal({ vehicle, onClose, onDone, toast }: { vehicle: AdminVehicle; onClose: () => void; onDone: () => void; toast: ToastFn }) {
  const [form, setForm] = useState({
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: String(vehicle.year ?? ''),
    location: vehicle.location || '',
    transmission: vehicle.transmission || 'manual',
    fuel_type: vehicle.fuel_type || 'petrol',
    weekly_target: String(vehicle.weekly_target ?? ''),
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
    if (!/^\d{4}$/.test(form.year) || Number(form.year) < 1900 || Number(form.year) > new Date().getFullYear() + 1) { toast('Enter a valid four-digit manufacture year.', 'error'); return; }
    if (form.weekly_target && (!Number.isFinite(Number(form.weekly_target)) || Number(form.weekly_target) < 0)) { toast('Weekly target must be a positive amount or zero.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('vehicles').update({ ...form, year: Number(form.year), weekly_target: form.weekly_target ? Number(form.weekly_target) : null }).eq('id', vehicle.id);
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
        <Field label="Year"><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="input" /></Field>
        <Field label="Location"><PlaceAutocomplete value={form.location} onChange={(location) => setForm({ ...form, location })} /></Field>
        <Field label="Transmission"><select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value as Vehicle['transmission'] })} className="input"><option value="manual">Manual</option><option value="automatic">Automatic</option></select></Field>
        <Field label="Fuel type"><select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as Vehicle['fuel_type'] })} className="input"><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option></select></Field>
        <Field label="Weekly target (KES)"><input type="number" value={form.weekly_target} onChange={(e) => setForm({ ...form, weekly_target: e.target.value })} className="input" /></Field>
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
            <div key={iss.id} className="flex items-center gap-2 rounded-lg bg-ink-50 p-2 ring-1 ring-ink-200">
              <span className="flex-1 text-sm text-ink-700">{iss.description}</span>
              <span className="text-xs capitalize text-ink-500">{iss.severity}</span>
              <button onClick={() => removeIssue(iss.id)} className="text-danger hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input value={newIssue.description} onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })} placeholder="Add an issue…" className="input min-w-0" />
            <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value as VehicleIssue['severity'] })} className="input w-full sm:w-auto">
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="major">Major</option>
            </select>
            <button onClick={addIssue} aria-label="Add vehicle issue" className="btn-secondary w-full sm:w-auto"><Plus className="h-4 w-4" /> <span className="sm:hidden">Add issue</span></button>
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
function ViewUserModal({ user, onClose, onSuspend, onReinstate, onViewDoc, onChangePin, onDelete, onMessage, onEdit, onUpload }: {
  user: Profile;
  onClose: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onViewDoc: (doc: DocumentRow) => void;
  onChangePin: () => void;
  onDelete: () => void;
  onMessage: () => void;
  onEdit: () => void;
  onUpload: () => void;
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
      setProfileReports(((reportsResult.data as AdminReportRow[]) || []).map(normalizeReportWarnings));
      setProfileWarnings(((warningsResult.data as UserWarning[]) || []).filter(warning => !warning.revoked_at));
      setLoadingDocs(false);
    })();
  }, [user.id, user.role]);

  return (
    <Modal title={`${user.full_name} — Profile`} onClose={onClose}>
      <div className="space-y-4 sm:max-h-[70dvh] sm:overflow-y-auto">
        {['driver', 'owner'].includes(user.role) && <button onClick={onUpload} className="btn-primary w-full"><Upload className="h-4 w-4" /> Upload for this user</button>}
        {user.role === 'owner' && <OwnerListingAllowance key={user.id} ownerId={user.id} />}
        {/* Profile info */}
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name} src={user.avatar_url} size={64} verified={user.role === 'driver' && user.is_verified} />
          <div>
            <p className="font-display text-lg font-bold text-ink-900">{user.full_name}</p>
            <p className="text-sm capitalize text-ink-500">{user.role}</p>
            <p className="text-xs text-ink-400">{user.email || 'No registered email'}</p>
            <p className="text-xs text-ink-400">{user.phone || 'No phone'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-4 ring-1 ring-ink-100">
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
                return <section key={status}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{status === 'resolved' ? 'Solved' : status} ({grouped.length})</p><div className="space-y-2">{grouped.map((report) => <div key={report.id} className="rounded-xl border border-ink-100 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink-800">{report.reason}</p>{(report.warnings || []).some(warning => !warning.revoked_at) && <span className="badge-warning">Warned</span>}</div><p className="mt-1 text-xs text-ink-600">{report.description || 'No additional details.'}</p>{report.dismissed_at && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Removed: {report.dismissal_reason}</p>}<p className="mt-1 text-[11px] capitalize text-ink-400">{report.target_type} · {formatDateTime(report.created_at)}</p></div>)}</div></section>;
              })}
            </div>
          )}
          {profileWarnings.length >= 3 && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">This user has reached three warnings. Review the reports before deciding whether suspension is appropriate.</p>}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 grid gap-2 border-t border-ink-100 pt-4 sm:flex sm:flex-wrap sm:justify-end">
        <button onClick={onClose} className="btn-secondary w-full sm:w-auto">Close</button>
        <button onClick={onMessage} className="btn-secondary w-full sm:w-auto"><MessageSquare className="h-4 w-4" /> Message</button>
        <button onClick={onEdit} className="btn-secondary w-full sm:w-auto"><Pencil className="h-4 w-4" /> Edit profile</button>
        <button onClick={onChangePin} className="btn-secondary w-full sm:w-auto"><KeyRound className="h-4 w-4" /> Change password</button>
        {user.is_suspended ? (
          <button onClick={onReinstate} className="btn-primary w-full sm:w-auto"><ShieldCheck className="h-4 w-4" /> Reinstate account</button>
        ) : (
          <button onClick={onSuspend} className="btn-secondary w-full text-danger sm:w-auto"><Ban className="h-4 w-4" /> Suspend</button>
        )}
        <button onClick={onDelete} className="btn-secondary w-full text-danger sm:w-auto"><Trash2 className="h-4 w-4" /> Delete user</button>
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
function lastContactEntry(message: ContactMessage) {
  const entries = message.entries || [];
  return entries[entries.length - 1];
}

export function AdminMessageInbox({ messages, adminId, siteName, onRefresh, onResolve, onDelete, onViewUser }: {
  messages: ContactMessage[];
  adminId: string | null;
  siteName: string;
  onRefresh: () => void | Promise<void>;
  onResolve: (message: ContactMessage) => void | Promise<void>;
  onDelete: (message: ContactMessage) => void;
  onViewUser: (profile: Profile) => void;
}) {
  const { toast } = useToast();
  const [inboxParams, setInboxParams] = useSearchParams();
  const requestedId = inboxParams.get('message');
  const [activeId, setActiveId] = useState<string | null>(requestedId);
  useEffect(() => { setActiveId(requestedId); }, [requestedId]);
  const [reply, setReply] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replyInFlight = useRef(false);
  const groups = groupSupportThreads(messages);
  const activeGroup = groups.find(group => group.items.some(message => message.id === activeId));
  const active = activeGroup?.latest || null;
  const legacy = useLegacySupportMessages(active?.user_id, adminId || undefined);
  const entries = mergeSupportHistory(activeGroup?.items || [], legacy.messages, active?.user_id || undefined);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ threadId: string; prefill?: string }>).detail;
      setActiveId(detail.threadId);
      if (detail.prefill) setReply(detail.prefill);
    };
    window.addEventListener('admin-open-message', handler);
    return () => window.removeEventListener('admin-open-message', handler);
  }, []);

  const sendReply = async () => {
    if (!active || !adminId || replyInFlight.current || sending || (!reply.trim() && !attachment)) return;
    replyInFlight.current = true;
    setSending(true);
    try {
      if (reply.trim()) {
        const { error } = await supabase.from('contact_message_entries').insert({
          contact_message_id: active.id,
          sender_id: adminId,
          sender_role: 'admin',
          body: reply.trim(),
        });
        if (error) throw error;
      }
      setReply('');
      if (attachment) {
        const uploaded = await uploadContactAttachment(active.id, adminId, attachment);
        const { error } = await supabase.from('contact_message_entries').insert({
          contact_message_id: active.id,
          sender_id: adminId,
          sender_role: 'admin',
          body: null,
          attachment_path: uploaded.path,
          attachment_name: uploaded.name,
          attachment_type: uploaded.type,
          attachment_size: uploaded.size,
        });
        if (error) throw error;
      }
      setReply('');
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = '';
      toast(active.user_id ? 'Reply sent. The member was notified immediately.' : 'Reply stored. Use email to deliver it to this guest.');
      await onRefresh();
    } catch (error) {
      await onRefresh();
      toast(`Could not send reply: ${error instanceof Error ? error.message : 'Please try again.'}`, 'error');
    } finally {
      replyInFlight.current = false;
      setSending(false);
    }
  };

  const openAttachment = async (entry: ContactMessageEntry) => {
    if (!entry.attachment_path) return;
    try { await openContactAttachment(entry.attachment_path); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not open attachment.', 'error'); }
  };

  if (messages.length === 0) return <div className="card p-8 text-center"><Mail className="mx-auto h-10 w-10 text-ink-300" /><p className="mt-3 text-sm text-ink-500">No messages yet.</p></div>;

  return (
    <div className="admin-message-inbox grid min-h-0 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {messages.map(thread => <SupportReceipt key={thread.id} thread={thread.id} entries={thread.entries || []} active={Boolean(activeGroup?.items.some(item => item.id === thread.id))} />)}
      <div className={cn('card min-h-0 min-w-0 overflow-y-auto', active && 'hidden lg:block')}>
        <div className="border-b border-ink-100 p-4"><h2 className="font-semibold text-ink-900">Messages</h2><p className="mt-1 text-xs text-ink-500">Direct support requests, replies, and attachments</p></div>
        {groups.map(({ latest: message }) => (
          <button key={message.id} type="button" onClick={() => { setReply(''); setAttachment(null); setInboxParams({ tab: 'contact', message: message.id }); }} className={cn('flex w-full items-start gap-3 border-b border-ink-50 p-4 text-left hover:bg-ink-50', active?.id === message.id && 'bg-brand-50')}>
            <Avatar name={message.user?.full_name || message.name} src={message.user?.avatar_url} size={40} verified={message.user?.role === 'driver' && message.user?.is_verified} />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-ink-900">{message.user?.full_name || message.name}</p><span className={cn('badge shrink-0 text-[10px] capitalize', message.status === 'new' ? 'badge-warning' : message.status === 'resolved' ? 'badge-success' : 'badge-brand')}>{message.status}</span></div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">{message.user?.role === 'owner' ? 'Car owner' : message.user?.role === 'driver' ? 'Driver' : 'Guest'}</p><p className="mt-0.5 truncate text-xs text-ink-600">{lastContactEntry(message)?.body || lastContactEntry(message)?.attachment_name || message.message}</p><p className="mt-1 text-[10px] text-ink-400">{formatDateTime(message.updated_at || message.created_at)}</p></div>
          </button>
        ))}
        </div>
      <div className={cn('card min-h-0 min-w-0 flex-col overflow-hidden', !active ? 'hidden lg:flex' : 'flex')}>
        {active ? <>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ink-100 p-4">
            <button type="button" onClick={() => setInboxParams({ tab: 'contact' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /> Back</button>
            <Avatar name={active.user?.full_name || active.name} src={active.user?.avatar_url} size={42} verified={active.user?.role === 'driver' && active.user?.is_verified} />
            <div className="min-w-0 flex-1"><p className="break-words font-semibold text-ink-900">{active.user?.full_name || active.name}</p><p className="break-words text-xs text-ink-500">{active.email} · {active.user ? active.user.role === 'owner' ? 'Car owner' : 'Driver' : 'Guest message'}</p></div>
            <div className="ml-auto flex flex-wrap gap-2">{active.user && <button type="button" onClick={() => onViewUser(active.user!)} className="btn-secondary px-3 py-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> View user</button>}<a href={`mailto:${active.email}`} className="btn-secondary px-3 py-1.5 text-xs"><Mail className="h-3.5 w-3.5" /> Email</a>{active.status !== 'resolved' && <button type="button" onClick={() => void onResolve(active)} className="btn-secondary px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Resolve</button>}<button type="button" onClick={() => onDelete(active)} className="btn-ghost px-3 py-1.5 text-xs text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div>
          </div>
          <div role="region" aria-label="Message history" tabIndex={0} className="admin-message-history min-h-0 flex-1 space-y-3 overflow-y-auto bg-ink-50/50 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-500">
            {legacy.loading && <p role="status" className="text-xs text-ink-600">Loading older support history…</p>}
            {legacy.error && <p role="alert" className="text-xs text-ink-600">Older support history could not be loaded. <button type="button" className="underline" onClick={legacy.retry}>Retry</button></p>}
            {entries.map((entry) => {
              const mine = entry.sender_role === 'admin';
              return <div key={entry.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', mine ? 'chat-outgoing' : 'bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}><p className={cn('mb-1 text-[10px] font-bold', mine ? 'text-white/80' : 'text-ink-700')}>{entry.legacy?.type === 'system' ? `${siteName} system` : mine ? `Official ${siteName} Support` : entry.sender?.full_name || active.name}</p>{entry.body && <p className="whitespace-pre-wrap break-words">{entry.body}</p>}{entry.legacy && <LegacySupportContent message={entry.legacy} />}{entry.attachment_path && <button type="button" onClick={() => void openAttachment(entry)} className={cn('mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold', mine ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-700')}><FileText className="h-4 w-4" /><span className="min-w-0 truncate">{entry.attachment_name || 'Open attachment'}</span></button>}<p className={cn('mt-1 text-[10px]', mine ? 'text-white/80' : 'text-ink-400')}>{formatDateTime(entry.created_at)}{mine && !entry.unsent_at && <span> · {(entry.read_at || entry.legacy?.read) ? 'Read' : (entry.delivered_at || entry.legacy?.delivered_at) ? 'Delivered' : 'Sent'}</span>}</p>{mine && entry.sender_id === adminId && !entry.unsent_at && !entry.id.startsWith('legacy:') && <button className="mt-1 text-xs underline" onClick={async () => { if (!window.confirm('Unsend this message? The recipient may already have seen it. Downloaded files cannot be recalled.')) return; const { error } = await supabase.rpc('admin_unsend_support_message', { p_entry: entry.id }); if (error) toast(error.message, 'error'); else await onRefresh(); }}>Unsend</button>}</div></div>;
            })}
          </div>
          <div className="shrink-0 border-t border-ink-100 p-3">
            {!active.user_id && <div className="mb-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">This guest is not signed in. Replies are stored here, but use the Email button to deliver the response.</div>}
            {attachment && <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800"><span className="truncate">{attachment.name}</span><button type="button" onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ''; }} className="font-bold">Remove</button></div>}
            <div className="flex items-end gap-2"><input ref={fileRef} type="file" accept="image/*,.heic,.heif,.pdf,.txt,.doc,.docx" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><button type="button" onClick={() => fileRef.current?.click()} className="mb-0.5 rounded-full p-2 text-ink-500 hover:bg-ink-100" aria-label="Attach file"><Upload className="h-5 w-5" /></button><AutoGrowTextarea value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} className="input min-h-10 flex-1 py-2.5" placeholder="Reply to this message…" maxLength={5000} /><button type="button" onClick={() => void sendReply()} disabled={sending || (!reply.trim() && !attachment)} className="btn-primary mb-0.5 px-3">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
            <p className="mt-2 text-[11px] text-ink-400">Replies, images, PDFs, text, and Word files are stored privately in this history.</p>
          </div>
        </> : <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-500">Select a message to see its complete history and reply.</div>}
      </div>
    </div>
  );
}

function AdminChat({ user, onDataChange, onViewUser }: { user: { id: string; email: string } | null; onDataChange: () => void | Promise<void>; onViewUser: (profile: Profile) => void }) {
  const { toast } = useToast();
  const { settings: siteSettings } = useSiteSettings();
  const [conversations, setConversations] = useState<(Conversation & { driver?: Profile; owner?: Profile })[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinedConversationIds, setJoinedConversationIds] = useState<Set<string>>(new Set());
  const [supportRequestedIds, setSupportRequestedIds] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState(false);
  const [confirmCloseChat, setConfirmCloseChat] = useState(false);
  const [confirmLeaveChat, setConfirmLeaveChat] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const [{ data }, { data: memberships }, { data: supportRequests }] = await Promise.all([
      supabase.from('conversations').select(`*, driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS})`).order('last_message_at', { ascending: false, nullsFirst: false }),
      supabase.from('conversation_admins').select('conversation_id').eq('admin_id', user.id),
      supabase.from('reports').select('target_id, status').eq('target_type', 'conversation').eq('reason', 'Support requested'),
    ]);
    const invitedIds = new Set<string>((supportRequests || []).map((request) => request.target_id).filter((id): id is string => Boolean(id)));
    const supportIds = new Set<string>((supportRequests || []).filter((request) => ['open', 'reviewing'].includes(request.status)).map((request) => request.target_id).filter((id): id is string => Boolean(id)));
    const joinedIds = new Set<string>((memberships || []).map((membership) => membership.conversation_id));
    const nextConversations = ((data as (Conversation & { driver?: Profile; owner?: Profile })[]) || [])
      .filter((conversation) => Boolean(conversation.driver && conversation.owner) && invitedIds.has(conversation.id))
      .sort((a, b) => {
      const supportPriority = Number(supportIds.has(b.id)) - Number(supportIds.has(a.id));
      if (supportPriority !== 0) return supportPriority;
      return new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime();
    });
    setConversations(nextConversations);
    setJoinedConversationIds(joinedIds);
    setSupportRequestedIds(supportIds);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const pendingConversationId = sessionStorage.getItem('admin-open-conversation');
    if (pendingConversationId) {
      setActiveId(pendingConversationId);
      sessionStorage.removeItem('admin-open-conversation');
    }
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
    if (!user || !activeId || !text.trim() || sending) return;
    if (!active || (active.admin_id !== user.id && !joinedConversationIds.has(active.id))) { toast('Join this conversation before sending a message.', 'error'); return; }
    const content = text.trim();
    setSending(true);
    const { error } = await supabase.rpc('send_message', { p_conversation_id: activeId, p_content: content });
    setSending(false);
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
    await Promise.all([loadMessages(), loadConversations()]);
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
        <p className="mt-3 text-sm text-ink-500">No support invitations yet. Member conversations only appear after support is requested or an administrator joins.</p>
      </div>
    );
  }

  const other = active?.driver || active?.owner;
  const activeJoined = Boolean(active && (active.admin_id === user?.id || joinedConversationIds.has(active.id)));
  const supportSessionActive = Boolean(active?.support_reopened_at && !active.support_resolved_at && !active.closed_at);
  const canLeaveLiveChat = Boolean(active && active.driver && active.owner && !active.closed_at && !supportSessionActive && active.admin_id !== user?.id && joinedConversationIds.has(active.id));

  return (
    <div className="grid h-[70dvh] min-h-[420px] min-w-0 gap-4 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className={cn('card overflow-y-auto', active && 'hidden lg:block')}>
        {conversations.map((c) => {
          const u = c.driver || c.owner;
          const joined = c.admin_id === user?.id || joinedConversationIds.has(c.id);
          return (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={cn('flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left hover:bg-ink-50', activeId === c.id && 'bg-brand-50')}>
              <Avatar name={u?.full_name || 'User'} src={u?.avatar_url} size={44} verified={u?.role === 'driver' && u?.is_verified} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{c.driver && c.owner ? `Driver: ${c.driver.full_name} ↔ Car owner: ${c.owner.full_name}` : u?.full_name}</p>
                <p className="text-xs text-ink-500">Driver and car-owner conversation · support invited</p>
                <p className="mt-0.5 text-[10px] text-ink-400">{formatDateTime(c.last_message_at || c.created_at)}</p>
              </div>
              <div className="text-right">{supportRequestedIds.has(c.id) && !(c.support_reopened_at && !c.support_resolved_at && !c.closed_at) ? <span className="badge-warning text-[10px]">Support requested</span> : c.support_reopened_at && !c.support_resolved_at && !c.closed_at ? <span className="badge-accent text-[10px]">Support open</span> : joined && <span className="badge-success text-[10px]">Joined</span>}{c.last_message_at && <span className="mt-1 block text-[10px] text-ink-400">{timeAgo(c.last_message_at)}</span>}</div>
            </button>
          );
        })}
      </div>

      <div className={cn('card min-h-0 min-w-0 flex-col overflow-hidden', !active ? 'hidden lg:flex' : 'flex')}>
        {active && other ? (
          <>
            <AdminSupportChatHeader driver={active.driver} owner={active.owner} closed={!!active.closed_at} supportSessionActive={supportSessionActive} joined={activeJoined} canLeave={canLeaveLiveChat} joining={joining} leaving={leaving} onBack={() => setActiveId(null)} onViewUser={onViewUser} onJoin={() => void joinConversation(active.id)} onLeave={() => setConfirmLeaveChat(true)} onCloseChat={() => setConfirmCloseChat(true)} />
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-ink-50/50 p-4">
              {messages.map((m) => {
                const mine = m.sender_id === user?.id;
                const senderName = m.type === 'system' ? `${siteSettings.site_name} system` : (m.sender?.full_name || (mine ? 'Administrator' : 'Member'));
                return (
                  <div key={m.id} className={cn('flex', m.type === 'system' ? 'justify-center' : mine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', m.type === 'system' ? 'bg-ink-50 text-center text-xs text-ink-700 ring-1 ring-ink-200' : mine ? 'chat-outgoing' : 'bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}>
                      <p className={cn('mb-1 text-[10px] font-bold', mine && m.type !== 'system' ? 'text-white/80' : m.sender?.role === 'admin' || m.type === 'system' ? 'text-ink-700' : 'text-brand-700')}>{senderName}{m.sender?.role === 'admin' && m.type !== 'system' ? ' · Admin' : ''}</p>
                      {m.type === 'image' ? <ChatMediaImage src={m.content || ''} alt={`Image from ${senderName}`} /> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      <div className={cn('mt-0.5 text-[10px]', mine && m.type !== 'system' ? 'text-white/80' : 'text-ink-400')}>{formatMessageTimestamp(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {activeJoined && !active.closed_at ? <div className="flex shrink-0 items-end gap-2 border-t border-ink-100 p-3">
              <input ref={imageInputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadChatImage(file); }} />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} aria-label="Send an image" title="Send an image" className="rounded-full p-2 text-ink-500 hover:bg-ink-100 disabled:cursor-wait disabled:opacity-60">{uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}</button>
              <AutoGrowTextarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); send(); } }} placeholder="Type a message…" aria-label="Message to this support chat" className="input min-h-10 min-w-0 flex-1 py-2.5" disabled={sending} />
              <button onClick={send} disabled={sending || !text.trim()} aria-label="Send message" className="btn-primary px-3">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div> : <div className="flex items-center gap-2 border-t border-ink-200 bg-ink-50 p-3 text-xs text-ink-700"><LockKeyhole className="h-4 w-4" />This history is read-only. Click Reopen with support to let both members and support message again.</div>}
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
