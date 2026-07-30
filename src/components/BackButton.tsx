import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ to, label = 'Back', className }: { to?: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={`inline-flex items-center gap-1 text-sm text-ink-500 transition-colors hover:text-ink-800 ${className || ''}`}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}
