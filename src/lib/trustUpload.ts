const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1280;
const MAX_HTML_IMAGE_PIXELS = 12_000_000;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

type ImageDimensions = { width: number; height: number };
type PreparedDrawable = { image: CanvasImageSource; width: number; height: number; cleanup: () => void };

interface DecodedVideoFrame {
  displayWidth: number;
  displayHeight: number;
  codedWidth: number;
  codedHeight: number;
  close: () => void;
}

interface BrowserImageDecoder {
  tracks: { ready: Promise<void> };
  decode: (options?: { frameIndex?: number; completeFramesOnly?: boolean }) => Promise<{ image: DecodedVideoFrame }>;
  close: () => void;
}

type BrowserImageDecoderConstructor = new (options: {
  data: BufferSource | ReadableStream<Uint8Array>;
  type: string;
  desiredWidth?: number;
  desiredHeight?: number;
  preferAnimation?: boolean;
}) => BrowserImageDecoder;

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function imageMimeType(file: File) {
  if (file.type.startsWith('image/')) return file.type;
  switch (extensionOf(file.name)) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    default: return '';
  }
}

export function isTrustImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(extensionOf(file.name));
}

function friendlyBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'phone-photo';
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      let offset = 2;
      while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9) continue;
        if (offset + 2 > bytes.length) break;
        const segmentLength = view.getUint16(offset);
        if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
        if (startOfFrame.has(marker) && segmentLength >= 7) {
          return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
        }
        offset += segmentLength;
      }
    }

    const riff = bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF';
    const webp = bytes.length >= 30 && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (riff && webp) {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === 'VP8X') return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
      if (chunk === 'VP8L' && bytes.length >= 25) {
        const b1 = bytes[21]; const b2 = bytes[22]; const b3 = bytes[23]; const b4 = bytes[24];
        return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) };
      }
    }

    for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
      if (bytes[offset] === 0x69 && bytes[offset + 1] === 0x73 && bytes[offset + 2] === 0x70 && bytes[offset + 3] === 0x65) {
        const width = view.getUint32(offset + 8);
        const height = view.getUint32(offset + 12);
        if (width > 0 && height > 0) return { width, height };
      }
    }
  } catch {
    // Header probing is an optimization. The browser decoder remains authoritative.
  }
  return null;
}

function scaledDimensions(dimensions: ImageDimensions) {
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge);
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

async function decodeWithImageDecoder(file: File, dimensions: ImageDimensions): Promise<PreparedDrawable | null> {
  const ImageDecoder = (globalThis as typeof globalThis & { ImageDecoder?: BrowserImageDecoderConstructor }).ImageDecoder;
  const mimeType = imageMimeType(file);
  if (!ImageDecoder || !mimeType) return null;
  const scaled = scaledDimensions(dimensions);
  let decoder: BrowserImageDecoder | null = null;
  try {
    decoder = new ImageDecoder({
      data: file.stream(),
      type: mimeType,
      desiredWidth: scaled.width,
      desiredHeight: scaled.height,
      preferAnimation: false,
    });
    await decoder.tracks.ready;
    const { image: frame } = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    const width = frame.displayWidth || frame.codedWidth;
    const height = frame.displayHeight || frame.codedHeight;
    const activeDecoder = decoder;
    return {
      image: frame as unknown as CanvasImageSource,
      width,
      height,
      cleanup: () => { frame.close(); activeDecoder.close(); },
    };
  } catch {
    decoder?.close();
    return null;
  }
}

async function decodeWithImageBitmap(file: File, dimensions: ImageDimensions | null): Promise<PreparedDrawable | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const scaled = dimensions ? scaledDimensions(dimensions) : null;
  const resizeOptions = scaled && dimensions && (scaled.width !== dimensions.width || scaled.height !== dimensions.height) ? {
    resizeWidth: scaled.width,
    resizeHeight: scaled.height,
    resizeQuality: 'medium' as ResizeQuality,
  } : {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', ...resizeOptions });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  } catch {
    try {
      const bitmap = await createImageBitmap(file, resizeOptions);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      return null;
    }
  }
}

async function decodeWithHtmlImage(file: File, dimensions: ImageDimensions | null): Promise<PreparedDrawable> {
  if (dimensions && dimensions.width * dimensions.height > MAX_HTML_IMAGE_PIXELS) {
    throw new Error('This photo is too large for this phone to preview safely. Take a screenshot of it, then upload the screenshot.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('This phone cannot read that image format. Take a screenshot and upload the screenshot instead.'));
      element.src = objectUrl;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function decodeImage(file: File): Promise<PreparedDrawable> {
  const dimensions = await readImageDimensions(file);
  if (dimensions) {
    const decoded = await decodeWithImageDecoder(file, dimensions);
    if (decoded) return decoded;
  }
  const bitmap = await decodeWithImageBitmap(file, dimensions);
  if (bitmap) return bitmap;
  return decodeWithHtmlImage(file, dimensions);
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
    throw new Error('This photo is larger than 24 MB. Choose a smaller photo or upload a screenshot.');
  }

  const { image, width: sourceWidth, height: sourceHeight, cleanup } = await decodeImage(file);
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) {
      throw new Error('This phone photo has invalid dimensions. Choose another photo or upload a screenshot.');
    }
    const output = scaledDimensions({ width: sourceWidth, height: sourceHeight });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not prepare this photo. Try uploading a screenshot instead.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0, output.width, output.height);

    let blob = await canvasToBlob(canvas, 0.8);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasToBlob(canvas, 0.65);
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('The prepared photo is still larger than 8 MB. Upload a screenshot instead.');

    return new File([blob], `${friendlyBaseName(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    cleanup();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export async function prepareTrustUpload(file: File) {
  const extension = extensionOf(file.name);
  const isPdf = file.type === 'application/pdf' || extension === 'pdf';
  if (isPdf) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('The PDF must be smaller than 8 MB.');
    return file;
  }
  if (!isTrustImageFile(file)) throw new Error('Choose a phone photo, JPG, PNG, WebP, HEIC, HEIF, or PDF file.');
  return prepareImage(file);
}

export async function prepareChatImageUpload(file: File) {
  if (!isTrustImageFile(file)) throw new Error('Choose a phone photo, JPG, PNG, WebP, HEIC, or HEIF image.');
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
