import { readFile, writeFile, mkdir } from 'node:fs/promises';
const pages = JSON.parse(await readFile('src/lib/seo-pages.json', 'utf8'));
const base = 'https://www.11drive.com';
const logo = 'https://bqgfrulkjibxunaofumx.supabase.co/storage/v1/object/public/site-assets/branding/site-logo-1787787028057.jpg';
const source = await readFile('dist/index.html', 'utf8');
const escape = s => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await mkdir('dist/seo', {recursive:true});
function render(path, page) {
 const title = page?.title ?? 'Your account | 11Drive';
 const description = page?.description ?? 'Manage your 11Drive account.';
 const head = `<meta name="robots" content="${page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}">\n`
 + (page ? `<link rel="canonical" href="${base}${path}"><meta property="og:url" content="${base}${path}">` : '')
 + `<meta property="og:type" content="website"><meta property="og:site_name" content="11Drive"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:image" content="${logo}"><meta property="og:image:alt" content="11Drive logo"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${logo}">`
 + (path === '/' ? `<script id="site-structured-data" type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'11Drive',url:base+'/',description})}</script>` : '');
 return source.replace(/<title>[^<]*<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/,`<meta name="description" content="${escape(description)}">`).replace('</head>',head+'\n</head>');
}
for (const [path,page] of Object.entries(pages)) await writeFile(path==='/'?'dist/index.html':`dist/seo/${path.slice(1)}.html`,render(path,page));
await writeFile('dist/seo/private.html',render('',null));
await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(path=>`<url><loc>${base}${path}</loc></url>`).join('')}</urlset>`);
await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
console.log(`SEO metadata built for ${Object.keys(pages).length} public pages; private routes remain noindex.`);
