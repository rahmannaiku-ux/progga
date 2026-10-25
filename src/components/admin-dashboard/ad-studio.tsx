"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { AD_GROUPS, AD_POSES, AD_POSE_LABELS, AD_TEMPLATES, type AdPose, type AdTemplate } from "@/lib/ad-studio/catalog";
import { cn } from "@/lib/utils";

const SHAPES = [
  { key: "all", label: "All sizes" },
  { key: "square", label: "Square" },
  { key: "portrait", label: "Portrait" },
  { key: "story", label: "Story" },
  { key: "wide", label: "Wide" },
] as const;
type Shape = (typeof SHAPES)[number]["key"];

function shapeOf(t: AdTemplate): Exclude<Shape, "all"> {
  const r = t.height / t.width;
  if (r > 1.6) return "story";
  if (r > 1.05) return "portrait";
  if (r < 0.95) return "wide";
  return "square";
}
const PHOTO_MAX_SIDE = 1200;
const NO_VALUES: Record<string, string> = {};

/** Shrinks a chosen photo to at most 1200 px on its longer side, as a JPEG data URL. */
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Admin -> Ad Studio: choose one of the Prooggaa ad templates, type the text,
 * pick Proggy's pose (and a photo where the template has one), see it drawn
 * by the server (/api/admin/ad-studio) and download the PNG.
 */
export function AdStudio() {
  const [templateId, setTemplateId] = useState(AD_TEMPLATES[0]!.id);
  const [search, setSearch] = useState("");
  const [shape, setShape] = useState<Shape>("all");
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return AD_TEMPLATES.filter(
      (t) => (shape === "all" || shapeOf(t) === shape) && (!q || `${t.name} ${t.group}`.toLowerCase().includes(q))
    );
  }, [search, shape]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [poses, setPoses] = useState<Record<string, AdPose>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const previewUrl = useRef<string | null>(null);

  const template = useMemo(() => AD_TEMPLATES.find((t) => t.id === templateId) ?? AD_TEMPLATES[0]!, [templateId]);
  const current = values[template.id] ?? NO_VALUES;
  const pose = poses[template.id] ?? template.pose;
  const photo = photos[template.id] ?? "";

  // Redraw shortly after the last change.
  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/ad-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: template.id, values: current, pose, photo: template.photo ? photo : undefined }),
        });
        if (id !== request.current) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Couldn't draw the preview.");
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview(url);
      } catch {
        if (id === request.current) setError("Couldn't reach the server. Check your connection.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [template, current, pose, photo]);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    []
  );

  function setField(key: string, value: string) {
    setValues((all) => ({ ...all, [template.id]: { ...(all[template.id] ?? {}), [key]: value } }));
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Choose a PNG, JPEG or WebP photo.");
      return;
    }
    try {
      const url = await photoToDataUrl(file);
      setPhotos((all) => ({ ...all, [template.id]: url }));
    } catch {
      setError("Couldn't read that photo.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.2fr)]">
      <nav aria-label="Templates" className="comic-panel h-fit bg-surface p-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <label className="mb-2 block">
          <span className="sr-only">Search templates</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${AD_TEMPLATES.length} templates`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm"
          />
        </label>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Size">
          {SHAPES.map((sh) => (
            <button
              key={sh.key}
              type="button"
              onClick={() => setShape(sh.key)}
              aria-pressed={shape === sh.key}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold",
                shape === sh.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {sh.label}
            </button>
          ))}
        </div>
        <label className="mb-3 block xl:hidden">
          <span className="sr-only">Template</span>
          <select
            value={template.id}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm"
          >
            {AD_GROUPS.map((group) => {
              const inGroup = visible.filter((t) => t.group === group);
              return inGroup.length === 0 ? null : (
                <optgroup key={group} label={group}>
                  {inGroup.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <div className="hidden space-y-4 xl:block">
          {visible.length === 0 && <p className="px-2 text-sm text-muted-foreground">No template matches.</p>}
          {AD_GROUPS.map((group) => {
            const inGroup = visible.filter((t) => t.group === group);
            if (inGroup.length === 0) return null;
            return (
            <div key={group}>
              <p className="mb-1 flex items-center justify-between px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {group} <span className="font-mono font-medium normal-case">{inGroup.length}</span>
              </p>
              <ul className="space-y-0.5">
                {inGroup.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      aria-current={t.id === template.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold",
                        t.id === template.id ? "bg-xp text-xp-foreground" : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span>{t.name}</span>
                      <span className="shrink-0 text-[11px] font-medium opacity-70">
                        {t.width}×{t.height}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>
      </nav>

      <section aria-label="Text and pictures" className="comic-panel h-fit space-y-4 bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">{template.name}</h2>
          <button
            type="button"
            onClick={() => {
              setValues((all) => ({ ...all, [template.id]: {} }));
              setPoses(({ [template.id]: _p, ...rest }) => rest);
              setPhotos(({ [template.id]: _ph, ...rest }) => rest);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Words in [BRACKETS] are placeholders: replace them before you post.</p>

        {template.fields.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-sm font-semibold text-foreground">{field.label}</span>
            {field.max > 60 ? (
              <textarea
                value={current[field.key] ?? field.default}
                maxLength={field.max}
                rows={3}
                onChange={(e) => setField(field.key, e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm"
              />
            ) : (
              <input
                type="text"
                value={current[field.key] ?? field.default}
                maxLength={field.max}
                onChange={(e) => setField(field.key, e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm"
              />
            )}
          </label>
        ))}

        {template.pose && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">Proggy&apos;s pose</legend>
            <div className="grid grid-cols-4 gap-2">
              {AD_POSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPoses((all) => ({ ...all, [template.id]: p }))}
                  aria-pressed={pose === p}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 text-[11px] font-semibold",
                    pose === p ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/character/proggy/${p}.png`} alt="" className="h-14 w-auto object-contain" />
                  {AD_POSE_LABELS[p]}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {template.photo && (
          <div className="space-y-2">
            <span className="block text-sm font-semibold text-foreground">{template.photo}</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="comic-btn flex cursor-pointer items-center gap-2 bg-surface px-3 py-2 text-sm font-bold text-foreground">
                <ImagePlus className="h-4 w-4" aria-hidden="true" /> {photo ? "Change photo" : "Add photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhotos(({ [template.id]: _ph, ...rest }) => rest)}
                  className="flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" /> Remove
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Preview" className="space-y-3">
        <div className="comic-panel relative overflow-hidden bg-muted p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`Preview of ${template.name}`}
              className="mx-auto h-auto max-h-[75vh] w-auto max-w-full"
              style={{ aspectRatio: `${template.width} / ${template.height}` }}
            />
          ) : (
            <div className="mx-auto max-w-full bg-surface" style={{ aspectRatio: `${template.width} / ${template.height}` }} />
          )}
          {loading && (
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground shadow-card">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Drawing…
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={preview ?? undefined}
            download={`prooggaa-${template.id}.png`}
            aria-disabled={!preview || loading}
            className={cn(
              "comic-btn flex items-center gap-2 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground",
              (!preview || loading) && "pointer-events-none opacity-50"
            )}
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Download PNG
          </a>
          <span className="text-xs text-muted-foreground">
            {template.width} × {template.height} px
          </span>
        </div>
      </section>
    </div>
  );
}
