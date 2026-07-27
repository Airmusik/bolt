export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
