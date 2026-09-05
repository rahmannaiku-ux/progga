import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { sendTemplatedEmail } from "@/lib/email/send-email";

/**
 * Clerk is the source of truth for *identity* (email, name, avatar);
 * our Prisma `User` table is the source of truth for *authorization*
 * (role). This webhook is the only place identity data flows from
 * Clerk into our DB — the app never trusts a role claim from Clerk
 * itself, only what's stored here.
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Clerk webhook signature verification failed", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created": {
      const u = event.data;
      const email = u.email_addresses.find(
        (e) => e.id === u.primary_email_address_id
      )?.email_address;

      if (!email) {
        return new NextResponse("User has no primary email", { status: 400 });
      }

      const alreadyExists = await db.user.findUnique({
        where: { clerkId: u.id },
        select: { id: true },
      });

      await db.user.upsert({
        where: { clerkId: u.id },
        create: {
          clerkId: u.id,
          email,
          firstName: u.first_name ?? "",
          lastName: u.last_name ?? "",
          avatarUrl: u.image_url,
          role: "STUDENT",
          studentProfile: { create: {} },
          heroStats: { create: {} },
        },
        update: {
          email,
          firstName: u.first_name ?? "",
          lastName: u.last_name ?? "",
          avatarUrl: u.image_url,
        },
      });

      if (!alreadyExists) {
        await sendTemplatedEmail(
          "welcome",
          email,
          { firstName: u.first_name ?? "there" },
          {
            subject: "Welcome to Proggaa",
            bodyHtml: "<p>Hi {{firstName}}, welcome aboard — your first mission is waiting.</p>",
          }
        );
      }
      break;
    }

    case "user.updated": {
      const u = event.data;
      const email = u.email_addresses.find(
        (e) => e.id === u.primary_email_address_id
      )?.email_address;

      await db.user.updateMany({
        where: { clerkId: u.id },
        data: {
          ...(email ? { email } : {}),
          firstName: u.first_name ?? "",
          lastName: u.last_name ?? "",
          avatarUrl: u.image_url,
        },
      });
      break;
    }

    case "user.deleted": {
      // Soft-deactivate rather than hard-delete: preserves enrollment
      // history, certificates issued, and audit logs tied to this user.
      const clerkId = event.data.id;
      if (clerkId) {
        await db.user.updateMany({
          where: { clerkId },
          data: { isActive: false },
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
