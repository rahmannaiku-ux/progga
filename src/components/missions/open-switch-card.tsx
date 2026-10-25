"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/payments/format";
import { cancelMissionSwitchAction } from "@/server/actions/course-migration-actions";

export type OpenSwitch = {
  id: string;
  status: "REQUESTED" | "AWAITING_PAYMENT" | "COMPLETED" | "CANCELLED" | "REJECTED";
  fromCourseTitle: string;
  toCourseTitle: string;
  differenceCents: number;
  paymentId: string | null;
  paymentStatus: string | null;
};

/** A switch that is still waiting: on an admin, or on the price difference being paid. */
export function OpenSwitchCard({ migration }: { migration: OpenSwitch }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const beingChecked = migration.paymentStatus === "AWAITING_VERIFICATION";

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMissionSwitchAction(migration.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="comic-panel border-xp/60 bg-surface p-4" aria-label="Mission switch in progress">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <ArrowRightLeft className="h-4 w-4 text-accent" aria-hidden="true" /> Switch in progress
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {migration.fromCourseTitle} → <span className="font-semibold text-foreground">{migration.toCourseTitle}</span>
      </p>
      <p className="mt-2 text-sm text-foreground">
        {migration.status === "REQUESTED"
          ? "Waiting for an admin to look at your request."
          : beingChecked
            ? `Your payment of ${formatMoney(migration.differenceCents)} is being checked. The switch finishes once it's verified.`
            : `Pay the difference of ${formatMoney(migration.differenceCents)} to finish the switch.`}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {migration.status === "AWAITING_PAYMENT" && migration.paymentId && (
          <Button asChild size="sm">
            <Link href={`/payments/${migration.paymentId}`}>{beingChecked ? "View payment" : "Pay now"}</Link>
          </Button>
        )}
        {!beingChecked && (
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={cancel}>
            {isPending ? "Cancelling..." : "Cancel switch"}
          </Button>
        )}
      </div>
    </section>
  );
}
