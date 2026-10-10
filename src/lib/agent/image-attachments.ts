export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data?: string;
  byteSize?: number;
  storagePath?: string;
  url?: string;
}

export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_PAYLOAD_BYTES = 650_000;
const MAX_SOURCE_IMAGE_BYTES = 24_000_000;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this image file.'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const separator = dataUrl.indexOf(',');
      if (separator < 0) reject(new Error('Could not prepare this image for analysis.'));
      else resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('This browser could not process the selected image.'));
    }, 'image/webp', quality);
  });
}

async function compressImage(file: File, budget: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be opened as an image.`);
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');

    const dimensions = [2400, 2000, 1800, 1600, 1400, 1200, 1000, 800];
    const qualities = [0.9, 0.84, 0.78, 0.7, 0.62];
    for (const limit of dimensions) {
      const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await encodeWebp(canvas, quality);
        if (blob.size <= budget) return blob;
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error(`${file.name} is too detailed to fit in the image request. Try a smaller crop.`);
}

export async function prepareImageAttachments(files: File[], existingBytes = 0, existingCount = 0): Promise<ImageAttachment[]> {
  if (existingCount + files.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_IMAGE_ATTACHMENTS} images per message.`);
  }
  const remainingBytes = MAX_IMAGE_PAYLOAD_BYTES - existingBytes;
  if (remainingBytes <= 0) throw new Error('The image upload limit for this message has been reached.');

  const prepared: ImageAttachment[] = [];
  let usedBytes = existingBytes;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const mimeType = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      throw new Error('Use a JPG, PNG, or WebP image.');
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error(`${file.name} is larger than the 24 MB upload limit.`);
    }

    const filesLeft = files.length - index;
    const budget = Math.floor((MAX_IMAGE_PAYLOAD_BYTES - usedBytes) / filesLeft);
    const blob = file.size <= budget ? file : await compressImage(file, budget);
    const encoded = await readAsBase64(blob);
    const attachment: ImageAttachment = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${index}`,
      name: file.name.slice(0, 180),
      mimeType: blob.type as ImageAttachment['mimeType'],
      data: encoded,
      byteSize: blob.size,
    };
    prepared.push(attachment);
    usedBytes += blob.size;
  }

  return prepared;
}

export function isImageAttachment(value: unknown): value is ImageAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as Partial<ImageAttachment>;
  
  if (!attachment.url && (typeof attachment.id !== 'string' || typeof attachment.name !== 'string')) return false;
  
  if (attachment.mimeType !== 'image/jpeg' && attachment.mimeType !== 'image/png' && attachment.mimeType !== 'image/webp') return false;
  
  // Either has data (local) or url (cloud)
  if (attachment.data) {
    if (typeof attachment.data !== 'string' || attachment.data.length > Math.ceil(MAX_IMAGE_PAYLOAD_BYTES * 4 / 3) + 8) return false;
    if (typeof attachment.byteSize !== 'number' || attachment.byteSize <= 0 || attachment.byteSize > MAX_IMAGE_PAYLOAD_BYTES) return false;
    return true;
  }
  
  if (attachment.url) {
    return typeof attachment.url === 'string';
  }
  
  return false;
}

export function imageAttachmentDataUrl(attachment: ImageAttachment): string {
  if (attachment.url) return attachment.url;
  return `data:${attachment.mimeType};base64,${attachment.data}`;
}
