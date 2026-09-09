import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from './useToast';
import { Modal } from './Modal';
import { StarRatingInput } from './StarRatingInput';
import type { Conversation, Review } from '@/lib/types';

export function MemberReviewButton({ conversation, memberName }: { conversation: Conversation; memberName: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [existing, setExisting] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    setLoading(true); setError(''); setExisting(null); setRating(0); setContent('');
    const query = supabase.from('reviews').select('*').eq('reviewer_id', user.id);
    void (conversation.connection_id ? query.eq('connection_id', conversation.connection_id) : query.eq('application_id', conversation.application_id!)).maybeSingle().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) setError('Could not load your review. Close this window and try again.');
      if (data) { setExisting(data as Review); setRating(data.rating); setContent(data.content || ''); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [open, user, conversation.connection_id, conversation.application_id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating || saving || existing) return;
    setSaving(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('submit_conversation_review', { p_conversation_id: conversation.id, p_rating: rating, p_content: content.trim() });
      if (failure) throw new Error(failure.message);
      setExisting(data as Review);
      toast('Your member review has been saved.'); setOpen(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not submit your review. Try again.'); }
    finally { setSaving(false); }
  };
  if (!conversation.connection_id && !conversation.application_id) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="btn-ghost min-h-11 px-3 py-2 text-xs"><Star className="h-4 w-4 text-amber-500" /> Rate this member</button>
    {open && <Modal title={`Review ${memberName}`} onClose={() => { if (!saving) setOpen(false); }}>
      <p className="mb-4 text-sm text-ink-600">Share a positive experience or constructive feedback. Your name, stars, and review appear on this member’s profile. Do not include private contact or payment details.</p>
      {loading ? <p role="status">Loading your review…</p> : <form onSubmit={submit}>
        {existing && <p className="mb-3 rounded-lg bg-ink-50 p-3 text-sm">You have already reviewed this connection. Your review is shown below.</p>}
        {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
        <StarRatingInput value={rating} onChange={setRating} disabled={saving || !!existing} />
        <label className="label mt-4" htmlFor="member-review-comment">Your experience (optional)</label>
        <textarea id="member-review-comment" className="input min-h-28" maxLength={2000} value={content} onChange={event => setContent(event.target.value)} disabled={saving || !!existing} placeholder="What went well, or what could be better?" />
        <p className="mt-1 text-xs text-ink-500">One review per connection. Positive reviews count toward the member’s rating, up to 5 stars.</p>
        {!existing && <button type="submit" disabled={!rating || saving} className="btn-primary mt-4 w-full">{saving ? 'Submitting…' : 'Submit member review'}</button>}
      </form>}
    </Modal>}
  </>;
}
