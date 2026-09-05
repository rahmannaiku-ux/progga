import { Store } from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import {
  createStoreItem,
  toggleStoreItemPublished,
  deleteStoreItem,
  adjustStudentCoins,
} from "@/server/actions/coin-admin-actions";
import { ConfirmDeleteButton } from "@/components/mentor-dashboard/confirm-delete-button";

export default async function AdminStorePage() {
  await requireRole("ADMIN");

  const [items, recentPurchases, recentTransactions, purchaseStats] = await Promise.all([
    db.coinStoreItem.findMany({ orderBy: { createdAt: "desc" } }),
    db.coinPurchase.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true } }, item: { select: { title: true } } },
    }),
    db.proggyCoinTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true } } },
    }),
    db.coinPurchase.groupBy({
      by: ["itemId"],
      _count: { itemId: true },
      _sum: { coinsSpent: true },
    }),
  ]);

  const statsByItemId = new Map<string, { count: number; coinsTotal: number }>();
  for (const row of purchaseStats) {
    statsByItemId.set(row.itemId, {
      count: row._count.itemId,
      coinsTotal: row._sum.coinsSpent ?? 0,
    });
  }

  const itemsByPopularity = [...items].sort((a, b) => {
    const countA = statsByItemId.get(a.id)?.count ?? 0;
    const countB = statsByItemId.get(b.id)?.count ?? 0;
    return countB - countA;
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <Store className="h-6 w-6" /> Proggy Store
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage what students can spend Proggy Coins on.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">
          Items <span className="font-normal text-muted-foreground">(sorted by popularity)</span>
        </h2>
        <div className="space-y-2">
          {itemsByPopularity.map((item) => {
            const stats = statsByItemId.get(item.id) ?? { count: 0, coinsTotal: 0 };
            return (
            <div key={item.id} className="glass-panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.title} — 🪙{item.priceCoins}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.type} {!item.isPublished && "· Unpublished"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stats.count} purchased · {stats.coinsTotal} coins earned
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <form action={toggleStoreItemPublished.bind(null, item.id, !item.isPublished)}>
                  <button type="submit" className="text-xs font-medium text-muted-foreground hover:text-foreground">
                    {item.isPublished ? "Unpublish" : "Publish"}
                  </button>
                </form>
                <ConfirmDeleteButton
                  action={deleteStoreItem.bind(null, item.id)}
                  confirmMessage={`Delete "${item.title}"?`}
                />
              </div>
            </div>
            );
          })}
          {items.length === 0 && <p className="text-sm text-muted-foreground">No store items yet.</p>}
        </div>
      </div>

      <div className="glass-panel p-5">
        <h2 className="font-display text-sm font-bold text-foreground">New item</h2>
        <form action={createStoreItem} className="mt-3 space-y-3">
          <input
            name="title"
            required
            placeholder="Title"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Description"
            className="w-full rounded-lg border border-border/60 bg-surface px-3 py-2 text-base text-foreground"
          />
          <select
            name="type"
            required
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          >
            <option value="PDF">PDF</option>
            <option value="EXCLUSIVE_CLASS">Exclusive Class</option>
            <option value="STICKER">Sticker</option>
          </select>
          <input
            name="resourceUrl"
            placeholder="PDF resource URL (for PDF items) or sticker image path (for Sticker items)"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <input
            name="lessonId"
            placeholder="Lesson ID to unlock (for Exclusive Class items)"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <input
            name="thumbnailUrl"
            type="url"
            placeholder="Thumbnail URL (optional)"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Price (coins)
              <input
                type="number"
                name="priceCoins"
                min={1}
                required
                className="h-9 w-24 rounded-lg border border-border/60 bg-surface px-2 text-base text-foreground md:text-sm"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <input type="checkbox" name="isPublished" defaultChecked /> Published
            </label>
          </div>
          <button
            type="submit"
            className="comic-btn h-10 w-full bg-primary text-sm font-bold text-primary-foreground"
          >
            Create item
          </button>
        </form>
      </div>

      <div className="glass-panel p-5">
        <h2 className="font-display text-sm font-bold text-foreground">Manual coin adjustment</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Always creates a ledger transaction with the reason you give — never a silent balance
          edit.
        </p>
        <form action={adjustStudentCoins} className="mt-3 space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="student@example.com"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <input
            type="number"
            name="amount"
            required
            placeholder="Amount (negative to deduct)"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <input
            name="reason"
            required
            placeholder="Reason (required)"
            className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground"
          />
          <button
            type="submit"
            className="comic-btn h-10 w-full bg-accent text-sm font-bold text-accent-foreground"
          >
            Apply adjustment
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent Purchases</h2>
        <div className="space-y-2">
          {recentPurchases.map((p) => (
            <div key={p.id} className="glass-panel flex items-center justify-between p-3.5 text-sm">
              <span className="text-foreground">
                {p.user.email} → {p.item.title}
              </span>
              <span className="font-mono text-muted-foreground">🪙{p.coinsSpent}</span>
            </div>
          ))}
          {recentPurchases.length === 0 && (
            <p className="text-sm text-muted-foreground">No purchases yet.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Recent Transactions</h2>
        <div className="space-y-2">
          {recentTransactions.map((t) => (
            <div key={t.id} className="glass-panel flex items-center justify-between p-3.5 text-sm">
              <span className="text-foreground">
                {t.user.email} — {t.reason}
              </span>
              <span
                className={"font-mono font-bold " + (t.amount >= 0 ? "text-accent" : "text-danger")}
              >
                {t.amount >= 0 ? "+" : ""}
                {t.amount}
              </span>
            </div>
          ))}
          {recentTransactions.length === 0 && (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
