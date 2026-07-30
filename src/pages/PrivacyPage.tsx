import { BackButton } from '@/components/BackButton';

export function PrivacyPage() {
  return (
    <div className="container-content py-12 max-w-3xl">
      <BackButton to="/" />
      <h1 className="font-display text-3xl font-bold text-ink-900">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm text-ink-700">
        <p>GariLink respects your privacy. This policy explains what we collect and how we use it.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Information we collect</h2>
        <p>Your name, phone number, location, profile details and verification documents. Vehicle photos and insurance information are visible to other users as part of listings.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">How we use it</h2>
        <p>To verify identity, show listings, enable chat and improve the platform. We do not sell your data.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Document visibility</h2>
        <p>Verification documents are private to you and our admin team. Only document expiry dates and verification status are shown publicly.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Your rights</h2>
        <p>You can request deletion of your account and data at any time from Settings.</p>
      </div>
    </div>
  );
}
