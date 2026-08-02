/**
 * Logo picker.
 *
 * Lets an admin choose an image file from their device. The image is resized in
 * the browser to fit a square canvas (default 512px) with its aspect ratio kept
 * and transparency preserved, then handed back as a data URL so it can be stored
 * with the rest of the branding settings — no bucket, no deploy.
 */
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

async function resizeToDataUrl(file: File, box: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(box / bitmap.width, box / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return { url: canvas.toDataURL("image/png"), width, height };
}

export function LogoPicker({
  value,
  alt,
  onChange,
  box = 512,
}: {
  value: string;
  alt?: string;
  onChange: (dataUrl: string) => void;
  /** Longest edge of the resized logo, in pixels. */
  box?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dimensions, setDimensions] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file — PNG, JPG, WebP or SVG.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("That image is larger than 8MB. Pick a smaller file.");
      return;
    }
    setBusy(true);
    try {
      const resized = await resizeToDataUrl(file, box);
      onChange(resized.url);
      setDimensions(`${resized.width}×${resized.height}px`);
      toast.success(`Logo resized to ${resized.width}×${resized.height}px — remember to save.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-panel">
          {value ? (
            <img
              src={value}
              alt={alt || "Selected logo"}
              className="size-full object-contain p-1"
            />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Logo image</p>
          <p className="text-xs text-muted-foreground">
            Choose a file and it is resized automatically to fit {box}px, keeping its shape and
            transparency.
            {dimensions ? ` Now ${dimensions}.` : ""}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {value ? "Replace logo" : "Choose logo"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setDimensions(null);
            }}
          >
            <Trash2 className="size-4" /> Use built-in mark
          </Button>
        ) : null}
      </div>
    </div>
  );
}
