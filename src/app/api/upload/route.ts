import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { uploadUserFile } from "@/lib/storage";
import type { UploadContext } from "@prisma/client";

// CERTIFICATE is deliberately excluded — certificate PDFs are generated
// and stored server-side only (lib/certificate/issue-certificate.ts),
// never uploaded directly by a client.
const CLIENT_UPLOADABLE_CONTEXTS: UploadContext[] = [
  "AVATAR",
  "ASSIGNMENT_SUBMISSION",
  "COMMUNITY_IMAGE",
  "OTHER",
];

/**
 * Replaces the UploadThing client widget for the Drive-eligible
 * categories (avatar, assignment submission, community image, other).
 * LESSON_RESOURCE uploads are untouched and keep going straight through
 * the existing /api/uploadthing route — this endpoint doesn't accept
 * that context at all.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user || !user.isActive || user.isSuspended) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const context = form.get("context");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (typeof context !== "string" || !CLIENT_UPLOADABLE_CONTEXTS.includes(context as UploadContext)) {
    return NextResponse.json({ error: "Invalid upload context." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadUserFile({
      uploaderId: user.id,
      context: context as Exclude<UploadContext, "LESSON_RESOURCE">,
      buffer,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
    // Message is already a user-safe string (assertUploadAllowed / the
    // storage layer only ever throw human-readable text here) — never
    // leak stack traces or provider error internals to the client.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
