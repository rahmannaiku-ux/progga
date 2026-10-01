export type GoogleEmbedKind = "file" | "document" | "spreadsheet" | "presentation";

export type GoogleEmbed = {
  kind: GoogleEmbedKind;
  embedUrl: string;
};

/**
 * Recognizes Google Drive file links and Google Docs/Sheets/Slides links,
 * returning an iframe-embeddable preview URL. Returns null for anything
 * else (a plain external link, a Drive *folder* link, or a malformed
 * URL) — callers should fall back to a normal download/open link in
 * that case rather than trying to embed it.
 */
export function parseGoogleEmbedUrl(rawUrl: string): GoogleEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // Google Docs / Sheets / Slides — https://docs.google.com/{type}/d/{id}/...
  if (host === "docs.google.com") {
    const match = url.pathname.match(
      /^\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/
    );
    if (!match) return null;
    const [, type, id] = match;

    if (type === "document") {
      return { kind: "document", embedUrl: `https://docs.google.com/document/d/${id}/preview` };
    }
    if (type === "spreadsheets") {
      return { kind: "spreadsheet", embedUrl: `https://docs.google.com/spreadsheets/d/${id}/preview` };
    }
    if (type === "presentation") {
      return { kind: "presentation", embedUrl: `https://docs.google.com/presentation/d/${id}/preview` };
    }
  }

  // Google Drive file (any type, including Drive-hosted video) —
  // https://drive.google.com/file/d/{id}/view
  if (host === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null; // e.g. a folder link — not embeddable the same way
    const [, id] = match;
    return { kind: "file", embedUrl: `https://drive.google.com/file/d/${id}/preview` };
  }

  return null;
}

/**
 * The address that makes Google hand over the file itself (a download, not a
 * viewer): the original file for Drive, a PDF export for Docs / Sheets /
 * Slides. Null for anything Google can't export this way (a folder, another
 * site, a malformed URL). Only ever built from the document id, so it can't
 * point anywhere but Google.
 */
export function googleDownloadUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host === "docs.google.com") {
    const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const [, type, id] = match;
    if (type === "presentation") return `https://docs.google.com/presentation/d/${id}/export/pdf`;
    return `https://docs.google.com/${type}/d/${id}/export?format=pdf`;
  }
  if (host === "drive.google.com") {
    const match = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return null;
}

export const GOOGLE_EMBED_LABEL: Record<GoogleEmbedKind, string> = {
  file: "Google Drive file",
  document: "Google Doc",
  spreadsheet: "Google Sheet",
  presentation: "Google Slides",
};
