import { BackButton } from '@/components/BackButton';
import { AnalyticsPreference } from '@/components/SiteAnalyticsTracker';
import { useSiteSettings } from '@/lib/siteSettings';

export function PrivacyPage() {
  const { settings } = useSiteSettings();
  return (
    <div className="container-content py-12 max-w-3xl">
      <BackButton to="/" />
      <h1 className="font-display text-3xl font-bold text-ink-900">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm text-ink-700">
        <p>{settings.site_name} respects your privacy. This policy explains what we collect and how we use it.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Information we collect</h2>
        <p>Your name, registered email, phone number, town or neighbourhood, profile details, platform-history submissions, messages and attachments. We also record the terms version and server time of acceptance at registration. We do not request identity cards, driving licences or logbooks for KYC. Profile photos appear immediately; listing and platform-history approval are separate moderation steps, not guarantees of authenticity.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">How we use it</h2>
        <p>To operate driver trust profiles, show listings, enable chat, moderate platform-history uploads and improve the platform. We do not sell your data.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Evidence visibility</h2>
        <p>Evidence files are private to you and our admin team. Public profiles show only approved counts and safe trust signals.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Chat history and support access</h2>
        <p>Conversation history, including privately shared chat images, remains stored after a connection ends to support safety reviews and dispute resolution. Ended chats become read-only for the two members. Chat images are available only to conversation participants and authorised administrators who join for support or moderation.</p>
        <h2 className="font-display text-lg font-bold text-ink-900">Your rights</h2>
        <p>Optional site analytics measure page categories, browser-tab sessions, approximate country and recent signed-in activity. Country is inferred by our hosting provider from the network connection; it is not nationality or precise location. Signed-in measurements reference your account; guest sessions use a random identifier. Our analytics database does not store raw IP addresses, search terms, or message contents. Reports cover up to 90 days; older visit records are removed as new activity arrives. Admin visits are excluded. You can decline optional measurements or change your choice below. Operational account and listing totals are reported separately.</p>
        <AnalyticsPreference />
        <p>You can request deletion from Settings, and contact us to request access, correction, or exercise other applicable data-protection rights. Records should be kept only as long as needed for their stated purposes or lawful obligations, including a relevant dispute. Ending a connection does not itself delete its messages. Accepting the terms is not blanket consent to marketing or a waiver of privacy rights.</p>
        <p>Privacy requests: <a href={`mailto:${settings.admin_contact_email}`} className="break-all underline">{settings.admin_contact_email}</a> · <a href={`tel:${settings.admin_contact_phone}`} className="underline">{settings.admin_contact_phone}</a>.</p>
      </div>
    </div>
  );
}
