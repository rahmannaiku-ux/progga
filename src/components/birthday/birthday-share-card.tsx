"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BIRTHDAY_COLORS, makeConfetti } from "@/lib/birthday/celebration";

const SIZE = 1080;

function draw(canvas: HTMLCanvasElement, name: string, logo: HTMLImageElement | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.fillStyle = BIRTHDAY_COLORS.ink;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const glow = ctx.createRadialGradient(SIZE / 2, SIZE * 0.42, 40, SIZE / 2, SIZE * 0.42, SIZE * 0.6);
  glow.addColorStop(0, "rgba(107,31,193,0.75)");
  glow.addColorStop(1, "rgba(25,18,43,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (const c of makeConfetti(90, 7)) {
    ctx.save();
    ctx.translate((c.left / 100) * SIZE, ((c.duration * 997 + c.drift * 13) % SIZE + SIZE) % SIZE);
    ctx.rotate((c.spin * Math.PI) / 180);
    ctx.fillStyle = c.color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-c.width, -c.height, c.width * 2, c.height * 2);
    ctx.restore();
  }

  ctx.strokeStyle = BIRTHDAY_COLORS.gold;
  ctx.lineWidth = 12;
  ctx.strokeRect(40, 40, SIZE - 80, SIZE - 80);

  ctx.textAlign = "center";
  ctx.fillStyle = BIRTHDAY_COLORS.gold;
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText("MISSION: ANOTHER YEAR COMPLETE", SIZE / 2, 300);

  ctx.fillStyle = BIRTHDAY_COLORS.cream;
  ctx.font = "800 110px system-ui, sans-serif";
  ctx.fillText("Happy Birthday,", SIZE / 2, 470);
  ctx.fillStyle = BIRTHDAY_COLORS.gold;
  let size = 130;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(`${name}!`).width > SIZE - 200 && size > 50) {
    size -= 6;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
  ctx.fillText(`${name}!`, SIZE / 2, 620);

  ctx.fillStyle = BIRTHDAY_COLORS.cream;
  ctx.font = "500 46px system-ui, sans-serif";
  ctx.fillText("Here's to a new year of learning", SIZE / 2, 760);
  ctx.fillText("and exciting Missions 🎂", SIZE / 2, 822);

  if (logo) ctx.drawImage(logo, SIZE / 2 - 60, 880, 120, 120);
  else {
    ctx.font = "bold 48px system-ui, sans-serif";
    ctx.fillText("Proggaa", SIZE / 2, 960);
  }
}

/**
 * A downloadable / shareable birthday card. It carries only the first name
 * and a greeting: no date of birth, age, phone, email or coin balance.
 */
export function BirthdayShareCard({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const logo = new Image();
    logo.onload = () => canvasRef.current && draw(canvasRef.current, name, logo);
    logo.onerror = () => canvasRef.current && draw(canvasRef.current, name, null);
    logo.src = "/branding/proggaa-logo-512.png";
    if (canvasRef.current) draw(canvasRef.current, name, null);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [name]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => canvasRef.current?.toBlob((b) => resolve(b), "image/png") ?? resolve(null));
  }

  async function download() {
    setError(null);
    const blob = await toBlob();
    if (!blob) return setError("Couldn't create the image.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proggaa-birthday-card.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    setError(null);
    const blob = await toBlob();
    if (!blob) return setError("Couldn't create the image.");
    const file = new File([blob], "proggaa-birthday-card.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My Proggaa birthday" });
      else await navigator.share({ title: "My Proggaa birthday", text: "Celebrating my birthday with Proggaa! 🎂" });
    } catch {
      // cancelled by the person: nothing to do
    }
  }

  return (
    <div className="comic-panel bg-surface p-4 sm:p-5">
      <h2 className="font-display text-sm font-bold text-foreground">Your birthday card</h2>
      <p className="mt-1 text-xs text-muted-foreground">Save or share it. It shows only your first name, never your birthday or account details.</p>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Birthday card: Happy Birthday, ${name}!`}
        className="mt-3 aspect-square w-full max-w-sm rounded-xl border border-border/40"
      />
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
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
