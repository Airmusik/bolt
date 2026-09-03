export function ConnectionProgress({ accepted = false }: { accepted?: boolean }) {
  return <div className="space-y-1.5">
    <ol aria-label="Connection progress" className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
      <li className="text-emerald-700 dark:text-emerald-300">1. Request sent</li>
      <li className={accepted ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-500'}>2. {accepted ? 'Accepted' : 'Awaiting acceptance'}</li>
      <li className={accepted ? 'text-sky-700 dark:text-sky-300' : 'text-ink-500'}>3. Chat</li>
    </ol>
    <p className="text-xs leading-5 text-ink-500">{accepted ? 'Connection accepted. Open Chat to discuss the next steps.' : 'Chat opens after acceptance. No further action is needed while waiting.'}</p>
  </div>;
}
