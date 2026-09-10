// Local preview only. No authentication, network submission or production data.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '../../src/components/AppErrorBoundary';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
function Broken({ broken }: { broken: boolean }) { if(broken) throw new Error('Synthetic local render error'); return <p className="p-5">The preview is working.</p>; }
function Preview() {
  const [broken,setBroken]=useState(false);
  return <><div className="flex gap-3 p-4"><button className="btn-secondary" onClick={()=>setBroken(true)}>Simulate page error</button><button className="btn-secondary" onClick={()=>document.documentElement.classList.toggle('dark')}>Theme</button></div><AppErrorBoundary><Broken broken={broken}/></AppErrorBoundary></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
