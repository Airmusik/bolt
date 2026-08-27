import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MessageSquare, Check, X, Clock, Send } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { supabase } from '@/lib/supabase';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import { getConnectionBetween, sendConnectionRequest, updateConnectionStatus } from '@/lib/connections';
import type { Connection, Profile } from '@/lib/types';
import { Modal } from './Modal';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  otherUserId: string;
  vehicleId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function ConnectionButton({ otherUserId, vehicleId, size = 'md', className }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showAcceptWarning, setShowAcceptWarning] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const [conn, { data: other }] = await Promise.all([
        getConnectionBetween(user.id, otherUserId),
        supabase.from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('id', otherUserId).maybeSingle(),
      ]);
      setConnection(conn);
      setOtherProfile(other as Profile | null);
      if (conn?.status === 'accepted') {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('connection_id', conn.id)
          .maybeSingle();
        if (conv) setConversationId(conv.id);
      }
      setLoading(false);
    })();
  }, [user, otherUserId]);

  const handleSend = async () => {
    if (!user) { navigate('/login'); return; }
    setSending(true);
    const { connection, error } = await sendConnectionRequest(user.id, otherUserId, message, vehicleId);
    setSending(false);
    if (error) { toast(error, 'error'); return; }
    if (connection) setConnection(connection);
    toast('Connection request sent.');
    setShowModal(false);
    setMessage('');
  };

  const handleAccept = async () => {
    if (!connection) return;
    const { conversationId, error } = await updateConnectionStatus(connection.id, 'accepted');
    if (error) { toast(error, 'error'); return; }
    setConnection({ ...connection, status: 'accepted' });
    if (conversationId) setConversationId(conversationId);
    toast('Connection accepted. Both profiles are now shown as currently on a connection.');
  };

  const handleReject = async () => {
    if (!connection) return;
    const { error } = await updateConnectionStatus(connection.id, 'rejected');
    if (error) { toast(error, 'error'); return; }
    setConnection({ ...connection, status: 'rejected' });
    toast('Connection rejected.');
  };

  const btnSize = size === 'sm' ? 'px-3 py-1.5 text-xs' : '';

  if (!user) {
    return (
      <button onClick={() => navigate('/login')} className={cn('btn-primary', btnSize, className)}>
        <Link2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Connect
      </button>
    );
  }
  if (user.id === otherUserId) return null;

  if (loading) return <div className={cn('h-9 w-24 animate-pulse rounded-lg bg-ink-100', className)} />;

  // If the other user is unavailable, don't show the connect button
  if (otherProfile && otherProfile.availability !== 'available' && (!connection || connection.status === 'rejected' || connection.status === 'withdrawn' || connection.status === 'ended')) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-500', btnSize, className)}>
        <Clock className="h-3.5 w-3.5" /> {otherProfile.availability === 'busy' ? 'Currently on a connection' : 'Unavailable'}
      </span>
    );
  }

  // No connection yet
  if (!connection) {
    return (
      <>
        <button onClick={() => setShowModal(true)} className={cn('btn-primary', btnSize, className)}>
          <Link2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Connect
        </button>
        {showModal && (
          <Modal title="Send connection request" onClose={() => setShowModal(false)}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Introduce yourself…"
              className="input"
            />
            <button onClick={handleSend} disabled={sending} className="btn-primary mt-4 w-full">
              {sending ? 'Sending…' : 'Send request'} <Send className="h-4 w-4" />
            </button>
          </Modal>
        )}
      </>
    );
  }

  // Pending — sent by me
  if (connection.status === 'pending' && connection.requester_id === user.id) {
    return (
      <span className={cn('badge-warning', btnSize, className)}>
        <Clock className="h-3.5 w-3.5" /> Request sent
      </span>
    );
  }

  // Pending — received by me
  if (connection.status === 'pending' && connection.recipient_id === user.id) {
    return (
      <>
        <div className={cn('flex gap-2', className)}>
          <button onClick={() => setShowAcceptWarning(true)} className={cn('btn-primary', btnSize)}><Check className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Accept</button>
          <button onClick={handleReject} className={cn('btn-secondary', btnSize)}><X className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Reject</button>
        </div>
        {showAcceptWarning && <ConfirmDialog
          title="Accept this connection?"
          message="After you accept, both profiles will show “Currently on a connection.” Neither member can accept another connection until this one is ended."
          confirmLabel="Accept connection"
          onConfirm={handleAccept}
          onClose={() => setShowAcceptWarning(false)}
        />}
      </>
    );
  }

  // Accepted
  if (connection.status === 'accepted') {
    return (
      <button
        onClick={() => conversationId ? navigate(`/chat/${conversationId}`) : navigate('/chat')}
        className={cn('btn-primary', btnSize, className)}
      >
        <MessageSquare className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Chat
      </button>
    );
  }

  // Rejected / withdrawn — allow re-request
  return (
    <>
      <button onClick={() => setShowModal(true)} className={cn('btn-secondary', btnSize, className)}>
        <Link2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Connect
      </button>
      {showModal && (
        <Modal title="Send connection request" onClose={() => setShowModal(false)}>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Introduce yourself…" className="input" />
          <button onClick={handleSend} disabled={sending} className="btn-primary mt-4 w-full">{sending ? 'Sending…' : 'Send request'} <Send className="h-4 w-4" /></button>
        </Modal>
      )}
    </>
  );
}
