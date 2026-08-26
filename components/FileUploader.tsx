"use client";
import { useRef, useState } from "react";

export default function FileUploader({
  folder, mode = "image-video", onUploaded
}: {
  folder: string;
  mode?: "image-video" | "document";
  onUploaded: (meta: { file: File; name: string; mimeType: string }) => Promise<void> | void;
}) {
  const mediaRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const accept = mode === "image-video" ? "image/*,video/*" : ".pdf,.doc,.docx,.png,.jpg,.jpeg";

  async function handle(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      await onUploaded({ file, name: file.name, mimeType: file.type });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <input ref={mediaRef} type="file" accept={accept} className="hidden"
        onChange={e => handle(e.target.files?.[0] || null)} />
      {mode === "image-video" && (
        <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
          onChange={e => handle(e.target.files?.[0] || null)} />
      )}
      <button type="button" onClick={() => mediaRef.current?.click()} disabled={uploading}
        className="px-3 py-2 bg-gray-100 rounded text-sm">
        {uploading ? "Uploading..." : "📁 Choose file"}
      </button>
      {mode === "image-video" && (
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading}
          className="px-3 py-2 bg-gray-100 rounded text-sm">
          📷 Take photo/video
        </button>
      )}
    </div>
  );
}