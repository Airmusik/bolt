import { CONTACT_ATTACHMENTS_BUCKET, supabase } from './supabase';
import { isTrustImageFile, prepareChatImageUpload } from './trustUpload';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'txt', 'doc', 'docx'];

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function safeFileName(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 100) || 'attachment';
}

function attachmentContentType(file: File) {
  if (file.type) return file.type;
  switch (extensionOf(file.name)) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default: return 'application/octet-stream';
  }
}

export async function uploadContactAttachment(threadId: string, userId: string, source: File) {
  if (source.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachments must be smaller than 8 MB.');
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(source.name)) && !isTrustImageFile(source)) {
    throw new Error('Choose an image, PDF, text file, or Word document.');
  }

  const file = isTrustImageFile(source) ? await prepareChatImageUpload(source) : source;
  const name = isTrustImageFile(source) ? `${safeFileName(source.name.replace(/\.[^.]+$/, ''))}.jpg` : safeFileName(source.name);
  const path = `${threadId}/${userId}/${Date.now()}-${crypto.randomUUID()}-${name}`;
  const contentType = attachmentContentType(file);
  const { error } = await supabase.storage.from(CONTACT_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return { path, name, type: contentType, size: file.size };
}

export async function openContactAttachment(path: string) {
  const { data, error } = await supabase.storage.from(CONTACT_ATTACHMENTS_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open this attachment.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
