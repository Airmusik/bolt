import { BackButton } from '@/components/BackButton';

export function TermsPage() {
  return (
    <div className="container-content py-12 prose max-w-3xl">
      <BackButton to="/" />
      <h1 className="font-display text-3xl font-bold text-ink-900">Terms of Service</h1>
      <div className="mt-6 space-y-4 text-sm text-ink-700">
        <p>By using GariLink, you agree to these terms. GariLink is a connection platform only and does not process payments between users.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">1. Accounts</h2>
        <p>You must provide accurate information and must not submit misleading trust evidence or references. You are responsible for keeping your password secure.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">2. Listings & applications</h2>
        <p>Owners must disclose known vehicle issues and accurate insurance information. Members must have permission to share any uploaded evidence or referee contact details.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">3. Conduct</h2>
        <p>Harassment, fraud and fake listings are prohibited. We may suspend or ban accounts that violate these terms.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">4. Payments</h2>
        <p>GariLink does not handle payments. Any financial arrangements are between the owner and driver directly.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">5. Liability</h2>
        <p>GariLink is not liable for disputes, damages or losses arising from arrangements made through the platform.</p>
      </div>
    </div>
  );
}
