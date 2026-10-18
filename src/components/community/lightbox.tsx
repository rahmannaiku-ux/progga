"use client";

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";

/** A post's picture full screen on black, like tapping a photo on Facebook. */
export function ImageLightbox({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [container, setContainer] = useState<HTMLElement | undefined>();
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black animate-in fade-in-0 duration-200" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-2 outline-none animate-in fade-in-0 zoom-in-95 duration-200 sm:p-10"
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">Picture</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{alt}</DialogPrimitive.Description>
          {/* eslint-disable-next-line @next/next/no-img-element -- community upload served by /api/files; size varies */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full select-none rounded-sm object-contain shadow-2xl"
          />
          <div className="absolute right-3 top-3 flex gap-2" style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
            <a
              href={src}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open the original picture"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
            <DialogPrimitive.Close
              aria-label="Close the picture"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
