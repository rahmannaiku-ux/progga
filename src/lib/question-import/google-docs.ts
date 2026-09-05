import { google } from "googleapis";
import { parsePastedQuestions } from "./paste-parser";
import type { ParsedQuestionDraft } from "./types";

/**
 * Google Docs import — ARCHITECTURALLY SEPARATE from the Google Drive
 * storage system (lib/storage/google-drive.ts), even though both use
 * the googleapis package and the same GOOGLE_CLIENT_ID/SECRET project.
 * They are fundamentally different flows and must not be merged:
 *
 *   Drive storage: ONE admin-owned account, connected ONCE, refresh
 *     token stored encrypted in the database forever (GoogleDriveConnection).
 *   Docs import:   EVERY teacher's OWN Google account, connected
 *     on-demand for a single import session, access token kept ONLY in
 *     a short-lived encrypted cookie — never written to the database at
 *     all, since there's nothing here that needs to persist past one
 *     import.
 *
 * Requires a SEPARATE redirect URI registered in Google Cloud Console
 * (GOOGLE_DOCS_REDIRECT_URI) — reusing the Drive storage callback would
 * conflate the two flows and make it ambiguous which one just
 * completed. Same GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are reused
 * since it's the same OAuth client, just a different scope + redirect.
 */

const DOCS_SCOPES = [
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function isGoogleDocsImportConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_DOCS_REDIRECT_URI
  );
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DOCS_REDIRECT_URI
  );
}

export function getGoogleDocsAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    // access_type "online" (the default), not "offline" — this is a
    // one-shot "pick a doc, import it, done" session, not a persistent
    // connection, so there is deliberately no refresh_token to manage
    // or store.
    scope: DOCS_SCOPES,
    state,
  });
}

export async function exchangeGoogleDocsCode(code: string): Promise<{ accessToken: string; expiresAt: number }> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google didn't return an access token.");
  return {
    accessToken: tokens.access_token,
    expiresAt: tokens.expiry_date ?? Date.now() + 55 * 60 * 1000,
  };
}

/** Accepts either a bare document ID or a full Google Docs URL. */
export function extractDocId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Reads a Google Doc's body and flattens it to plain text, then runs it
 * through the SAME paste parser as manual paste/PDF import — a
 * question doc, once flattened to text, has the same "1. prompt / A.
 * option / Answer: X" shape, so there is no separate Docs-specific
 * question-detection logic.
 */
export async function importQuestionsFromGoogleDoc(
  docId: string,
  accessToken: string
): Promise<{ drafts: ParsedQuestionDraft[]; extractedText: string; docTitle: string }> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const docs = google.docs({ version: "v1", auth: client });

  const { data } = await docs.documents.get({ documentId: docId });
  const text = flattenDocBody(data.body?.content ?? []);
  const drafts = parsePastedQuestions(text);
  return { drafts, extractedText: text, docTitle: data.title ?? "Untitled document" };
}

function flattenDocBody(content: NonNullable<import("googleapis").docs_v1.Schema$Body["content"]>): string {
  const lines: string[] = [];
  for (const el of content) {
    if (!el.paragraph?.elements) continue;
    const lineText = el.paragraph.elements.map((e) => e.textRun?.content ?? "").join("");
    if (lineText.trim()) lines.push(lineText.replace(/\n$/, ""));
  }
  return lines.join("\n");
}
