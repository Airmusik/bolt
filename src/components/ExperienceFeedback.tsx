import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { Modal } from './Modal';
import { StarRatingInput } from './StarRatingInput';
import { useToast } from './useToast';

type Kind = 'site' | 'chat';
function FeedbackDialog({ kind, conversationId, onClose }: { kind: Kind; conversationId?: string; onClose: () => void }) {
  const { settings } = useSiteSettings();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!rating || saving) return;
    setSaving(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('submit_experience_feedback', { p_kind: kind, p_rating: rating, p_comment: comment.trim(), p_request_id: requestId.current, p_conversation_id: conversationId || null });
      if (failure) throw new Error(failure.message);
      toast('Thank you. Your feedback was sent privately to the admin team.'); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send feedback. Please try again.'); }
    finally { setSaving(false); }
  };
  return <Modal title={kind === 'chat' ? 'How was your chat experience?' : `How is your experience with ${settings.site_name}?`} onClose={() => { if (!saving) onClose(); }}>
    <p className="mb-4 text-sm text-ink-600">{kind === 'chat' ? 'Tell us how well messaging worked for you.' : 'Tell us what you enjoy and what we should improve.'} Your stars and comments are private to you and the admin team. They do not change another member’s rating.</p>
    <form onSubmit={submit}>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <StarRatingInput value={rating} onChange={setRating} disabled={saving} />
      <label htmlFor="experience-comment" className="label mt-4">Your opinion (optional)</label>
      <textarea id="experience-comment" value={comment} onChange={event => setComment(event.target.value)} disabled={saving} maxLength={2000} className="input min-h-28" placeholder="What worked well? What could we do better?" />
      <p className="mt-1 text-xs text-ink-500">Please leave out passwords, ID numbers, and payment details. {comment.length}/2000</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary">Not now</button><button type="submit" disabled={!rating || saving} className="btn-primary">{saving ? 'Sending…' : 'Send feedback'}</button></div>
    </form>
  </Modal>;
}

export function ExperienceFeedbackButton({ kind = 'site', conversationId }: { kind?: Kind; conversationId?: string }) {
  const { settings } = useSiteSettings();
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-11 px-3 py-2 text-xs"><MessageSquare className="h-4 w-4" /> {kind === 'chat' ? 'Rate chat experience' : `Rate ${settings.site_name}`}</button>{open && <FeedbackDialog kind={kind} conversationId={conversationId} onClose={() => setOpen(false)} />}</>;
}

export function ExperienceFeedbackPrompt() {
  const { user, profile } = useAuth();
  const { settings } = useSiteSettings();
  const { pathname } = useLocation();
  const chatId = /^\/chat\/([0-9a-f-]{36})$/i.exec(pathname)?.[1];
  const eligible = !!user && profile?.id === user.id && ['driver', 'owner'].includes(profile.role) && !profile.is_suspended && settings.maintenance_mode !== 'true';
  if (!eligible || (!chatId && !['/dashboard', '/notifications'].includes(pathname))) return null;
  return <Prompt key={`${user.id}:${chatId || 'site'}`} kind={chatId ? 'chat' : 'site'} conversationId={chatId} />;
}

function Prompt({ kind, conversationId }: { kind: Kind; conversationId?: string }) {
  const { settings } = useSiteSettings();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const claim = async () => {
      // Do not interrupt typing, an upload, or another dialog.
      if (document.visibilityState !== 'visible' || document.querySelector('[role="dialog"]') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) { timer = window.setTimeout(() => void claim(), 15_000); return; }
      const { data, error } = await supabase.rpc('claim_experience_prompt', { p_kind: kind, p_conversation_id: conversationId || null });
      if (!cancelled && !error && data === true) setVisible(true);
    };
    timer = window.setTimeout(() => void claim(), 45_000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [kind, conversationId]);
  if (!visible) return null;
  return <div className="container-content py-2"><aside aria-label="Experience feedback invitation" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
    <p className="flex items-center gap-2 text-sm text-ink-700"><Star className="h-4 w-4 shrink-0 text-amber-500" /> {kind === 'chat' ? 'How is chatting working for you?' : `How are you finding ${settings.site_name}?`}</p>
    <div className="flex gap-2"><button type="button" onClick={() => setOpen(true)} className="btn-secondary min-h-11 px-3 py-2 text-xs">Share feedback</button><button type="button" onClick={() => setVisible(false)} className="btn-ghost min-h-11 px-3 py-2 text-xs">Not now</button></div>
    {open && <FeedbackDialog kind={kind} conversationId={conversationId} onClose={() => { setOpen(false); setVisible(false); }} />}
  </aside></div>;
}
