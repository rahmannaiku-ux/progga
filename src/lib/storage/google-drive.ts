import { Readable } from "stream";
import { google, drive_v3 } from "googleapis";
import { db } from "@/lib/db/client";
import { encryptSecret, decryptSecret } from "@/lib/storage/token-crypto";
import type { UploadContext } from "@prisma/client";

const CONNECTION_ID = "singleton";

// drive.file (not full drive.readonly/drive scope) — Proggaa can only
// see/manage files *it* creates, never browse the rest of the connected
// account's Drive. This is the "as restrictive as practical" scope the
// spec asks for: broad enough to create folders and upload/read/delete
// Proggaa's own files, narrow enough that a leaked token can't be used
// to exfiltrate unrelated documents from that Google account.
const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

const ROOT_FOLDER_NAME = "PROGGAA";

/** The 5 Drive-backed upload categories — LESSON_RESOURCE deliberately
 * excluded (stays on the existing UploadThing-backed course-content
 * system; see regression-protection note in lib/storage/index.ts). */
const CATEGORY_FOLDER_NAME: Record<
  Exclude<UploadContext, "LESSON_RESOURCE">,
  string
> = {
  AVATAR: "profile-pictures",
  ASSIGNMENT_SUBMISSION: "assignments",
  CERTIFICATE: "certificates",
  COMMUNITY_IMAGE: "community",
  OTHER: "other",
};

const CATEGORY_FOLDER_DB_FIELD: Record<
  Exclude<UploadContext, "LESSON_RESOURCE">,
  "profilePicturesFolderId" | "assignmentsFolderId" | "certificatesFolderId" | "communityFolderId" | "otherFolderId"
> = {
  AVATAR: "profilePicturesFolderId",
  ASSIGNMENT_SUBMISSION: "assignmentsFolderId",
  CERTIFICATE: "certificatesFolderId",
  COMMUNITY_IMAGE: "communityFolderId",
  OTHER: "otherFolderId",
};

