import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, Loader2, X } from 'lucide-react';

interface Props {
  file: File;
  onCancel: () => void;
  onUploadOriginal: () => void;
  onComplete: (file: File) => void;
}

interface Region { x: number; y: number; width: number; height: number }

export function PlatePrivacyEditor({ file, onCancel, onUploadOriginal, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [region, setRegion] = useState<Region>({ x: 55, y: 68, width: 30, height: 14 });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setError('This photo preview could not be opened. Choose another photo or upload a screenshot.');
    nextImage.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onCancel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(image, 0, 0);
    const x = canvas.width * region.x / 100;
    const y = canvas.height * region.y / 100;
    const width = canvas.width * region.width / 100;
    const height = canvas.height * region.height / 100;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.filter = `blur(${Math.max(14, canvas.width / 80)}px)`;
    context.drawImage(image, 0, 0);
    context.restore();
    context.strokeStyle = '#ef4444';
    context.lineWidth = Math.max(3, canvas.width / 250);
    context.setLineDash([context.lineWidth * 2, context.lineWidth]);
    context.strokeRect(x, y, width, height);
  }, [image, region]);

  const applyBlur = async () => {
    if (!image) return;
    setProcessing(true);
    setError('');
    const output = document.createElement('canvas');
    output.width = image.naturalWidth;
    output.height = image.naturalHeight;
    const context = output.getContext('2d');
    if (!context) { setError('Your browser could not prepare the blurred image.'); setProcessing(false); return; }
    context.drawImage(image, 0, 0);
    const x = output.width * region.x / 100;
    const y = output.height * region.y / 100;
    const width = output.width * region.width / 100;
    const height = output.height * region.height / 100;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.filter = `blur(${Math.max(14, output.width / 80)}px)`;
    context.drawImage(image, 0, 0);
    context.restore();

    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, mimeType, 0.92));
    if (!blob) { setError('Your browser could not create the blurred image. Try uploading a screenshot instead.'); setProcessing(false); return; }
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    onComplete(new File([blob], `${baseName}-plate-hidden.${extension}`, { type: mimeType }));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Hide number plate">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-[#141416] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5 sm:py-4">
          <div><h2 className="font-display text-xl font-bold text-ink-900">Hide the number plate</h2><p className="mt-1 text-sm text-ink-500">Move and resize the red box over the plate. This preview shows the blur that will be uploaded.</p></div>
          <button type="button" onClick={onCancel} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
          <div className="mt-4 overflow-hidden rounded-xl bg-ink-100"><canvas ref={canvasRef} className="max-h-[38dvh] w-full object-contain sm:max-h-[52dvh]" /></div>
          {!image && !error && <p className="mt-3 text-center text-sm text-ink-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Preparing a phone-safe preview…</p>}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Range label="Move left / right" value={region.x} max={100 - region.width} onChange={(x) => setRegion({ ...region, x })} />
            <Range label="Move up / down" value={region.y} max={100 - region.height} onChange={(y) => setRegion({ ...region, y })} />
            <Range label="Box width" value={region.width} min={10} max={Math.max(10, 100 - region.x)} onChange={(width) => setRegion({ ...region, width })} />
            <Range label="Box height" value={region.height} min={6} max={Math.max(6, 100 - region.y)} onChange={(height) => setRegion({ ...region, height })} />
          </div>
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Confirm that every visible character is blurred. The red outline is a guide and will not appear in the uploaded photo.</p>
          <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={onUploadOriginal} className="btn-secondary w-full sm:w-auto">No plate visible—upload original</button>
            <button type="button" onClick={applyBlur} disabled={!image || processing} className="btn-primary w-full sm:w-auto">
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />} Blur selected area & upload
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Range({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-xs font-medium text-ink-600">{label}<input type="range" min={min} max={max} value={Math.min(value, max)} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-brand-600" /></label>;
}
