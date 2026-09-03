"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { photoUrl } from "@/lib/storage";
import type { SparePartPhoto } from "@/lib/types";

// Full-size view of a part's photos, opened from the thumbnail in the parts
// table so you can confirm you're looking at the right part without opening
// the whole record.
//
// Portalled to <body> like the other fixed-position overlays in the app: the
// shell wraps page content in a `.glass-strong` panel whose backdrop-filter
// makes that panel the containing block for fixed children, which would pin
// this to the panel rather than the viewport.
export default function PhotoLightbox({
  photos,
  title,
  onClose,
}: {
  photos: SparePartPhoto[];
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const count = photos.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (count > 1 && e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (count > 1 && e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  if (!mounted || count === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
      role="dialog"
      aria-label={title}
    >
      {/* Explicit black rather than the bg-ink/… the modals use: --ink flips
          to near-white in dark mode, which would wash a photo out instead of
          isolating it. */}
      <div className="animate-overlay absolute inset-0 bg-black/75" onClick={onClose} aria-hidden="true" />

      {/* w-auto so the column shrinks to the image, keeping the title and the
          close button aligned to the photo's own edges — which also means the
          panel has no width until the image has decoded. Staying hidden until
          then avoids animating a zero-width box that then snaps out to full
          size. In practice the thumbnail already put the same URL in cache, so
          this resolves on the first frame. */}
      <div
        className={`relative z-10 flex max-h-full w-auto max-w-full flex-col items-center gap-3 ${
          ready ? "animate-zoom" : "invisible"
        }`}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-sm text-white transition hover:bg-white/25"
          >
            ✕
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(photos[index].storage_path)}
          alt={title}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          className="max-h-[75vh] w-auto max-w-[min(90vw,900px)] rounded-xl object-contain"
        />

        {count > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1}`}
                className={`overflow-hidden rounded-md transition ${
                  i === index ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(p.storage_path)}
                  alt=""
                  className="h-12 w-12 object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
