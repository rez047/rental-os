// components/SignaturePad.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { saveSignature } from "@/lib/actions";

export default function SignaturePad({
  leaseId,
  role,
  onSigned
}: {
  leaseId: string;
  role: "tenant" | "manager";
  onSigned: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function sign() {
    const canvas = canvasRef.current!;
    setSaving(true);
    const dataUrl = canvas.toDataURL("image/png");
    await saveSignature(leaseId, dataUrl, role);
    setSaving(false);
    onSigned();
  }

  return (
    <div className="border-2 border-dashed border-gray-300 p-4 rounded-lg inline-block">
      <p className="text-sm mb-2">Sign below:</p>
      <canvas
        ref={canvasRef}
        className="border border-gray-200 rounded bg-white touch-none cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={sign}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm"
        >
          {saving ? "Saving..." : "Save Signature"}
        </button>
        <button
          onClick={clear}
          className="px-4 py-2 border border-gray-300 rounded text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  );
}