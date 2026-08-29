import { useEffect, useId, useRef } from 'react';

export function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: React.ReactNode; size?: 'md' | 'xl' }) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 cursor-default bg-ink-950/40 backdrop-blur-sm" onClick={onClose} aria-label="Close dialog" />
      <div className={`relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto ${size === 'xl' ? 'max-w-5xl' : 'max-w-md'} animate-scale-in rounded-2xl bg-white p-6 shadow-card-hover dark:bg-[#141416]`}>
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="font-display text-lg font-bold text-ink-900">{title}</h3>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Close">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
