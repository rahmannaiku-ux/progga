import { NextRequest, NextResponse } from "next/server";
import { getCurrentActiveSessionUser } from "@/lib/auth/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { cleanAdValues, findAdTemplate, isAdPhoto, isAdPose, AD_PHOTO_MAX_CHARS } from "@/lib/ad-studio/catalog";
import { renderAd } from "@/lib/ad-studio/render";

export const dynamic = "force-dynamic";

/**
 * Ad Studio: draws one ad template as a PNG (Admin -> Ad Studio). Admins and
 * super admins only; the body is { template, values, pose?, photo? } where
 * photo is a PNG/JPEG data URL. Nothing is stored: the image goes straight
 * back to the browser.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentActiveSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rl = await checkRateLimit("api", user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many previews. Wait a moment." }, { status: 429 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > AD_PHOTO_MAX_CHARS + 50_000) {
    return NextResponse.json({ error: "That photo is too big. Use one under 3 MB." }, { status: 413 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const template = findAdTemplate(body?.template);
  if (!body || !template) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const pose = isAdPose(body.pose) ? body.pose : null;
  let photo: string | null = null;
  if (template.photo && body.photo != null && body.photo !== "") {
    if (!isAdPhoto(body.photo)) {
      return NextResponse.json({ error: "The photo must be a PNG or JPEG under 3 MB." }, { status: 400 });
    }
    photo = body.photo;
  }

  try {
    const image = renderAd(template, cleanAdValues(template, body.values), pose, photo);
    const png = await image.arrayBuffer();
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="prooggaa-${template.id}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(`Ad Studio could not draw ${template.id}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't draw this ad. Try a different photo or shorter text." }, { status: 500 });
  }
}
