/**
 * Files staff attach to a workbench message (a photo of a VIN plate or tire
 * sidewall, a supplier PDF, a parts list). The browser shrinks photos before
 * sending; the server re-checks everything here before the model sees it.
 */
import type Anthropic from "@anthropic-ai/sdk";

export interface WorkbenchAttachment {
  name: string;
  mediaType: string;
  /** Base64 for images and PDFs, plain text for text files. */
  data: string;
}

export const MAX_ATTACHMENTS = 4;
/** Per file, after the browser has shrunk photos. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** All files of one message together (base64 text length is about 4/3 of the bytes). */
export const MAX_TOTAL_CHARS = 14 * 1024 * 1024;
export const MAX_TEXT_FILE_CHARS = 60_000;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown", "application/json"];

export const ACCEPTED_TYPES = [...IMAGE_TYPES, "application/pdf", ...TEXT_TYPES];

export function attachmentKind(mediaType: string): "image" | "pdf" | "text" | null {
  if (IMAGE_TYPES.includes(mediaType)) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (TEXT_TYPES.includes(mediaType)) return "text";
  return null;
}

/** The attachments of a request body, or null if anything is off. */
export function parseAttachments(raw: unknown): WorkbenchAttachment[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return null;
  const files: WorkbenchAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    const f = item as Record<string, unknown>;
    if (typeof f?.name !== "string" || typeof f.mediaType !== "string" || typeof f.data !== "string") return null;
    const kind = attachmentKind(f.mediaType);
    if (!kind) return null;
    const limit = kind === "text" ? MAX_TEXT_FILE_CHARS : Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3);
    if (f.data.length === 0 || f.data.length > limit) return null;
    if (kind !== "text" && !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data)) return null;
    total += f.data.length;
    if (total > MAX_TOTAL_CHARS) return null;
    files.push({ name: f.name.replace(/[\r\n"]/g, " ").slice(0, 120), mediaType: f.mediaType, data: f.data });
  }
  return files;
}

/** The model-facing content blocks for the attachments, placed before the staff message. */
export function attachmentBlocks(files: WorkbenchAttachment[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of files) {
    const kind = attachmentKind(file.mediaType);
    blocks.push({ type: "text", text: `Attached file: ${file.name}` });
    if (kind === "image") {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: file.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: file.data },
      });
    } else if (kind === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } });
    } else if (kind === "text") {
      blocks.push({ type: "text", text: file.data });
    }
  }
  return blocks;
}
