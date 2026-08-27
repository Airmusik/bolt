const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1800;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

type DrawableImage = CanvasImageSource & { width: number; height: number };

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function friendlyBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'platform-proof';
}

async function decodeImage(file: File): Promise<{ image: DrawableImage; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, cleanup: () => bitmap.close() };
    } catch {
      // Some mobile browsers can display a camera photo even when createImageBitmap cannot decode it.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This phone photo could not be read. Take a screenshot of it and upload the screenshot instead.'));
      element.src = objectUrl;
    });
    return { image, cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('This image could not be prepared. Take a screenshot and upload the screenshot instead.'));
    }, 'image/jpeg', quality);
  });
}

async function prepareImage(file: File) {
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('This photo is too large for a phone upload. Choose a photo smaller than 24 MB or upload a screenshot.');
  }

  const { image, cleanup } = await decodeImage(file);
  try {
    const longestEdge = Math.max(image.width, image.height);
    const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not prepare this photo. Try uploading a screenshot instead.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 0.84);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasToBlob(canvas, 0.7);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasToBlob(canvas, 0.58);
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('The prepared photo is still larger than 8 MB. Upload a screenshot instead.');

    return new File([blob], `${friendlyBaseName(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    cleanup();
  }
}

export async function prepareTrustUpload(file: File) {
  const extension = extensionOf(file.name);
  const isPdf = file.type === 'application/pdf' || extension === 'pdf';
  if (isPdf) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('The PDF must be smaller than 8 MB.');
    return file;
  }

  const isImage = file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(extension);
  if (!isImage) throw new Error('Choose a phone photo, JPG, PNG, WebP, HEIC, HEIF, or PDF file.');
  return prepareImage(file);
}

export function isPreviewableTrustImage(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}
