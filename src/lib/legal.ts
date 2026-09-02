import terms from '../content/terms-2026-09-02.json';

export const TERMS_VERSION = terms.version;
export const TERMS_DOCUMENT = terms;
export function legalText(text: string, values: { site_name: string; admin_contact_email: string; admin_contact_phone: string }) {
  return text.split('{{site_name}}').join(values.site_name).split('{{support_email}}').join(values.admin_contact_email).split('{{support_phone}}').join(values.admin_contact_phone);
}
