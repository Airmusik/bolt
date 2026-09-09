// Development-only isolated UI check. No live accounts, payments or reports are changed.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PromotionRequestCard } from '../../src/components/PromotionRequestCard';
import { ReportRemovalAction } from '../../src/components/ReportRemovalAction';
import { Modal } from '../../src/components/Modal';
import type { PromotionRequest } from '../../src/lib/promotions';
import { applySiteTheme } from '../../src/lib/siteTheme';
import '../../src/index.css';
import '../../src/styles/site-palette.css';

const sample: PromotionRequest = { id:'preview', user_id:'sample',kind:'listing',vehicle_id:'sample-car',status:'awaiting_payment',amount:500,duration_days:7,payment_method:'Example payment method',payment_instructions:'TEST ONLY — do not send money.\nFollow the payment method and account provided by admin.',terms:'Example terms: placement starts after admin confirms payment. Connections are not guaranteed.',payment_reference:null,admin_note:null,starts_at:null,expires_at:null,created_at:'2026-09-09T12:00:00Z',vehicle:{make:'Toyota',model:'Axio'} };
applySiteTheme('cyan');
function Fixture() {
  const [request,setRequest]=useState(sample);
  const [modal,setModal]=useState(false);
  const [removed,setRemoved]=useState(false);
  return <BrowserRouter><main className="container-content max-w-3xl space-y-5 py-6"><p className="text-sm text-ink-500">Local test data only. No live payments or reports.</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>document.documentElement.classList.toggle('dark')}>Toggle theme</button><button className="btn-secondary" onClick={()=>setModal(true)}>Open report test</button><button className="btn-secondary" onClick={()=>setRequest(sample)}>Reset payment example</button></div><h1 className="text-2xl font-bold">Your current promotions</h1><PromotionRequestCard request={request} onAction={async(_,reference)=>setRequest({...request,status:reference===null?'cancelled':'pending',payment_reference:reference})}/>{removed&&<p role="status">Test report removed; rating restored from 4.9 to 5.0.</p>}{modal&&<Modal title="Report: missed appointment" onClose={()=>setModal(false)} size="xl"><ReportRemovalAction onRemove={async()=>{setRemoved(true);setModal(false);return true;}}/></Modal>}</main></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
