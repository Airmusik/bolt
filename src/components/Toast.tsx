import { useCallback, useRef, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ToastContext, type ToastType } from './toastContext';

interface Toast { id: number; key: string; type: ToastType; message: string }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeToastKeys = useRef(new Set<string>());

  const remove = useCallback((id: number) => {
    setToasts((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) activeToastKeys.current.delete(removed.key);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const key = `${type}:${message}`;
    if (activeToastKeys.current.has(key)) return;
    activeToastKeys.current.add(key);
    const id = Date.now() + Math.random();
    setToasts((current) => {
      const next = [...current, { id, key, type, message }];
      const dropped = next.slice(0, -4);
      dropped.forEach((item) => activeToastKeys.current.delete(item.key));
      return next.slice(-4);
    });
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-scale-in flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-card-hover ring-1 ring-ink-200 dark:bg-[#141416]"
          >
            {t.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" />}
            {t.type === 'error' && <AlertCircle className="h-5 w-5 shrink-0 text-danger" />}
            {t.type === 'info' && <Info className="h-5 w-5 shrink-0 text-blue-600" />}
            <p className="text-sm text-ink-800 flex-1">{t.message}</p>
            <button onClick={() => remove(t.id)} aria-label="Dismiss notification" className="text-ink-400 hover:text-ink-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
