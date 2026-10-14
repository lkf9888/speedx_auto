/**
 * Browser side of attachments: turn a picked, dropped or pasted file into what
 * the server accepts. Photos are shrunk (phone photos are several MB; the
 * model reads a 1600 px picture just as well), PDFs and text files go as they are.
 */
import { attachmentKind, MAX_ATTACHMENT_BYTES, MAX_TEXT_FILE_CHARS, type WorkbenchAttachment } from "./attachments";

export interface PreparedAttachment extends WorkbenchAttachment {
  /** Small data URL for showing the photo in the chat; never sent or stored. */
  preview?: string;
}

const MAX_SIDE = 1600;
const THUMB_SIDE = 160;

const EXTENSION_TYPES: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function mediaTypeOf(file: File): string {
  if (file.type && attachmentKind(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? file.type;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function readAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** Draw the picture at most `side` pixels wide or tall as a JPEG, or null where the browser can't. */
async function shrink(file: File, side: number, quality: number): Promise<string | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    // PNG screenshots with transparency would turn black as JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export async function prepareAttachment(file: File): Promise<PreparedAttachment | { error: string }> {
  const mediaType = mediaTypeOf(file);
  const kind = attachmentKind(mediaType);
  const name = file.name || (kind === "image" ? "photo.jpg" : "file");
  if (!kind) return { error: `${name}：不支持这种文件，请选图片、PDF 或文本文件（iPhone 的 HEIC 请改选“最兼容”或直接截图）` };

  if (kind === "text") {
    const text = (await readAsText(file)).slice(0, MAX_TEXT_FILE_CHARS);
    return text.trim() ? { name, mediaType, data: text } : { error: `${name}：文件是空的` };
  }

  if (kind === "pdf") {
    if (file.size > MAX_ATTACHMENT_BYTES * 0.9) return { error: `${name}：PDF 太大了（不超过 4.5MB）` };
    return { name, mediaType, data: base64Of(await readAsDataUrl(file)) };
  }

  const shrunk = await shrink(file, MAX_SIDE, 0.85);
  if (shrunk) {
    const thumb = (await shrink(file, THUMB_SIDE, 0.7)) ?? undefined;
    return { name, mediaType: "image/jpeg", data: base64Of(shrunk), preview: thumb };
  }
  // A browser that can't redraw the picture: send it as it is when it fits.
  if (file.size > MAX_ATTACHMENT_BYTES * 0.9) return { error: `${name}：图片太大了，请换一张或截图` };
  const raw = await readAsDataUrl(file);
  return { name, mediaType, data: base64Of(raw), preview: raw.length < 200_000 ? raw : undefined };
}
