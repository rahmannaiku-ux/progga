"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/payments/format";
import {
  adminSwitchMissionAction,
  lookupStudentForSwitchAction,
  rejectMissionSwitchAction,
  type SwitchLookup,
} from "@/server/actions/course-migration-actions";

const field =
  "h-11 w-full rounded-xl border border-border/60 bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none";

/** Approve (charging or waiving the difference) or reject one student request. */
export function SwitchRequestDecision({
  requestId,
  userId,
  fromCourseId,
  toCourseId,
  hasDifference,
}: {
  requestId: string;
  userId: string;
  fromCourseId: string;
  toCourseId: string;
  hasDifference: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve(waiveFee: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await adminSwitchMissionAction({ userId, fromCourseId, toCourseId, waiveFee, note: note || null, requestId });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }
  function reject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectMissionSwitchAction(requestId, note);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the student (optional)" maxLength={1000} className={field} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => approve(false)}>
          {hasDifference ? "Approve, student pays difference" : "Approve"}
        </Button>
        {hasDifference && (
          <Button type="button" size="sm" variant="accent" disabled={isPending} onClick={() => approve(true)}>
            Approve free
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={reject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

type Course = { id: string; title: string; priceCents: number; isFree: boolean };

/** Find a student by phone, pick the mission they leave and the one they join. */
export function AdminSwitchForm({ courses, initialQuery }: { courses: Course[]; initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [found, setFound] = useState<Extract<SwitchLookup, { ok: true }> | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function lookup(q = query) {
    setMessage(null);
    setFound(null);
    startTransition(async () => {
      const r = await lookupStudentForSwitchAction(q);
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setFound(r);
      setFromId(r.enrollments[0]?.courseId ?? "");
      setToId("");
    });
  }

  useEffect(() => {
    if (initialQuery) lookup(initialQuery);
    // Only on first load, for links from a student's page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const from = found?.enrollments.find((e) => e.courseId === fromId);
  const to = courses.find((c) => c.id === toId);
  const ownedIds = new Set(found?.enrollments.map((e) => e.courseId));
  const fromValue = from ? (from.isFree ? 0 : from.priceCents) : 0;
  const difference = to && from ? Math.max(0, (to.isFree ? 0 : to.priceCents) - fromValue) : 0;

  function submit() {
    if (!found || !from || !to) return;
    setMessage(null);
    startTransition(async () => {
      const r = await adminSwitchMissionAction({
        userId: found.student.id,
        fromCourseId: from.courseId,
        toCourseId: to.id,
        waiveFee: waive,
        note: note || null,
      });
      if (!r.ok) {
        setMessage({ kind: "error", text: r.error });
        return;
      }
      setMessage({
        kind: "ok",
        text:
          r.status === "COMPLETED"
            ? `Done. ${found.student.name} is now in ${to.title}.`
            : `${found.student.name} has been asked to pay the difference. The switch finishes when that payment is verified.`,
      });
      router.refresh();
      lookup(query);
    });
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Student phone (01XXXXXXXXX) or @username" className={field} />
        <Button type="submit" variant="outline" disabled={isPending || !query.trim()}>
          Find
        </Button>
      </form>

      {found && (
        <div className="space-y-3 rounded-xl border border-border/40 p-3">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{found.student.name}</span> · {found.student.phone} ·{" "}
            <span className="text-muted-foreground">own switch {found.selfSwitchesUsed > 0 ? "used" : "not used yet"}</span>
          </p>
          {found.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">This student isn&apos;t enrolled in any mission.</p>
          ) : (
            <>
              <label className="block text-xs font-semibold text-muted-foreground">
                Leaves
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={`${field} mt-1`}>
                  {found.enrollments.map((e) => (
                    <option key={e.courseId} value={e.courseId}>
                      {e.title} ({e.isFree ? "free" : formatMoney(e.priceCents)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">
                Joins
                <select value={toId} onChange={(e) => setToId(e.target.value)} className={`${field} mt-1`}>
                  <option value="">Pick a mission</option>
                  {courses
                    .filter((c) => !ownedIds.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.isFree ? "free" : formatMoney(c.priceCents)})
                      </option>
                    ))}
                </select>
              </label>
              {to && (
                <p className="text-sm text-foreground">
                  {difference > 0 ? `Difference at list prices: ${formatMoney(difference)}` : "No difference to pay."}
                </p>
              )}
              {difference > 0 && (
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} className="h-4 w-4" />
                  Waive the difference (switch for free)
                </label>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={1000} className={field} />
              <Button type="button" disabled={isPending || !from || !to} onClick={submit}>
                {isPending ? "Working..." : "Switch mission"}
              </Button>
            </>
          )}
        </div>
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-accent"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
