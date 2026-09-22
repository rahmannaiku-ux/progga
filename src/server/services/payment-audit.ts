import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AuditEntry {
  event: string;
  actor: string; // "device:<id>" | "user:<id>" | "system"
  paymentId?: string | null;
  transactionId?: string | null; // PaymentTransaction.id
  deviceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only. Pass `client` to write inside an existing database
 * transaction so the audit row commits/rolls back with the state change it
 * describes (spec §31).
 */
export async function writeAudit(entry: AuditEntry, client: Tx = db) {
  return client.paymentAuditLog.create({
    data: {
      event: entry.event,
      actor: entry.actor,
      paymentId: entry.paymentId ?? null,
      transactionId: entry.transactionId ?? null,
      deviceId: entry.deviceId ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
}
