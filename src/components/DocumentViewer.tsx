import { useEffect, useState } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import type { DocumentRow } from '@/lib/types';

export function DocumentViewer({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [isImage, setIsImage] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(doc.file_url);
        const path = url.pathname.split(`/${DOCUMENT_BUCKET}/`)[1];
        if (!path) {
          setError('Could not resolve document path.');
          setLoading(false);
          return;
        }
        const ext = path.split('.').pop()?.toLowerCase();
        setIsImage(['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || ''));
        const { data, error: signError } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 3600);
        if (signError || !data?.signedUrl) {
          setError('Could not load document. The file may have been removed.');
          setLoading(false);
          return;
        }
        setSignedUrl(data.signedUrl);
        setLoading(false);
      } catch {
        setError('Could not load document.');
        setLoading(false);
      }
    })();
  }, [doc.file_url]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-center justify-between border-b border-ink-100 p-4">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
            <FileText className="h-5 w-5 text-brand-600" /> {doc.label || doc.type.replace(/_/g, ' ')}
          </h3>
          <div className="flex items-center gap-2">
            {signedUrl && <a href={signedUrl} download className="btn-ghost text-sm"><Download className="h-4 w-4" /> Download</a>}
            <button onClick={onClose} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-ink-50 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-10 w-10 text-ink-300" />
              <p className="text-sm text-ink-500">{error}</p>
            </div>
          ) : isImage ? (
            <img src={signedUrl!} alt="Document" className="mx-auto max-h-full max-w-full object-contain" />
          ) : (
            <iframe src={signedUrl!} title="Document" className="h-full w-full rounded-lg bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
