/**
 * Shared upload validation for every place Ashnight accepts a file.
 *
 * Checks the declared MIME type, the file extension, the size, that the file
 * isn't empty, and — for images and video — that the browser can actually
 * decode it. That last step is what catches renamed or corrupt files before
 * they land in storage and break a profile or a chat thread.
 */

export const IMAGE_MIME = [
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"];

export const VIDEO_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/ogg",
] as const;

export const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "3gp", "ogv"];

export const DOCUMENT_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "heic", "png", "jpg", "jpeg", "webp"];

export type MediaKind = "image" | "video" | "document";

export interface MediaRules {
  kind: MediaKind;
  /** Hard size ceiling in megabytes. */
  maxMB: number;
  /** Optional ceiling for video length, in seconds. */
  maxSeconds?: number;
  /** Smallest accepted image edge, in pixels. */
  minPixels?: number;
}

function extensionOf(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function label(kind: MediaKind) {
  return kind === "image" ? "image" : kind === "video" ? "video" : "file";
}

/** Reads the intrinsic size of an image file, or throws if it can't be decoded. */
function probeImage(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode-failed"));
    };
    img.src = url;
  });
}

/** Reads the duration of a video file, or throws if the browser can't read it. */
function probeVideo(file: File) {
  return new Promise<{ seconds: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      fn();
    };
    video.onloadedmetadata = () =>
      done(() => resolve({ seconds: Number.isFinite(video.duration) ? video.duration : 0 }));
    video.onerror = () => done(() => reject(new Error("decode-failed")));
    video.src = url;
  });
}

/**
 * Returns a human-readable problem with the file, or `null` when it's fine.
 * Safe to call on the server-rendered path — decode checks are skipped when
 * there's no DOM.
 */
export async function validateMediaFile(file: File, rules: MediaRules): Promise<string | null> {
  const what = label(rules.kind);

  if (!file.size) return `${file.name} is empty — pick another ${what}.`;

  const maxBytes = rules.maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name} is ${mb}MB — the limit is ${rules.maxMB}MB.`;
  }

  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();

  if (rules.kind === "image") {
    const okType = type ? (IMAGE_MIME as readonly string[]).includes(type) : true;
    if (!okType || (ext && !IMAGE_EXT.includes(ext))) {
      return `${file.name} isn't a supported image. Use JPG, PNG, WebP, HEIC or GIF.`;
    }
  } else if (rules.kind === "video") {
    const okType = type ? (VIDEO_MIME as readonly string[]).includes(type) : true;
    if (!okType || (ext && !VIDEO_EXT.includes(ext))) {
      return `${file.name} isn't a supported video. Use MP4, MOV or WebM.`;
    }
  } else if (ext && !DOCUMENT_EXT.includes(ext)) {
    return `${file.name} isn't an allowed attachment type. Share a PDF, document, spreadsheet or image.`;
  }

  if (typeof window === "undefined") return null;

  if (rules.kind === "image") {
    try {
      const { width, height } = await probeImage(file);
      const min = rules.minPixels ?? 64;
      if (Math.min(width, height) < min) {
        return `${file.name} is only ${width}×${height}px — use an image at least ${min}px on each side.`;
      }
    } catch {
      return `${file.name} could not be read as an image. It may be damaged or renamed.`;
    }
  }

  if (rules.kind === "video") {
    try {
      const { seconds } = await probeVideo(file);
      if (rules.maxSeconds && seconds > rules.maxSeconds) {
        return `${file.name} runs ${Math.round(seconds)}s — keep it under ${rules.maxSeconds}s.`;
      }
    } catch {
      return `${file.name} could not be played back. Export it as MP4 and try again.`;
    }
  }

  return null;
}

/** Same as `validateMediaFile`, but throws so it can guard an upload chain. */
export async function assertMediaFile(file: File, rules: MediaRules) {
  const problem = await validateMediaFile(file, rules);
  if (problem) throw new Error(problem);
}
