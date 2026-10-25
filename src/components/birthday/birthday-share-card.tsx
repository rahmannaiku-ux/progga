"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BIRTHDAY_COLORS, makeConfetti } from "@/lib/birthday/celebration";

const SIZE = 1080;

type Assets = { logo: HTMLImageElement | null; mascot: HTMLImageElement | null; display: string; body: string };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The card, in the app's own colours: the sidebar's deep purple, gold for the name, cream text,
 * comic halftone dots, confetti kept to the edges so it never runs over the words, and Proggy
 * cheering in the corner.
 */
function draw(canvas: HTMLCanvasElement, name: string, a: Assets) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = SIZE;
  canvas.height = SIZE;
  const { ink, purple, gold, cream } = BIRTHDAY_COLORS;

  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, "#2B1656");
  bg.addColorStop(1, ink);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const glow = ctx.createRadialGradient(SIZE / 2, 300, 20, SIZE / 2, 300, 620);
  glow.addColorStop(0, "rgba(107,31,193,0.55)");
  glow.addColorStop(1, "rgba(25,18,43,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Halftone dots, stronger towards the corners.
  ctx.fillStyle = "rgba(252,249,243,0.07)";
  for (let row = 0, y = 40; y < SIZE; y += 26, row++) {
    for (let x = 40 + (row % 2) * 13; x < SIZE; x += 26) {
      const d = Math.hypot(x - SIZE / 2, y - SIZE / 2) / (SIZE / 2);
      if (d < 0.8) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(4, 6 * (d - 0.75)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Confetti only around the edges, never over the words.
  for (const c of makeConfetti(160, 11)) {
    const x = (c.left / 100) * SIZE;
    const y = (((c.duration * 997 + c.drift * 13) % SIZE) + SIZE) % SIZE;
    if (x > 110 && x < SIZE - 110 && y > 120 && y < SIZE - 100) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((c.spin * Math.PI) / 180);
    ctx.fillStyle = c.color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-c.width, -c.height * 0.6, c.width * 2, c.height * 1.2);
    ctx.restore();
  }

  // Comic frame: an ink shadow, then a rounded gold border.
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, 60, 64, SIZE - 112, SIZE - 112, 56);
  ctx.stroke();
  ctx.strokeStyle = gold;
  roundRect(ctx, 52, 52, SIZE - 104, SIZE - 104, 56);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const label = "PROGGAA  ·  BIRTHDAY";
  ctx.font = `800 28px ${a.body}`;
  const lw = ctx.measureText(label).width + 60;
  ctx.fillStyle = purple;
  roundRect(ctx, SIZE / 2 - lw / 2, 150, lw, 58, 29);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.fillStyle = gold;
  ctx.fillText(label, SIZE / 2, 189);

  ctx.fillStyle = cream;
  ctx.font = `800 100px ${a.display}`;
  ctx.fillText("Happy Birthday,", SIZE / 2, 350);

  let size = 140;
  ctx.font = `800 ${size}px ${a.display}`;
  while (ctx.measureText(`${name}!`).width > SIZE - 220 && size > 56) {
    size -= 6;
    ctx.font = `800 ${size}px ${a.display}`;
  }
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillText(`${name}!`, SIZE / 2 + 6, 506);
  ctx.fillStyle = gold;
  ctx.fillText(`${name}!`, SIZE / 2, 500);

  ctx.fillStyle = "rgba(252,249,243,0.88)";
  ctx.font = `500 40px ${a.body}`;
  ctx.fillText("Here's to a new year of learning,", SIZE / 2, 610);
  ctx.fillText("growing and finishing Missions.", SIZE / 2, 664);

  // Proggy cheering bottom right; the logo and address bottom left.
  if (a.mascot) {
    const h = 300;
    const w = (a.mascot.naturalWidth / a.mascot.naturalHeight) * h;
    ctx.drawImage(a.mascot, SIZE - 100 - w, SIZE - 70 - h, w, h);
  }
  const baseY = SIZE - 150;
  const textX = a.logo ? 214 : 116;
  if (a.logo) ctx.drawImage(a.logo, 112, baseY - 52, 90, 90);
  ctx.textAlign = "left";
  ctx.fillStyle = cream;
  ctx.font = `800 40px ${a.display}`;
  ctx.fillText("Proggaa", textX, baseY);
  ctx.fillStyle = "rgba(252,249,243,0.7)";
  ctx.font = `500 26px ${a.body}`;
  ctx.fillText("prooggaa.com", textX, baseY + 36);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The app's display and body fonts (next/font), so the card matches the site. */
function siteFonts() {
  const style = getComputedStyle(document.documentElement);
  const display = style.getPropertyValue("--font-display").trim();
  const body = style.getPropertyValue("--font-body").trim();
  return {
    display: display ? `${display}, system-ui, sans-serif` : "system-ui, sans-serif",
    body: body ? `${body}, system-ui, sans-serif` : "system-ui, sans-serif",
  };
}

/**
 * A downloadable / shareable birthday card. It carries only the first name
 * and a greeting: no date of birth, age, phone, email or coin balance.
 */
const FILE_NAME = "proggaa-birthday-card.png";
const SHARE_TEXT = "Celebrating my birthday with Proggaa 🎉 https://prooggaa.com";

/** iPhone/iPad, including iPadOS that reports itself as a Mac. */
function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Running as the installed app (home-screen PWA), where a plain <a download> often does nothing. */
function isInstalledApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function BirthdayShareCard({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The finished card as an <img>, so it can also be saved by press-and-hold (works in every
  // browser and inside the installed app, where file downloads are often blocked).
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fonts = siteFonts();
    const render = (assets: Assets) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      draw(canvas, name, assets);
      try {
        setImageUrl(canvas.toDataURL("image/png"));
      } catch {
        setImageUrl(null);
      }
    };
    render({ logo: null, mascot: null, ...fonts });
    void Promise.all([
      loadImage("/branding/proggaa-logo-512.png"),
      loadImage("/character/proggy/excited.png"),
      document.fonts?.ready,
    ]).then(([logo, mascot]) => {
      if (!cancelled) render({ logo, mascot, ...fonts });
    });
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => {
      cancelled = true;
    };
  }, [name]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      try {
        canvas.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
  }

  function toFile(blob: Blob) {
    return new File([blob], FILE_NAME, { type: "image/png" });
  }

  /** Share sheet with the image file, if this device supports sharing files. */
  async function shareFile(file: File): Promise<"done" | "cancelled" | "unsupported"> {
    if (typeof navigator.share !== "function" || !navigator.canShare?.({ files: [file] })) return "unsupported";
    try {
      await navigator.share({ files: [file], title: "My Proggaa birthday", text: SHARE_TEXT });
      return "done";
    } catch (e) {
      return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "unsupported";
    }
  }

  async function download() {
    setError(null);
    setHint(null);
    const blob = await toBlob();
    if (!blob) return setError("Couldn't create the image. Press and hold the card to save it instead.");

    // On iPhone and inside the installed app a download link is ignored, but the share
    // sheet has "Save Image" / "Save to Files", so use that there.
    if (isIOS() || isInstalledApp()) {
      const result = await shareFile(toFile(blob));
      if (result !== "unsupported") return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a); // Firefox and some webviews only follow links that are in the page
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setHint("If nothing was saved, press and hold the card and choose “Save image”.");
  }

  async function share() {
    setError(null);
    setHint(null);
    const blob = await toBlob();
    if (blob) {
      const result = await shareFile(toFile(blob));
      if (result !== "unsupported") return;
    }
    // This device can't share image files: share the greeting and link instead.
    try {
      await navigator.share({ title: "My Proggaa birthday", text: SHARE_TEXT });
      setHint("To share the picture itself, press and hold the card and choose “Save image” first.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Sharing isn't available here. Use Download, or press and hold the card to save it.");
    }
  }

  return (
    <div className="comic-panel bg-surface p-4 sm:p-5">
      <h2 className="font-display text-sm font-bold text-foreground">Your birthday card</h2>
      <p className="mt-1 text-xs text-muted-foreground">Save or share it. It shows only your first name, never your birthday or account details.</p>
      {/* Drawn off-screen; the visible card is the <img> below so press-and-hold "Save image" works. */}
      <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-hidden="true" className={imageUrl ? "hidden" : "mt-3 aspect-square w-full max-w-sm rounded-xl border border-border/40"} />
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL of the drawn card, Next/Image can't take it
        <img
          src={imageUrl}
          alt={`Birthday card: Happy Birthday, ${name}!`}
          width={SIZE}
          height={SIZE}
          className="mt-3 aspect-square w-full max-w-sm rounded-xl border border-border/40"
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={download}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> Download
        </Button>
        {canShare && (
          <Button type="button" variant="outline" onClick={share}>
            <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Share
          </Button>
        )}
      </div>
      {hint && !error && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
