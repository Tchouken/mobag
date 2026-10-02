"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

// Lecture de QR par la caméra : BarcodeDetector quand le navigateur le propose (Chrome
// Android), sinon décodage jsQR des images (Safari iPad). S'arrête au premier résultat accepté.
export function QrScanner({ onResult, label }: { onResult: (text: string) => boolean; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const unavailable = "Caméra indisponible : saisissez le code à la main.";
  const [error, setError] = useState<string | undefined>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices ? unavailable : undefined,
  );

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const scan = async () => {
      const v = video.current;
      const c = canvas.current;
      if (stopped || !v || !c || v.readyState < 2) return;
      let text: string | undefined;
      if (detector) {
        text = (await detector.detect(v).catch(() => []))[0]?.rawValue;
      } else {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0);
        text = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data;
      }
      if (text && onResult(text)) stop();
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(scan, 250);
      })
      .catch(() => setError(unavailable));
    return stop;
  }, [onResult, unavailable]);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="status" className="text-muted-foreground text-sm">
          {error}
        </p>
      ) : (
        <video
          ref={video}
          aria-label={label}
          muted
          playsInline
          className="aspect-square w-full max-w-sm rounded-lg bg-black object-cover"
        />
      )}
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}
