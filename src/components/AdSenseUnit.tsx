import { useEffect, useRef } from 'react';

const requestedUnits = new WeakSet<HTMLElement>();

/** Manual display units only. No Auto ads, timed refresh, or action interstitials. */
export function AdSenseUnit({ publisher, slot, className = '' }: { publisher: string; slot: string; className?: string }) {
  const unit = useRef<HTMLModElement>(null);
  useEffect(() => {
    const element = unit.current;
    if (!element || !/^ca-pub-\d{16}$/.test(publisher) || !/^\d{10}$/.test(slot)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || element.getBoundingClientRect().width <= 0 || requestedUnits.has(element)) return;
      const existing = document.getElementById('11drive-adsense-script') as HTMLScriptElement | null;
      if (existing && existing.dataset.publisher !== publisher) return; // Reload to switch publishers safely.
      if (!existing) {
        const script = document.createElement('script');
        script.id = '11drive-adsense-script';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.publisher = publisher;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisher}`;
        document.head.appendChild(script);
      }
      requestedUnits.add(element);
      try {
        const adsWindow = window as Window & { adsbygoogle?: object[] };
        (adsWindow.adsbygoogle = adsWindow.adsbygoogle || []).push({});
      } catch { /* Ad blockers or no fill must never interrupt the website. */ }
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [publisher, slot]);
  return <aside aria-label="Advertisement" className={`my-8 clear-both border-y border-ink-100 px-4 py-6 ${className}`}>
    <p className="mb-4 text-[10px] uppercase tracking-wide text-ink-500">Advertisement</p>
    <ins ref={unit} className="adsbygoogle" style={{ display: 'block', minHeight: 100 }} data-ad-client={publisher} data-ad-slot={slot} data-ad-format="horizontal" data-full-width-responsive="true" />
  </aside>;
}
