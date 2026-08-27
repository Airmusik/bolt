import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { CHAT_MEDIA_BUCKET, supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type ChatMediaImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

export function ChatMediaImage({ src, alt = 'Chat attachment', className }: ChatMediaImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setResolvedUrl(null);

    if (/^https?:\/\//i.test(src) || src.startsWith('blob:') || src.startsWith('data:')) {
      setResolvedUrl(src);
      return () => { active = false; };
    }

    void supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(src, 60 * 60).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setResolvedUrl(data.signedUrl);
    });

    return () => { active = false; };
  }, [src]);

  if (failed) {
    return <span className="flex min-h-24 min-w-40 items-center justify-center gap-2 rounded-xl bg-ink-100 px-4 text-xs text-ink-500"><ImageOff className="h-4 w-4" /> Image unavailable</span>;
  }
  if (!resolvedUrl) {
    return <span className="flex min-h-24 min-w-40 items-center justify-center rounded-xl bg-ink-100 text-ink-400"><Loader2 className="h-5 w-5 animate-spin" /></span>;
  }
  return <img src={resolvedUrl} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('max-h-64 max-w-full rounded-xl object-contain', className)} />;
}
