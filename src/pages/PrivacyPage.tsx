import { BackButton } from '@/components/BackButton';
import { AnalyticsPreference } from '@/components/SiteAnalyticsTracker';
import { useSiteSettings } from '@/lib/siteSettings';
import { legalText } from '@/lib/legal';
import { useLegalDocument } from '@/lib/legalDocuments';

export function PrivacyPage() {
  const { settings } = useSiteSettings();
  const { document, loading } = useLegalDocument('privacy');
  return (
    <div className="container-content py-12 max-w-3xl">
      <BackButton to="/" />
      <h1 className="font-display text-3xl font-bold text-ink-900">{document?.title || 'Privacy Policy'}</h1>
      <div className="mt-6 space-y-4 text-sm text-ink-700">
        {loading && !document ? <div className="h-52 animate-pulse rounded-2xl bg-ink-50" /> : document && <>
          <p className="text-xs text-ink-500">Version {document.version} · Effective {document.effectiveDate}</p>
          <p>{legalText(document.summary, settings)}</p>
          {document.sections.map((section,index) => <section key={`${section.title}-${index}`}><h2 className="font-display text-lg font-bold text-ink-900">{section.title}</h2>{section.paragraphs.map((paragraph,paragraphIndex) => <p key={paragraphIndex} className="mt-2">{legalText(paragraph, settings)}</p>)}</section>)}
          <AnalyticsPreference />
          <section><h2 className="font-display text-lg font-bold text-ink-900">Community lounge privacy</h2><p className="mt-2">If you choose to post in the community lounge, other signed-in members see a randomly assigned alias, your driver or car-owner role, your messages and their dates. Your account name, photo and profile link are not shown there automatically. Community posts and moderation records are saved; authorised administrators can associate posts with an account for safety and moderation. This is not anonymity from the platform. Automated filtering removes recognised phone numbers and contact links before messages are published, but cannot detect every attempt to share personal information. Do not share identifying details, and report anything the filter misses.</p></section>
          <section><h2 className="font-display text-lg font-bold text-ink-900">Essential error diagnostics</h2><p className="mt-2">To investigate technical failures, the site records a general page category, error category, browser family, application release and grouped counts. Administrators can view the last 30 days; older aggregates are removed when new reports are processed. These reports do not include your message contents, form inputs, password, account ID or full page URL. Only administrators can view the reports. Hosting providers may separately maintain their own request logs.</p></section>
        </>}
        <p>Privacy requests: <a href={`mailto:${settings.admin_contact_email}`} className="break-all underline">{settings.admin_contact_email}</a> · <a href={`tel:${settings.admin_contact_phone}`} className="underline">{settings.admin_contact_phone}</a>.</p>
      </div>
    </div>
  );
}
