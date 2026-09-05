import { FileText, ExternalLink, Maximize2 } from "lucide-react";
import { parseGoogleEmbedUrl, GOOGLE_EMBED_LABEL } from "@/lib/google-embed";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";

/**
 * A lesson resource that links to a Google Doc/Sheet/Slides/Drive file.
 * Embeddable URLs (per parseGoogleEmbedUrl) render as a compact card;
 * clicking it opens the embed full-size in a modal preview instead of
 * the iframe permanently occupying space in the lesson page. Anything
 * parseGoogleEmbedUrl doesn't recognize (a Drive folder, a non-Google
 * link, a malformed URL) falls back to a plain external link, same as
 * before.
 */
export function GoogleResourceEmbed({ title, url }: { title: string; url: string }) {
  const embed = parseGoogleEmbedUrl(url);

  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="comic-panel flex items-center gap-2 bg-surface p-3.5 text-sm font-medium text-foreground hover:text-primary"
      >
        <FileText className="h-4 w-4 text-accent" /> {title}
        <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </a>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="comic-panel flex w-full items-center gap-3 bg-surface p-3.5 text-left transition-colors hover:border-primary/40"
        >
          <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-accent/15">
            <FileText className="h-4 w-4 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            <span className="block text-xs text-muted-foreground">
              {GOOGLE_EMBED_LABEL[embed.kind]} · tap to preview
            </span>
          </span>
          <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent
        title={title}
        badge={GOOGLE_EMBED_LABEL[embed.kind]}
        closeLabel="Close preview"
        className="h-[85vh] max-w-4xl"
      >
        <iframe
          src={embed.embedUrl}
          className="block h-full w-full border-0"
          allow="autoplay"
          title={title}
        />
      </DialogContent>
    </Dialog>
  );
}
