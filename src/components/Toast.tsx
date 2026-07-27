import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string }

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-scale-in flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-card-hover ring-1 ring-ink-200"
          >
            {t.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" />}
            {t.type === 'error' && <AlertCircle className="h-5 w-5 shrink-0 text-danger" />}
            {t.type === 'info' && <Info className="h-5 w-5 shrink-0 text-blue-600" />}
            <p className="text-sm text-ink-800 flex-1">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-ink-400 hover:text-ink-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
