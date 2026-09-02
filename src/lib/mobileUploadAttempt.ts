const STORAGE_KEY = 'drivevell-mobile-upload-attempt';
const MAX_AGE_MS = 2 * 60 * 1000;

export type MobileUploadArea = 'driver-proof' | 'profile-photo' | 'vehicle-photo' | 'chat-image';

interface UploadAttempt {
  area: MobileUploadArea;
  fileName: string;
  fileSize: number;
  startedAt: number;
}

export function rememberMobileUploadPicker(area: MobileUploadArea) {
  try {
    const attempt: UploadAttempt = { area, fileName: 'the selected image', fileSize: 0, startedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Uploading must continue when storage is unavailable.
  }
}

export function rememberMobileUploadAttempt(area: MobileUploadArea, file: File) {
  try {
    const attempt: UploadAttempt = { area, fileName: file.name, fileSize: file.size, startedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // Uploading must continue when storage is unavailable.
  }
}

export function clearMobileUploadAttempt() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore unavailable storage */ }
}

export function consumeInterruptedMobileUpload(area: MobileUploadArea) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const attempt = JSON.parse(raw) as UploadAttempt;
    if (attempt.area !== area || Date.now() - attempt.startedAt > MAX_AGE_MS) return null;
    if (area === 'driver-proof' && attempt.fileSize === 0) {
      return 'Your phone reloaded while its gallery was open. The lightweight upload screen is ready—tap “Choose image or PDF” again.';
    }
    return `Your phone reloaded while preparing “${attempt.fileName}”. The image was not submitted. Please try a screenshot or a smaller photo.`;
  } catch {
    return null;
  }
}
