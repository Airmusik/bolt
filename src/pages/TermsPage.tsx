import { BackButton } from '@/components/BackButton';
import { TermsContent } from '@/components/TermsContent';

export function TermsPage() {
  return <div className="container-content max-w-3xl py-8 sm:py-12"><BackButton to="/" /><h1 className="mt-3 font-display text-3xl font-bold text-ink-900">Terms of Service</h1><div className="mt-6"><TermsContent /></div></div>;
}
