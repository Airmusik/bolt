import { BackButton } from '@/components/BackButton';

export function PrivacyPage() {
  return (
    <div className="container-content py-12 max-w-3xl">
      <BackButton to="/" />
      <h1 className="font-display text-3xl font-bold text-ink-900">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm text-ink-700">
        <p>GariLink respects your privacy. This policy explains what we collect and how we use it.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Information we collect</h2>
        <p>Your name, phone number, location, profile details, references and optional trust evidence. Profile photos appear immediately; vehicle photos remain private until an admin approves them.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">How we use it</h2>
        <p>To operate Trust Passports, show listings, enable chat, moderate uploads and improve the platform. We do not sell your data.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Evidence and reference visibility</h2>
        <p>Evidence files and referee contact details are private to you and our admin team. Public profiles show only approved counts and safe trust signals.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Your rights</h2>
        <p>You can request deletion of your account and data at any time from Settings.</p>
      </div>
    </div>
  );
}
