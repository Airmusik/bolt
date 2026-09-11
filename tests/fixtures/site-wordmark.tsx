import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteWordmark } from '../../src/components/SiteWordmark';
import { LaunchIntro } from '../../src/components/LaunchIntro';
import '../../src/index.css';
import '../../src/styles/site-palette.css';

export function Fixture() {
  const [name, setName] = useState('AutoLink');
  const [dark, setDark] = useState(false);
  const [intro, setIntro] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); return () => document.documentElement.classList.remove('dark'); }, [dark]);
  return <div className={dark ? 'dark' : ''}><main className="min-h-screen p-5 text-ink-900" style={{ '--action': '#06b6d4', backgroundColor: dark ? '#17191f' : '#ffffff' } as React.CSSProperties}>
    <label>Test site name<input className="input my-3" value={name} onChange={event => setName(event.target.value)} /></label>
    <div className="mb-5 flex gap-3"><button className="btn-secondary" onClick={() => setDark(!dark)}>Toggle test theme</button><button className="btn-secondary" onClick={() => setIntro(true)}>Test opening</button></div>
    <p>Header size</p><SiteWordmark name={name} className="h-auto w-[138px]" animation="float" />
    <div className="my-6 grid gap-4 sm:grid-cols-2">{['split', 'reverse', 'base', 'action'].map(colours => <section key={colours} className="card p-4"><p>{colours}</p><SiteWordmark name={name} colours={colours} className="h-auto w-full" /></section>)}</div>
    <p>Existing logo unchanged</p><SiteWordmark name="11Drive" className="h-auto w-[138px]" />
    {intro && <LaunchIntro siteName={name} nameColours="split" backgroundEnabled={false} backgroundType="image" backgroundUrl="" backgroundPosition="50% 50%" overlayOpacity={0.8} allowVideo={false} onComplete={() => setIntro(false)} />}
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
