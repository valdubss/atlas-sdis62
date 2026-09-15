"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

/**
 * Recadrage carré au doigt : glisser pour placer, curseur pour zoomer,
 * export 512 px JPEG. Tout se passe sur l'appareil.
 */
export function AvatarCropper({ file, onDone, onCancel }: { file: File | null; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const SIZE = 280;

  useEffect(() => {
    if (!file) {
      setBitmap(null);
      return;
    }
    let alive = true;
    createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      .then((b) => alive && setBitmap(b))
      .catch(() => onCancel());
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => {
      alive = false;
    };
  }, [file, onCancel]);

  // Dessin de l'aperçu : image centrée, échelle de base = couvrir le carré
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bitmap) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const base = Math.max(SIZE / bitmap.width, SIZE / bitmap.height) * zoom;
    const w = bitmap.width * base;
    const h = bitmap.height * base;
    const maxX = Math.max(0, (w - SIZE) / 2);
    const maxY = Math.max(0, (h - SIZE) / 2);
    const ox = Math.max(-maxX, Math.min(maxX, offset.x));
    const oy = Math.max(-maxY, Math.min(maxY, offset.y));
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bitmap, (SIZE - w) / 2 + ox, (SIZE - h) / 2 + oy, w, h);
  }, [bitmap, zoom, offset]);

  function done() {
    if (!bitmap) return;
    const out = document.createElement("canvas");
    out.width = out.height = 512;
    const ctx = out.getContext("2d", { alpha: false })!;
    const base = Math.max(SIZE / bitmap.width, SIZE / bitmap.height) * zoom;
    const scale = 512 / SIZE;
    const w = bitmap.width * base * scale;
    const h = bitmap.height * base * scale;
    const maxX = Math.max(0, (w - 512) / 2);
    const maxY = Math.max(0, (h - 512) / 2);
    const ox = Math.max(-maxX, Math.min(maxX, offset.x * scale));
    const oy = Math.max(-maxY, Math.min(maxY, offset.y * scale));
    ctx.drawImage(bitmap, (512 - w) / 2 + ox, (512 - h) / 2 + oy, w, h);
    out.toBlob((b) => b && onDone(b), "image/jpeg", 0.88);
  }

  return (
    <Sheet open={file !== null} onClose={onCancel} title="Recadrer la photo">
      <div className="flex flex-col items-center gap-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="relative overflow-hidden rounded-full ring-4 ring-bg-2" style={{ width: SIZE, height: SIZE }}>
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            className="touch-none"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => drag.current && setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            aria-label="Aperçu : glissez pour déplacer"
          />
        </div>
        <label className="flex w-full max-w-[280px] items-center gap-3 text-[13px] text-text-2">
          Zoom
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--text-1)]" aria-label="Zoom" />
        </label>
        <div className="flex gap-3">
          <Button type="button" onClick={done} disabled={!bitmap}>
            Utiliser cette photo
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
