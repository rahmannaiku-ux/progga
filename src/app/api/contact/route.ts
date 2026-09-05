import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/sanitize-html";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  message: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const rl = await checkRateLimit("write", ip);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many messages — try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in every field with a valid email." }, { status: 400 });
  }
  const { name, email, message } = parsed.data;

  const settings = await db.siteSettings.findUnique({ where: { id: "singleton" } });
  const supportEmail = settings?.supportEmail || process.env.EMAIL_FROM || null;

  if (!resend || !supportEmail) {
    // No email provider or no support address configured — log it so
    // it isn't silently lost, and tell the caller honestly rather than
    // pretending success.
    console.log(`[contact:undeliverable] from=${name} <${email}>: ${message}`);
    return NextResponse.json(
      { error: "Messaging isn't fully configured yet — please try again later." },
      { status: 503 }
    );
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Proggaa <no-reply@proggaa.example>",
      to: supportEmail,
      reply_to: email,
      subject: `Contact form: ${name}`,
      html: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
    });
  } catch (err) {
    console.error("Failed to send contact form email:", err);
    return NextResponse.json({ error: "Couldn't send your message — please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
