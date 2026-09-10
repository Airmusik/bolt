import { ArrowRight } from 'lucide-react';

export function PromotionDraftActions({ busy, existing, onContinue, onCancel }: {
  busy: boolean;
  existing: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return <div className="mt-4">
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" disabled={busy} onClick={onContinue} className="btn-primary w-full sm:w-auto">
        {busy ? 'Preparing instructions…' : existing ? 'View my existing promotion' : 'Continue to payment instructions'}<ArrowRight className="h-4 w-4" />
      </button>
      <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary w-full sm:w-auto">{existing ? 'Back to dashboard' : 'Cancel'}</button>
    </div>
    <p className="mt-2 text-xs leading-5 text-ink-500">{existing ? 'No duplicate request or extra payment is needed. Going back does not cancel your existing promotion.' : 'Continue does not charge you. Cancel leaves this step without creating or submitting a promotion.'}</p>
  </div>;
}
