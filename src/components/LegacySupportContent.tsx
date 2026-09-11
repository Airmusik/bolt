import { ChatMediaImage } from './ChatMediaImage';
import type { Message } from '@/lib/types';
import { CHAT_MEDIA_BUCKET, supabase } from '@/lib/supabase';
import { useToast } from './useToast';

export function LegacySupportContent({ message }: { message: Message }) {
  const { toast } = useToast();
  if (!message.content) return null;
  if (message.type === 'image') return <ChatMediaImage src={message.content} />;
  if (message.type !== 'file') return null;
  const open = async () => {
    try {
      const path = message.content!;
      if (/^https:\/\//i.test(path)) { window.open(path, '_blank', 'noopener,noreferrer'); return; }
      if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error('Unsupported attachment address.');
      const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw new Error('Could not open this attachment.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not open attachment.', 'error'); }
  };
  return <button type="button" onClick={() => void open()} className="text-xs underline">Open saved attachment</button>;
}
