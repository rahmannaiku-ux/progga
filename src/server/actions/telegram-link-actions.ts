import { db } from "@/lib/db/client";
import { Prisma, type Role } from "@prisma/client";
import { generateRawLinkToken, newTokenExpiry, hashToken, isTokenUsable } from "@/lib/telegram-link/token-crypto";
import { checkRateLimit } from "@/lib/rate-limit";

export class TelegramLinkError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_TOKEN"
      | "EXPIRED_TOKEN"
      | "USED_TOKEN"
      | "TELEGRAM_ALREADY_LINKED"
      | "USER_ALREADY_LINKED"
      | "RATE_LIMITED"
  ) {
    super(message);
  }
}

/**
 * Creates a new one-time link token for an already-authenticated
 * Proggaa user (Clerk session verified by the caller). Rate-limited per
 * user so a compromised or scripted session can't mint an unbounded
 * number of tokens.
 */
export async function createLinkToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const rl = await checkRateLimit("strict", `telegram-link-token:${userId}`);
  if (!rl.success) {
    throw new TelegramLinkError("Too many link codes requested — please wait a minute and try again.", "RATE_LIMITED");
  }

  const raw = generateRawLinkToken();
  const expiresAt = newTokenExpiry();

  await db.telegramLinkToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt },
  });

  return { token: raw, expiresAt };
}

/**
 * Redeems a raw token on behalf of a specific Telegram id — the core of
 * PHASE 1. Called only from the bot-facing, API-key-authenticated
 * route; the raw token itself is the proof of account ownership here,
 * not a Clerk session (the whole point is that the bot never sees a
 * Proggaa password or session).
 */
export async function consumeLinkToken(
  rawToken: string,
  telegramId: string
): Promise<{ proggaaUserId: string; role: Role }> {
  const tokenHash = hashToken(rawToken);
  const tokenRow = await db.telegramLinkToken.findUnique({ where: { tokenHash } });

  if (!tokenRow) throw new TelegramLinkError("This code isn't valid.", "INVALID_TOKEN");
  if (tokenRow.usedAt) throw new TelegramLinkError("This code has already been used.", "USED_TOKEN");
  if (!isTokenUsable(tokenRow)) throw new TelegramLinkError("This code has expired — generate a new one.", "EXPIRED_TOKEN");

  // Everything below runs in one transaction: consuming the token and
  // creating the link must succeed or fail together, so a crash between
  // the two steps can never burn a valid token without actually linking
  // the account (or vice versa).
  return db.$transaction(async (tx) => {
    // Re-check inside the transaction — closes the race between two
    // concurrent redemptions of the exact same raw token.
    const freshToken = await tx.telegramLinkToken.findUnique({ where: { tokenHash } });
    if (!freshToken || !isTokenUsable(freshToken)) {
      throw new TelegramLinkError("This code has already been used or has expired.", "USED_TOKEN");
    }

    const [telegramOwner, userOwner] = await Promise.all([
      tx.telegramLink.findUnique({ where: { telegramId } }),
      tx.telegramLink.findUnique({ where: { userId: freshToken.userId } }),
    ]);
    if (telegramOwner && telegramOwner.userId !== freshToken.userId) {
      throw new TelegramLinkError("This Telegram account is already linked to a different Proggaa account.", "TELEGRAM_ALREADY_LINKED");
    }
    if (userOwner && userOwner.telegramId !== telegramId) {
      throw new TelegramLinkError("This Proggaa account already has a different Telegram account linked. Unlink it first.", "USER_ALREADY_LINKED");
    }

    // Claim the token atomically (updateMany + count check — same
    // pattern as payment verification's race guard) so two simultaneous
    // redemption attempts can't both succeed.
    const claim = await tx.telegramLinkToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new TelegramLinkError("This code has already been used.", "USED_TOKEN");
    }

    const link = await tx.telegramLink
      .upsert({
        where: { userId: freshToken.userId },
        create: { userId: freshToken.userId, telegramId },
        update: { telegramId },
        include: { user: { select: { role: true } } },
      })
      .catch((err) => {
        // Closes the residual race the two findUnique checks above don't
        // fully cover: two different users redeeming two different valid
        // tokens for the SAME telegramId at nearly the same instant can
        // both pass the telegramOwner/userOwner reads under READ
        // COMMITTED before either commits. The upsert above keys on
        // userId, not telegramId, so the DB's unique constraint on
        // TelegramLink.telegramId is the actual backstop here — the
        // loser hits a P2002 violation, which must be translated into
        // the same clean, expected error the pre-check above already
        // produces for the non-concurrent case, not left to bubble up as
        // a raw 500.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TelegramLinkError(
            "This Telegram account is already linked to a different Proggaa account.",
            "TELEGRAM_ALREADY_LINKED"
          );
        }
        throw err;
      });

    return { proggaaUserId: link.userId, role: link.user.role };
  });
}

/** Bot-facing lookup: does this Telegram id have a linked account? */
export async function getLinkedAccountByTelegramId(telegramId: string) {
  const link = await db.telegramLink.findUnique({
    where: { telegramId },
    include: { user: { select: { id: true, role: true, isActive: true, isSuspended: true } } },
  });
  if (!link || !link.user.isActive || link.user.isSuspended) return null;
  return { proggaaUserId: link.user.id, role: link.user.role };
}

/** Website-facing lookup: is this Proggaa user's Telegram currently linked? */
export async function getLinkStatusForUser(userId: string) {
  const link = await db.telegramLink.findUnique({ where: { userId } });
  return link ? { linked: true as const, telegramId: link.telegramId, linkedAt: link.linkedAt } : { linked: false as const };
}

export async function unlinkByTelegramId(telegramId: string): Promise<void> {
  await db.telegramLink.deleteMany({ where: { telegramId } });
}

export async function unlinkByUserId(userId: string): Promise<void> {
  await db.telegramLink.deleteMany({ where: { userId } });
}
