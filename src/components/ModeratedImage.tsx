import { useEffect, useState } from 'react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
}

export function ModeratedImage({ src, alt = '', ...props }: Props) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let active = true;
    setResolvedSrc(src);
    try {
      const url = new URL(src);
      const parts = url.pathname.split(`/${DOCUMENT_BUCKET}/`);
      if (parts.length < 2) return;
      const path = decodeURIComponent(parts[1]);
      supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 900).then(({ data }) => {
        if (active && data?.signedUrl) setResolvedSrc(data.signedUrl);
      });
    } catch {
      // Local/blob URLs and already-public URLs can be used directly.
    }
    return () => { active = false; };
  }, [src]);

  return <img src={resolvedSrc} alt={alt} {...props} />;
}