export class DriveNotConnectedError extends Error {
  constructor() {
    super("Google Drive is not connected.");
    this.name = "DriveNotConnectedError";
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in the server environment.`);
  return v;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("GOOGLE_REDIRECT_URI")
  );
}

/** Step 1 of the connect flow — admin clicks "Connect Google Drive". */
export function getGoogleAuthUrl(state: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent", // forces a refresh_token even on a re-consent
    scope: DRIVE_SCOPES,
    state,
  });
}

/** Step 2 — Google redirects back to our callback with `code`. */
export async function connectGoogleDriveAccount(code: string, connectedByUserId: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. This usually means the account already " +
        "granted consent previously — remove Proggaa's access at " +
        "https://myaccount.google.com/permissions and try connecting again."
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Could not read the connected account's email from Google.");

  await db.googleDriveConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      status: "CONNECTED",
      connectedEmail: data.email,
      refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
      connectedById: connectedByUserId,
      connectedAt: new Date(),
    },
    update: {
      status: "CONNECTED",
      connectedEmail: data.email,
      refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
      connectedById: connectedByUserId,
      connectedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });

  const drive = google.drive({ version: "v3", auth: client });
  await ensureFolderStructure(drive);

  return { email: data.email };
}

/** Disconnects without touching a single file already in Drive. */
export async function disconnectGoogleDriveAccount() {
  await db.googleDriveConnection.updateMany({
    where: { id: CONNECTION_ID },
    data: {
      status: "DISCONNECTED",
      refreshTokenEncrypted: null,
      // Folder IDs are deliberately kept — reconnecting the same
      // account later reuses them instead of creating duplicate
      // PROGGAA/ folder trees.
    },
  });
}

async function getConnection() {
  const connection = await db.googleDriveConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!connection || connection.status !== "CONNECTED" || !connection.refreshTokenEncrypted) {
    throw new DriveNotConnectedError();
  }
  return connection;
}

/**
 * Returns an authenticated Drive client for the one connected account.
 * Also marks the connection ERROR (rather than leaving a stale
 * "Connected" badge on the admin page) if the refresh token turns out
 * to be revoked/invalid — the most common real-world failure mode for
 * a long-lived server-side OAuth connection.
 */
async function getAuthorizedDrive(): Promise<{ drive: drive_v3.Drive; connectionId: string }> {
  const connection = await getConnection();
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(connection.refreshTokenEncrypted!) });

  try {
    await client.getAccessToken();
  } catch (err) {
    await db.googleDriveConnection.update({
      where: { id: CONNECTION_ID },
      data: {
        status: "ERROR",
        lastErrorAt: new Date(),
        lastErrorMessage: "Google rejected the stored refresh token — reconnect required.",
      },
    });
    throw new DriveNotConnectedError();
  }

  return { drive: google.drive({ version: "v3", auth: client }), connectionId: connection.id };
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null
): Promise<string> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(" and ");

  const existing = await drive.files.list({ q, fields: "files(id, name)", pageSize: 1 });
  const found = existing.data.files?.[0];
  if (found?.id) return found.id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`Failed to create Drive folder "${name}".`);
  return created.data.id;
}

/**
 * Idempotent: reuses existing folder IDs from the DB if already
 * recorded, otherwise searches Drive by name before creating — so
 * disconnecting and reconnecting the same account never produces a
 * second PROGGAA/ tree.
 */
export async function ensureFolderStructure(drive: drive_v3.Drive) {
  const connection = await db.googleDriveConnection.findUniqueOrThrow({ where: { id: CONNECTION_ID } });

  const rootFolderId =
    connection.rootFolderId ?? (await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null));

  const updates: Record<string, string> = { rootFolderId };
  for (const [context, folderName] of Object.entries(CATEGORY_FOLDER_NAME)) {
    const dbField = CATEGORY_FOLDER_DB_FIELD[context as keyof typeof CATEGORY_FOLDER_DB_FIELD];
    const existingId = connection[dbField as keyof typeof connection] as string | null;
    updates[dbField] = existingId ?? (await findOrCreateFolder(drive, folderName, rootFolderId));
  }

  await db.googleDriveConnection.update({ where: { id: CONNECTION_ID }, data: updates });
  return updates;
}

export async function uploadToDrive({
  context,
  buffer,
  filename,
  mimeType,
}: {
  context: Exclude<UploadContext, "LESSON_RESOURCE">;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<{ driveFileId: string; size: number }> {
  const { drive } = await getAuthorizedDrive();
  const connection = await db.googleDriveConnection.findUniqueOrThrow({ where: { id: CONNECTION_ID } });
  const dbField = CATEGORY_FOLDER_DB_FIELD[context];
  const folderId = connection[dbField as keyof typeof connection] as string | null;
  if (!folderId) {
    // Folder structure predates this category, or was never fully
    // created — repair it once rather than failing the upload.
    await ensureFolderStructure(drive);
    return uploadToDrive({ context, buffer, filename, mimeType });
  }

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, size",
  });
  if (!res.data.id) throw new Error("Google Drive upload did not return a file ID.");

  return { driveFileId: res.data.id, size: Number(res.data.size ?? buffer.length) };
}

export async function deleteFromDrive(driveFileId: string) {
  const { drive } = await getAuthorizedDrive();
  await drive.files.delete({ fileId: driveFileId });
}

export async function streamFromDrive(driveFileId: string) {
  const { drive } = await getAuthorizedDrive();
  const [meta, media] = await Promise.all([
    drive.files.get({ fileId: driveFileId, fields: "name, mimeType, size" }),
    drive.files.get({ fileId: driveFileId, alt: "media" }, { responseType: "stream" }),
  ]);
  return {
    // googleapis types this as `any` internally for responseType:
    // "stream", but it's actually a Node.js Readable at runtime — the
    // caller (api/files/[uploadId]) converts it to a Web ReadableStream
    // via Readable.toWeb() before handing it to NextResponse.
    stream: media.data as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? driveFileId,
    size: meta.data.size ? Number(meta.data.size) : undefined,
  };
}

/**
 * `storageQuota.limit` is absent from Google's response entirely for
 * accounts on unlimited-storage plans — callers must treat a missing
 * limit as "unknown", never coerce it to 0 or Infinity, and the admin
 * UI must label anything derived from this as approximate rather than
 * implying byte-for-byte precision Drive itself doesn't promise.
 */
export async function getDriveQuota(): Promise<{
  usageBytes: number | null;
  limitBytes: number | null;
}> {
  const { drive } = await getAuthorizedDrive();
  const { data } = await drive.about.get({ fields: "storageQuota" });
  const quota = data.storageQuota;
  return {
    usageBytes: quota?.usage ? Number(quota.usage) : null,
    limitBytes: quota?.limit ? Number(quota.limit) : null,
  };
}

export async function isDriveConnected(): Promise<boolean> {
  const connection = await db.googleDriveConnection.findUnique({ where: { id: CONNECTION_ID } });
  return connection?.status === "CONNECTED";
}
