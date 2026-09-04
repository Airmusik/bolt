import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import pages from './seo-pages.json';

export function useSeo() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
    const page = pages[path as keyof typeof pages];
    const isPrivate = !page || (path === '/contact' && new URLSearchParams(search).has('message'));
    const title = page?.title ?? 'Your account | 11Drive';
    const description = page?.description ?? 'Manage your 11Drive account.';
    document.title = title;
    const meta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let node = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
      if (!node) { node = document.createElement('meta'); node.setAttribute(attr, name); document.head.appendChild(node); }
      node.content = content;
    };
    meta('description', description);
    meta('robots', isPrivate ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
    meta('og:title', title, true); meta('og:description', description, true);
    meta('twitter:title', title); meta('twitter:description', description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (isPrivate) { canonical?.remove(); document.head.querySelector('meta[property="og:url"]')?.remove(); }
    else {
      if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
      canonical.href = `https://www.11drive.com${path}`;
      meta('og:url', canonical.href, true);
    }
    document.getElementById('site-structured-data')?.remove();
    if (path === '/') {
      const node = document.createElement('script'); node.id = 'site-structured-data'; node.type = 'application/ld+json';
      node.textContent = JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'11Drive',url:'https://www.11drive.com/',description});
      document.head.appendChild(node);
    }
  }, [pathname, search]);
}
