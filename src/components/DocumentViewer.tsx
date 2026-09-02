import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText } from 'lucide-react';
import { supabase, DOCUMENT_BUCKET } from '@/lib/supabase';
import type { DocumentRow } from '@/lib/types';

export function DocumentViewer({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [isImage, setIsImage] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        // The file_url stored in the DB is a public URL, but the bucket is private.
        // Extract the storage path from the URL and use a signed URL for download.
        const url = new URL(doc.file_url);
        const parts = url.pathname.split(`/${DOCUMENT_BUCKET}/`);
        if (parts.length < 2) {
          setError('Could not resolve document path.');
          setLoading(false);
          return;
        }
        const path = decodeURIComponent(parts[1]);
        const ext = path.split('.').pop()?.toLowerCase();
        setIsImage(['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || ''));

        // Try downloading the file directly (works if RLS allows it — admin has read access)
        const { data, error: dlError } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
        if (dlError || !data) {
          // Fallback: try creating a signed URL
          const { data: signedData, error: signedError } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 3600);
          if (signedError || !signedData?.signedUrl) {
            setError('Could not load document. The file may have been removed.');
            setLoading(false);
            return;
          }
          createdUrl = signedData.signedUrl;
          if (!revoked) setObjectUrl(createdUrl);
          setLoading(false);
          return;
        }
        const blob = new Blob([data], { type: data.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream') });
        createdUrl = URL.createObjectURL(blob);
        if (!revoked) setObjectUrl(createdUrl);
        setLoading(false);
      } catch {
        setError('Could not load document.');
        setLoading(false);
      }
    })();

    return () => {
      revoked = true;
      if (createdUrl && createdUrl.startsWith('blob:')) URL.revokeObjectURL(createdUrl);
    };
  }, [doc.file_url]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const url = new URL(doc.file_url);
      const parts = url.pathname.split(`/${DOCUMENT_BUCKET}/`);
      if (parts.length < 2) return;
      const path = decodeURIComponent(parts[1]);
      const { data, error: dlError } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
      if (dlError || !data) {
        // Fallback: open signed URL
        const { data: signedData } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 3600);
        if (signedData?.signedUrl) window.open(signedData.signedUrl, '_blank');
        return;
      }
      const blob = new Blob([data]);
      const link = window.document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = doc.label || doc.type || 'document';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={doc.label || doc.type.replace(/_/g, ' ')}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-card-hover dark:bg-[#141416] sm:h-[88dvh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:p-4">
          <h3 className="flex min-w-0 flex-1 items-center gap-2 font-display text-base font-bold text-ink-900 sm:text-lg">
            <FileText className="h-5 w-5 shrink-0 text-brand-600" /> <span className="truncate">{doc.label || doc.type.replace(/_/g, ' ')}</span>
          </h3>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {objectUrl && <button onClick={handleDownload} aria-label="Download file" className="btn-ghost h-11 px-3 text-sm"><Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span></button>}
            <button onClick={onClose} aria-label="Close document viewer" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-ink-50 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-4">
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
            <div className="flex min-h-full items-center justify-center"><img src={objectUrl!} alt="Document" className="h-auto max-h-full w-auto max-w-full object-contain" /></div>
          ) : (
            <object data={objectUrl ?? undefined} type="application/pdf" className="h-full w-full rounded-lg">
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <FileText className="h-10 w-10 text-ink-300" />
                <p className="text-sm text-ink-500">This file type can't be previewed inline.</p>
                <button onClick={handleDownload} className="btn-secondary text-sm"><Download className="h-4 w-4" /> Download to view</button>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
