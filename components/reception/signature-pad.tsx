"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = { onChange: (signed: boolean) => void; label: string };

export type SignaturePadHandle = { toBlob: () => Promise<Blob | null> };

// Pad de signature manuscrite (doigt, stylet ou souris). Le tracé est dessiné sur un canevas
// à la résolution de l'écran, puis exporté en PNG (DECISIONS Q4).
export function SignaturePad({
  onChange,
  label,
  handleRef,
}: Props & { handleRef: React.RefObject<SignaturePadHandle | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  const context = useCallback(() => canvas.current?.getContext("2d") ?? null, []);

  const reset = useCallback(() => {
    const el = canvas.current;
    const ctx = context();
    if (!el || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.clientWidth, el.clientHeight);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    setSigned(false);
    onChange(false);
  }, [context, onChange]);

  useEffect(() => {
    reset();
    handleRef.current = {
      toBlob: () =>
        new Promise((resolve) => {
          if (!canvas.current) return resolve(null);
          canvas.current.toBlob(resolve, "image/png");
        }),
    };
  }, [reset, handleRef]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        aria-label={label}
        role="img"
        className="border-border h-48 w-full touch-none rounded-md border-2 border-dashed bg-white"
        onPointerDown={(e) => {
          const ctx = context();
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const { x, y } = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          const ctx = context();
          if (!drawing.current || !ctx) return;
          const { x, y } = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          if (!signed) {
            setSigned(true);
            onChange(true);
          }
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{signed ? "Signature saisie" : "Signez dans le cadre"}</span>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Effacer
        </Button>
      </div>
    </div>
  );
}
