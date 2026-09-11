import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from './useToast';
import { Modal } from './Modal';
import { StarRatingInput } from './StarRatingInput';
import type { Conversation } from '@/lib/types';

export function MemberReviewButton({ conversation, memberName }: { conversation: Conversation; memberName: string }) {
  const { user } = useAuth();
  const target = user?.id === conversation.driver_id ? conversation.owner_id : user?.id === conversation.owner_id ? conversation.driver_id : null;
  if (!user || !target || target === user.id || (!conversation.connection_id && !conversation.application_id)) return null;
  return <MemberReviewAction key={`${user.id}:${target}`} conversation={conversation} memberName={memberName} reviewerId={user.id} targetId={target} />;
}

function MemberReviewAction({ conversation, memberName, reviewerId, targetId }: { conversation: Conversation; memberName: string; reviewerId: string; targetId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const saveLock = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const version = ++request.current;
      setLoading(true);
      void supabase.from('reviews').select('id').eq('reviewer_id', reviewerId).eq('reviewee_id', targetId).limit(1).maybeSingle().then(({ data, error: failure }) => {
        if (!active || request.current !== version) return;
        setCheckFailed(Boolean(failure));
        if (!failure) { setReviewed(Boolean(data)); if (data) setOpen(false); }
        setLoading(false);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    const channel = supabase.channel(`member-review:${reviewerId}:${targetId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `reviewer_id=eq.${reviewerId}` }, refresh).subscribe();
    return () => { active = false; window.removeEventListener('focus', refresh); void supabase.removeChannel(channel); };
  }, [reviewerId, targetId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating || saveLock.current || reviewed || loading || checkFailed) return;
    saveLock.current = true;
    setSaving(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('submit_conversation_review', { p_conversation_id: conversation.id, p_rating: rating, p_content: content.trim() });
      if (failure && failure.code !== '23505') throw new Error(failure.message);
      if (!failure && !data?.id) throw new Error('Your review was not confirmed. Please try again.');
      ++request.current;
      setReviewed(true); setOpen(false);
      toast(failure ? 'You have already rated this member.' : 'Your member review has been saved.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not submit your review. Try again.'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  // Check the member pair before exposing the button, not only when opening it.
  if (reviewed) return null;
  return <>
    {!loading && !checkFailed && <button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-11 px-3 py-2 text-xs"><Star className="h-4 w-4 text-amber-500" /> Rate this member</button>}
    {open && <Modal title={`Review ${memberName}`} onClose={() => { if (!saving) setOpen(false); }}>
      <p className="mb-4 text-sm text-ink-600">Share a positive experience or constructive feedback. Your name, stars, and review appear on this member’s profile. Do not include private contact or payment details.</p>
      {loading ? <p role="status">Checking your review…</p> : checkFailed ? <p role="alert">Could not check your previous rating. Please close this window and refresh the page.</p> : <form onSubmit={submit}>
        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
        <StarRatingInput value={rating} onChange={setRating} disabled={saving} />
        <label className="label mt-4" htmlFor="member-review-comment">Your experience (optional)</label>
        <textarea id="member-review-comment" className="input min-h-28" maxLength={2000} value={content} onChange={event => setContent(event.target.value)} disabled={saving} placeholder="What went well, or what could be better?" />
        <p className="mt-1 text-xs text-ink-500">One rating per member, even if you connect again. Positive reviews count toward the member’s rating, up to 5 stars.</p>
        <button type="submit" disabled={!rating || saving} className="btn-primary mt-4 w-full">{saving ? 'Submitting…' : 'Submit member review'}</button>
      </form>}
    </Modal>}
  </>;
}
