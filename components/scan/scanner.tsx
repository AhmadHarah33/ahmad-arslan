"use client";

import { useEffect, useRef, useState } from "react";

// QR/barcode scanner using the BarcodeDetector API (Chrome/Android). Falls back
// to a message where unsupported.
export default function Scanner({
  onResult,
  onClose,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;

    async function start() {
      const AnyWin = window as any;
      if (!("BarcodeDetector" in window)) {
        setErr("Scanning isn't supported on this device — use search instead.");
        return;
      }
      try {
        const detector = new AnyWin.BarcodeDetector({
          formats: ["qr_code", "code_128", "ean_13"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) {
              onResult(codes[0].rawValue);
              return;
            }
          } catch {
            /* transient */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr("Camera unavailable. Check permissions.");
      }
    }
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/80 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface">
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />
        </div>
        <div className="p-4 text-center">
          {err ? (
            <p className="text-sm text-red-600">{err}</p>
          ) : (
            <p className="text-sm text-ink-muted">Point the camera at a QR code…</p>
          )}
          <button className="btn-ghost mt-3 w-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
