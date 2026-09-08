import type { ConnectionStatus } from '@/lib/types';

export function ConnectionProgress({ accepted = false, status }: { accepted?: boolean; status?: ConnectionStatus }) {
  const current = status || (accepted ? 'accepted' : 'pending');
  const active = current === 'accepted';
  const finished = ['ended', 'rejected', 'withdrawn', 'expired'].includes(current);
  return <div className="space-y-1.5">
    <ol aria-label="Connection progress" className="grid grid-cols-3 gap-1 text-center text-[11px] font-semibold">
      <li className="text-emerald-700 dark:text-emerald-300">1. Request sent</li>
      <li className={active ? 'text-emerald-700 dark:text-emerald-300' : finished ? 'text-ink-400' : 'text-amber-700 dark:text-amber-300'}>2. {active ? 'Accepted' : finished ? current : 'Awaiting reply'}</li>
      <li className={active ? 'text-sky-700 dark:text-sky-300' : 'text-ink-400'}>3. {active ? 'Chat open' : finished ? 'Closed' : 'Chat unlocks'}</li>
    </ol>
    <div className="grid grid-cols-3 gap-1" aria-hidden="true"><span className="h-1 rounded bg-emerald-500"/><span className={`h-1 rounded ${active?'bg-emerald-500':finished?'bg-ink-300':'bg-amber-400'}`}/><span className={`h-1 rounded ${active?'bg-sky-500':'bg-ink-200'}`}/></div>
    <p className="text-xs leading-5 text-ink-500">{active ? 'Connection accepted. Open Chat to discuss the next steps.' : finished ? `This request is ${current}.` : 'Chat opens after acceptance. You can cancel while waiting.'}</p>
  </div>;
}
