"use server";

import { requireActiveUser } from "./require-user";
import { searchContent } from "@/server/services/search-service";

/** Live results for the top-bar command palette — a short list per type. */
export async function quickSearchAction(query: string) {
  const user = await requireActiveUser();
  return searchContent(user.id, String(query ?? ""), { take: 5 });
}
