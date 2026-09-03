import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { expiryCountdown } from '@/lib/documentLifecycle';
import { cn, formatDateTime } from '@/lib/utils';

export function DocumentExpiry({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const nearExpiry = Date.parse(expiresAt) - now <= 30 * 86_400_000;
  const expired = Date.parse(expiresAt) <= now;
  return <div className={cn('mt-2 rounded-xl border p-3 text-xs', expired ? 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200' : nearExpiry ? 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100' : 'border-ink-200 bg-ink-50 text-ink-700')}>
    <p className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 shrink-0" />{expiryCountdown(expiresAt, now)}</p>
    <p className="mt-1">{expired ? 'Expired' : 'Expires'} {formatDateTime(expiresAt)}</p>
    {expired && <p className="mt-1 font-semibold">Renew this document and update its expiry date.</p>}
  </div>;
}
