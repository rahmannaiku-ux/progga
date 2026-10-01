import Link from "next/link";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { formatDhakaDateTime } from "@/lib/timezone";
import { CoMentorRequestActions } from "@/components/admin-dashboard/co-mentor-request-actions";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";

const nameOf = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Admin: approve or decline mentors' requests to share a mission with another mentor. */
export default async function AdminCoMentorRequestsPage() {
  await requireRole("ADMIN");

  const [pending, recent] = await Promise.all([
    db.courseTeacherRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        course: { select: { id: true, title: true, teacher: { select: { firstName: true, lastName: true } } } },
        teacher: { select: { firstName: true, lastName: true, email: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    db.courseTeacherRequest.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 15,
      include: {
        course: { select: { title: true } },
        teacher: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <StaggerContainer className="mx-auto max-w-3xl space-y-6">
      <StaggerItem>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Co-mentor requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A mission's main mentor can ask for another mentor to share it. Approving gives that mentor the same
          access to the mission: editing, grading, live classes and its students. You can also add a mentor
          directly from a mission's Team page.
        </p>
      </StaggerItem>

      <StaggerItem as="section" className="space-y-3">
        <h2 className="font-display text-sm font-bold text-foreground">Waiting for you ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="comic-panel bg-surface p-6 text-sm text-muted-foreground">Nothing waiting. All caught up.</p>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="comic-panel space-y-3 bg-surface p-4">
              <div>
                <p className="font-display text-sm font-bold text-foreground">{r.course.title}</p>
                <p className="mt-1 text-sm text-foreground">
                  Add <span className="font-semibold">{nameOf(r.teacher)}</span>
                  {r.roleLabel ? ` as ${r.roleLabel}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Main mentor: {nameOf(r.course.teacher)} · asked by {nameOf(r.requestedBy)} ·{" "}
                  {formatDhakaDateTime(r.createdAt)}
                </p>
              </div>
              <CoMentorRequestActions requestId={r.id} />
              <Link
                href={`/admin/missions/${r.course.id}/team`}
                className="inline-block text-xs font-semibold text-primary hover:text-primary/80"
              >
                Open the mission's team →
              </Link>
            </div>
          ))
        )}
      </StaggerItem>

      {recent.length > 0 && (
        <StaggerItem as="section" className="space-y-2">
          <h2 className="font-display text-sm font-bold text-foreground">Recently reviewed</h2>
          {recent.map((r) => (
            <div key={r.id} className="comic-panel flex items-center justify-between gap-3 bg-surface p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {nameOf(r.teacher)} · {r.course.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.reviewedBy ? `by ${nameOf(r.reviewedBy)}` : ""}
                  {r.reviewedAt ? ` · ${formatDhakaDateTime(r.reviewedAt)}` : ""}
                  {r.status === "REJECTED" && r.rejectionReason ? ` · ${r.rejectionReason}` : ""}
                </p>
              </div>
              <span
                className={`sticker shrink-0 px-2.5 py-0.5 text-xs font-bold ${
                  r.status === "APPROVED" ? "bg-accent/20 text-accent" : "bg-danger/15 text-danger"
                }`}
              >
                {r.status === "APPROVED" ? "Approved" : "Declined"}
              </span>
            </div>
          ))}
        </StaggerItem>
      )}
    </StaggerContainer>
  );
}
