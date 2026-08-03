/**
 * Shared upload queue: one row per file with live progress, cancel while it is
 * moving, and a retry button when it fails. Every upload surface in Ashnight
 * uses this so a dropped connection never leaves a member guessing.
 */
import { useCallback, useRef, useState } from "react";

import { UPLOAD_CANCELLED, uploadWithProgress } from "@/lib/upload-progress";

export type UploadStatus = "uploading" | "error" | "done";

export interface UploadTask {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string | undefined;
}

export interface UploadRequest {
  bucket: "avatars" | "attachments";
  path: string;
  file: File;
  /** Runs once the bytes are stored — post the message, save the path, etc. */
  onStored?: (path: string) => Promise<void> | void;
}

export function useUploadQueue() {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const requests = useRef(new Map<string, UploadRequest>());
  const cancels = useRef(new Map<string, () => void>());

  const patch = useCallback((id: string, next: Partial<UploadTask> & { error?: string | undefined }) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...next } : task)),
    );
  }, []);

  const run = useCallback(
    async (id: string, request: UploadRequest) => {
      patch(id, { status: "uploading", progress: 0, error: undefined });
      const handle = uploadWithProgress({
        bucket: request.bucket,
        path: request.path,
        file: request.file,
        onProgress: (percent) => patch(id, { progress: percent }),
      });
      cancels.current.set(id, handle.cancel);
      try {
        const storedPath = await handle.done;
        await request.onStored?.(storedPath);
        patch(id, { status: "done", progress: 100 });
        // Finished rows clear themselves so the list stays about work in flight.
        window.setTimeout(() => {
          setTasks((current) => current.filter((task) => task.id !== id));
          requests.current.delete(id);
        }, 1200);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        if (message === UPLOAD_CANCELLED) {
          setTasks((current) => current.filter((task) => task.id !== id));
          requests.current.delete(id);
          return;
        }
        patch(id, { status: "error", error: message });
      } finally {
        cancels.current.delete(id);
      }
    },
    [patch],
  );

  /** Queues one file and starts it immediately. */
  const start = useCallback(
    (request: UploadRequest) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      requests.current.set(id, request);
      setTasks((current) => [
        ...current,
        { id, name: request.file.name, size: request.file.size, progress: 0, status: "uploading" },
      ]);
      void run(id, request);
      return id;
    },
    [run],
  );

  const retry = useCallback(
    (id: string) => {
      const request = requests.current.get(id);
      if (request) void run(id, request);
    },
    [run],
  );

  const cancel = useCallback((id: string) => {
    cancels.current.get(id)?.();
  }, []);

  const dismiss = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    requests.current.delete(id);
  }, []);

  return {
    tasks,
    start,
    retry,
    cancel,
    dismiss,
    busy: tasks.some((task) => task.status === "uploading"),
  };
}
