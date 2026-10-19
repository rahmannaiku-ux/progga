import { NextResponse } from "next/server";
import { getSetting } from "@/lib/config/settings-service";
import type { AppPolicy } from "@/lib/apps";

export const dynamic = "force-dynamic";

/**
 * GET /api/app/config — what the website asks of the Windows and Android
 * apps (set in Admin -> Apps). Public: the apps read it before anyone signs
 * in. Read by AppUpdateGate, which asks too-old apps to update first.
 */
export async function GET() {
  const [android, windows] = await Promise.all([getSetting("apps.minVersionAndroid"), getSetting("apps.minVersionWindows")]);
  const body: AppPolicy = { minVersion: { android: String(android ?? ""), windows: String(windows ?? "") } };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
