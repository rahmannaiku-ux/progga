import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

export type InstitutionHit = {
  eiin: string;
  name: string;
  type: string;
  district: string | null;
  thana: string | null;
};

/** Same normalisation as the migration that loaded the list: lowercase, letters and digits only. */
export function normalizeInstitutionQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Suggestions for the college field: by EIIN when the student types digits, otherwise by name
 * (every word must appear). Colleges come first since students here are HSC level, then names
 * that start with what was typed.
 */
export async function searchInstitutions(rawQuery: string, limit = 8): Promise<InstitutionHit[]> {
  const q = normalizeInstitutionQuery(rawQuery).slice(0, 80);
  if (q.length < 2) return [];
  const take = Math.min(Math.max(limit, 1), 20);

  if (/^\d+$/.test(q)) {
    return db.$queryRaw<InstitutionHit[]>`
      SELECT "eiin", "name", "type", "district", "thana" FROM "Institution"
      WHERE "eiin" LIKE ${q + "%"}
      ORDER BY ("eiin" = ${q}) DESC, "eiin"
      LIMIT ${take}`;
  }

  const words = q.split(" ").filter(Boolean).slice(0, 6);
  const conditions = words.map((w) => Prisma.sql`"searchName" LIKE ${"%" + w + "%"}`);
  return db.$queryRaw<InstitutionHit[]>`
    SELECT "eiin", "name", "type", "district", "thana" FROM "Institution"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY
      ("searchName" = ${q}) DESC,
      ("type" IN ('College', 'School and College')) DESC,
      ("searchName" LIKE ${q + "%"}) DESC,
      length("name"),
      "name"
    LIMIT ${take}`;
}
