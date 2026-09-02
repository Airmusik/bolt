import { useEffect, useId, useRef } from 'react';

export function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: React.ReactNode; size?: 'md' | 'xl' }) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 cursor-default bg-ink-950/40 backdrop-blur-sm" onClick={onClose} aria-label="Close dialog" />
      <div className={`relative flex max-h-[100dvh] w-full flex-col overflow-hidden ${size === 'xl' ? 'max-w-5xl' : 'max-w-md'} animate-scale-in rounded-t-2xl bg-white shadow-card-hover dark:bg-[#141416] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <h3 id={titleId} className="min-w-0 break-words font-display text-base font-bold text-ink-900 sm:text-lg">{title}</h3>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}
