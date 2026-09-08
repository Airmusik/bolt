import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { TERMS_DOCUMENT } from './legal';

export type LegalDocument = { version: string; effectiveDate: string; title: string; summary: string; sections: { title: string; paragraphs: string[] }[] };
export const FALLBACK_TERMS = TERMS_DOCUMENT as LegalDocument;

export function useLegalDocument(slug: 'terms' | 'privacy', fallback?: LegalDocument) {
  const [document, setDocument] = useState<LegalDocument | null>(fallback || null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_current_legal_document', { p_slug: slug });
    if (!error && data) setDocument(data as LegalDocument);
    setLoading(false);
  }, [slug]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { document, loading, refresh };
}
