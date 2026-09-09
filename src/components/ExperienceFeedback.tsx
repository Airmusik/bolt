import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { Modal } from './Modal';
import { StarRatingInput } from './StarRatingInput';
import { useToast } from './useToast';
import { FEEDBACK_SUBMITTED_EVENT, feedbackIsRecent, feedbackRoute, feedbackStorageKey, type FeedbackKind as Kind } from '@/lib/experienceFeedback';

type Submission = { userId: string; kind: Kind; submittedAt: string };
function rememberSubmission(detail: Submission) {
  try { localStorage.setItem(feedbackStorageKey(detail.userId, detail.kind), detail.submittedAt); } catch { /* Server cooldowns still apply without browser storage. */ }
  window.dispatchEvent(new CustomEvent(FEEDBACK_SUBMITTED_EVENT, { detail }));
}
function hasRecentSubmission(userId: string, kind: Kind) {
  try { return feedbackIsRecent(localStorage.getItem(feedbackStorageKey(userId, kind)), kind); } catch { return false; }
}
function FeedbackDialog({ kind, conversationId, onClose }: { kind: Kind; conversationId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!rating || saving || !user) return;
    setSaving(true); setError('');
    try {
      const { error: failure } = await supabase.rpc('submit_experience_feedback', { p_kind: kind, p_rating: rating, p_comment: comment.trim(), p_request_id: requestId.current, p_conversation_id: conversationId || null });
      if (failure) throw new Error(failure.message);
      rememberSubmission({ userId: user.id, kind, submittedAt: new Date().toISOString() });
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
  const { user } = useAuth();
  const userId = user?.id;
  const { settings } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(false);
  const [checking, setChecking] = useState(kind === 'chat');
  useEffect(() => {
    if (!userId || kind !== 'chat') { setChecking(false); return; }
    let active = true, submitted = false;
    setChecking(true); setRecent(hasRecentSubmission(userId, kind));
    void supabase.from('experience_feedback').select('created_at').eq('user_id', userId).eq('kind', kind).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (!error) setRecent(submitted || feedbackIsRecent(data?.created_at, kind) || hasRecentSubmission(userId, kind));
      setChecking(false);
    });
    const update = (event: Event) => {
      const detail = (event as CustomEvent<Submission>).detail;
      if ((detail?.userId === userId && detail.kind === kind) || hasRecentSubmission(userId, kind)) { submitted = true; setRecent(true); setOpen(false); }
    };
    window.addEventListener(FEEDBACK_SUBMITTED_EVENT, update);
    window.addEventListener('storage', update);
    return () => { active = false; window.removeEventListener(FEEDBACK_SUBMITTED_EVENT, update); window.removeEventListener('storage', update); };
  }, [userId, kind]);
  if (!userId || (kind === 'chat' && (checking || recent))) return null;
  return <><button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-11 px-3 py-2 text-xs"><MessageSquare className="h-4 w-4" /> {kind === 'chat' ? 'Rate chat experience' : `Rate ${settings.site_name}`}</button>{open && <FeedbackDialog kind={kind} conversationId={conversationId} onClose={() => setOpen(false)} />}</>;
}

export function ExperienceFeedbackPrompt() {
  const { user, profile } = useAuth();
  const { settings } = useSiteSettings();
  const { pathname } = useLocation();
  const eligible = !!user && profile?.id === user.id && ['driver', 'owner'].includes(profile.role) && !profile.is_suspended && settings.maintenance_mode !== 'true';
  // One controller survives navigation; browsing time does not reset on every page.
  return eligible ? <Prompt key={user.id} userId={user.id} pathname={pathname} /> : null;
}

function Prompt({ userId, pathname }: { userId: string; pathname: string }) {
  const route = useRef(pathname);
  useEffect(() => { route.current = pathname; }, [pathname]);
  const [invitation, setInvitation] = useState<{ kind: Kind; conversationId?: string } | null>(null);
  useEffect(() => {
    let cancelled = false, busy = false, visibleBrowsingMs = 0;
    let pending: { kind: Kind; conversationId?: string } | null = null;
    const attempted = new Set<string>();
    const clearMatching = (event: Event) => {
      const detail = (event as CustomEvent<Submission>).detail;
      if (detail?.userId === userId) {
        setInvitation(current => current?.kind === detail.kind ? null : current);
        if (pending?.kind === detail.kind) pending = null;
        attempted.add(`${detail.kind}:`);
      }
    };
    const fromStorage = () => setInvitation(current => current && hasRecentSubmission(userId, current.kind) ? null : current);
    const check = async () => {
      if (cancelled || busy) return;
      const currentRoute = feedbackRoute(route.current);
      // Do not interrupt typing, image selection, hidden tabs, or another dialog.
      if (!currentRoute.allowed || document.visibilityState !== 'visible' || document.querySelector('[role="dialog"]') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      visibleBrowsingMs += 5000;
      if (visibleBrowsingMs < 20000) return;
      if (pending) { if (!hasRecentSubmission(userId, pending.kind)) setInvitation(pending); pending = null; return; }
      busy = true;
      try {
        const choices: { kind: Kind; conversationId?: string }[] = [{ kind: 'site' }];
        if (currentRoute.conversationId) choices.push({ kind: 'chat', conversationId: currentRoute.conversationId });
        for (const choice of choices) {
          const key = `${choice.kind}:${choice.conversationId || ''}`;
          if (attempted.has(key) || attempted.has(`${choice.kind}:`) || hasRecentSubmission(userId, choice.kind)) continue;
          const { data, error } = await supabase.rpc('claim_experience_prompt', { p_kind: choice.kind, p_conversation_id: choice.conversationId || null });
          if (cancelled) return;
          if (error) continue;
          attempted.add(key);
          if (data === true) { pending = choice; break; }
        }
      } catch { /* A transient network failure can retry at the next idle check. */ }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => void check(), 5000);
    window.addEventListener(FEEDBACK_SUBMITTED_EVENT, clearMatching);
    window.addEventListener('storage', fromStorage);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener(FEEDBACK_SUBMITTED_EVENT, clearMatching); window.removeEventListener('storage', fromStorage); };
  }, [userId]);
  return invitation ? <FeedbackDialog kind={invitation.kind} conversationId={invitation.conversationId} onClose={() => setInvitation(null)} /> : null;
}
