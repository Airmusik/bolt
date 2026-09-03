import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { hasPreviousSitePage } from '@/lib/backNavigation';

export function BackButton({ to, label = 'Back', className }: { to?: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        // Preserve history across same-site full-page links as well as SPA routes.
        if (hasPreviousSitePage(window.history.state?.idx, window.history.length, document.referrer, window.location.href)) navigate(-1);
        else navigate(to || '/', { replace: true });
      }}
      className={`inline-flex items-center gap-1 text-sm text-ink-500 transition-colors hover:text-ink-800 ${className || ''}`}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}
