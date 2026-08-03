/**
 * Uploads with real progress. The Supabase JS client resolves only when a file
 * has finished, so anything the member watches (portfolio media, chat photos)
 * goes through XMLHttpRequest against the Storage REST endpoint instead — that
 * is the only way to get byte-level progress plus a cancel handle in a browser.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_URL = `${import.meta.env["VITE_SUPABASE_URL"]}/storage/v1/object`;
const API_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

export interface UploadHandle {
  /** Resolves with the bucket-relative path once the file is stored. */
  done: Promise<string>;
  /** Aborts the transfer; `done` rejects with an "Upload cancelled" error. */
  cancel: () => void;
}

/** Thrown when the member cancels — callers treat it as a quiet dismissal. */
export const UPLOAD_CANCELLED = "Upload cancelled";

export function uploadWithProgress({
  bucket,
  path,
  file,
  upsert = true,
  onProgress,
}: {
  bucket: "avatars" | "attachments";
  path: string;
  file: File;
  upsert?: boolean;
  /** 0-100, fired as bytes leave the device. */
  onProgress?: (percent: number) => void;
}): UploadHandle {
  const request = new XMLHttpRequest();

  const done = new Promise<string>((resolve, reject) => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        reject(new Error("Sign in again to upload files."));
        return;
      }

      request.open("POST", `${STORAGE_URL}/${bucket}/${encodeURI(path)}`, true);
      request.setRequestHeader("authorization", `Bearer ${token}`);
      request.setRequestHeader("apikey", API_KEY);
      request.setRequestHeader("x-upsert", String(upsert));
      if (file.type) request.setRequestHeader("content-type", file.type);

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
      request.onerror = () =>
        reject(new Error("Upload failed — check your connection and try again."));
      request.onabort = () => reject(new Error(UPLOAD_CANCELLED));
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress?.(100);
          resolve(path);
          return;
        }
        let message = `Upload failed (${request.status}).`;
        try {
          const body = JSON.parse(request.responseText) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          /* non-JSON error body — keep the status message */
        }
        reject(new Error(message));
      };

      request.send(file);
    })().catch(reject);
  });

  return { done, cancel: () => request.abort() };
}

/** Signed link for a stored attachment, valid for 30 days. */
export async function signAttachment(path: string) {
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Storage-safe file name: keeps the extension, drops anything unusual. */
export function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}
