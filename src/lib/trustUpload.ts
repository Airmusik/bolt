const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

type DrawableImage = CanvasImageSource & { width: number; height: number };
type ImageDimensions = { width: number; height: number };

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function friendlyBaseName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'platform-proof';
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // PNG stores width and height in the fixed IHDR header.
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    // JPEG dimensions live in one of the Start Of Frame segments.
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

    // WebP extended and lossless headers expose their dimensions without a decode.
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

    // HEIC/HEIF files commonly include an Image Spatial Extents (ispe) box.
    for (let offset = 4; offset + 16 <= bytes.length; offset += 1) {
      if (bytes[offset] === 0x69 && bytes[offset + 1] === 0x73 && bytes[offset + 2] === 0x70 && bytes[offset + 3] === 0x65) {
        const width = view.getUint32(offset + 8);
        const height = view.getUint32(offset + 12);
        if (width > 0 && height > 0) return { width, height };
      }
    }
  } catch {
    // Dimension probing is an optimization; normal browser decoding remains the fallback.
  }
  return null;
}

async function decodeImage(file: File): Promise<{ image: DrawableImage; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const dimensions = await readImageDimensions(file);
    const longestEdge = dimensions ? Math.max(dimensions.width, dimensions.height) : 0;
    const scale = longestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longestEdge : 1;
    const resizeOptions = dimensions && scale < 1 ? {
      resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
      resizeHeight: Math.max(1, Math.round(dimensions.height * scale)),
      resizeQuality: 'high' as ResizeQuality,
    } : {};
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', ...resizeOptions });
      return { image: bitmap, cleanup: () => bitmap.close() };
    } catch {
      try {
        // Older mobile browsers may support resizing but not imageOrientation.
        const bitmap = await createImageBitmap(file, resizeOptions);
        return { image: bitmap, cleanup: () => bitmap.close() };
      } catch {
        // Some phones can display a camera photo even when createImageBitmap cannot decode it.
      }
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
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) {
      throw new Error('This phone photo has invalid dimensions. Choose another photo or upload a screenshot.');
    }
    const longestEdge = Math.max(image.width, image.height);
    const scale = Math.min(1, MAX_IMAGE_EDGE / longestEdge);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    // Give React a frame to paint its "Preparing preview" state before the
    // browser performs the canvas work on memory-constrained phones.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Your browser could not prepare this photo. Try uploading a screenshot instead.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, 0.82);
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

export async function prepareChatImageUpload(file: File) {
  const extension = extensionOf(file.name);
  const isImage = file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(extension);
  if (!isImage) throw new Error('Choose a phone photo, JPG, PNG, WebP, HEIC, or HEIF image.');
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
