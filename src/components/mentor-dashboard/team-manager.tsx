"use client";

import { useState, useTransition } from "react";
import { Clock, UserMinus, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/avatar";
import {
  addCourseTeacher,
  cancelCourseTeacherRequest,
  removeCourseTeacher,
  type TeamResult,
} from "@/server/actions/course-team-actions";

type Person = { id: string; firstName: string; lastName: string; avatarUrl: string | null; headline: string | null };

type CoTeacherRow = {
  id: string; // CourseTeacher row id
  roleLabel: string | null;
  teacher: Person;
};

type RequestRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  roleLabel: string | null;
  rejectionReason: string | null;
  teacher: Person;
};

type EligibleTeacher = { id: string; firstName: string; lastName: string; email: string | null };

export function TeamManager({
  courseId,
  primaryTeacher,
  coTeachers,
  requests,
  eligibleTeachers,
  canManage,
  isAdmin,
  currentUserId,
}: {
  courseId: string;
  primaryTeacher: Omit<Person, "id">;
  coTeachers: CoTeacherRow[];
  requests: RequestRow[];
  eligibleTeachers: EligibleTeacher[];
  /** Main mentor or admin: may ask for / remove mentors. */
  canManage: boolean;
  isAdmin: boolean;
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Main mentor</p>
        <div className="mt-3 flex items-center gap-3">
          <Avatar
            src={primaryTeacher.avatarUrl}
            name={`${primaryTeacher.firstName} ${primaryTeacher.lastName}`}
            size={48}
            className="h-12 w-12"
          />
          <div>
            <p className="font-semibold text-foreground">
              {primaryTeacher.firstName} {primaryTeacher.lastName}
            </p>
            {primaryTeacher.headline && <p className="text-xs text-muted-foreground">{primaryTeacher.headline}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-sm font-bold text-foreground">Co-mentors ({coTeachers.length})</h2>
        {coTeachers.length === 0 ? (
          <p className="glass-panel p-5 text-sm text-muted-foreground">
            No co-mentors yet. Co-mentors can edit this mission, grade its work and run its live classes.
          </p>
        ) : (
          coTeachers.map((ct) => (
            <CoTeacherRowView
              key={ct.id}
              courseId={courseId}
              row={ct}
              canRemove={canManage || ct.teacher.id === currentUserId}
              isSelf={ct.teacher.id === currentUserId}
            />
          ))
        )}
      </div>

      {requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-sm font-bold text-foreground">Requests</h2>
          {requests.map((r) => (
            <RequestRowView key={r.id} courseId={courseId} row={r} canCancel={canManage} />
          ))}
        </div>
      )}

      {canManage ? (
        <AddTeacherForm courseId={courseId} eligibleTeachers={eligibleTeachers} isAdmin={isAdmin} />
      ) : (
        <p className="glass-panel p-5 text-sm text-muted-foreground">
          Only the main mentor can ask for more co-mentors.
        </p>
      )}
    </div>
  );
}

function useResultRunner() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(task: () => Promise<TeamResult>, onDone?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await task();
        setMessage({ ok: res.ok, text: res.ok ? res.message : res.error });
        if (res.ok) onDone?.();
      } catch {
        setMessage({ ok: false, text: "Something went wrong. Please try again." });
      }
    });
  }

  return { isPending, message, run };
}

function CoTeacherRowView({
  courseId,
  row,
  canRemove,
  isSelf,
}: {
  courseId: string;
  row: CoTeacherRow;
  canRemove: boolean;
  isSelf: boolean;
}) {
  const { isPending, message, run } = useResultRunner();

  function handleRemove() {
    const prompt = isSelf
      ? "Leave this mission? You will lose access to it."
      : `Remove ${row.teacher.firstName} ${row.teacher.lastName} from this mission's team?`;
    if (!confirm(prompt)) return;
    run(() => removeCourseTeacher(courseId, row.id));
  }

  return (
    <div className="glass-panel flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          src={row.teacher.avatarUrl}
          name={`${row.teacher.firstName} ${row.teacher.lastName}`}
          size={40}
          className="h-10 w-10"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {row.teacher.firstName} {row.teacher.lastName}
            {isSelf && <span className="ml-1.5 text-xs font-medium text-muted-foreground">(you)</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.roleLabel ?? row.teacher.headline ?? "Co-mentor"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {message && !message.ok && <p className="text-xs font-medium text-danger">{message.text}</p>}
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
            aria-label={isSelf ? "Leave mission" : "Remove co-mentor"}
          >
            <UserMinus className="h-4 w-4 text-danger" />
          </Button>
        )}
      </div>
    </div>
  );
}

function RequestRowView({ courseId, row, canCancel }: { courseId: string; row: RequestRow; canCancel: boolean }) {
  const { isPending, message, run } = useResultRunner();
  const pending = row.status === "PENDING";

  return (
    <div className="glass-panel flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          src={row.teacher.avatarUrl}
          name={`${row.teacher.firstName} ${row.teacher.lastName}`}
          size={40}
          className="h-10 w-10"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {row.teacher.firstName} {row.teacher.lastName}
          </p>
          {pending ? (
            <p className="flex items-center gap-1 text-xs font-medium text-xp">
              <Clock className="h-3 w-3" /> Waiting for admin approval
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs font-medium text-danger">
              <XCircle className="h-3 w-3" /> Declined{row.rejectionReason ? `: ${row.rejectionReason}` : ""}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {message && !message.ok && <p className="text-xs font-medium text-danger">{message.text}</p>}
        {canCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => cancelCourseTeacherRequest(courseId, row.id))}
          >
            {pending ? "Cancel" : "Dismiss"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AddTeacherForm({
  courseId,
  eligibleTeachers,
  isAdmin,
}: {
  courseId: string;
  eligibleTeachers: EligibleTeacher[];
  isAdmin: boolean;
}) {
  const { isPending, message, run } = useResultRunner();
  const [formKey, setFormKey] = useState(0);

  if (eligibleTeachers.length === 0) {
    return (
      <p className="glass-panel p-5 text-sm text-muted-foreground">
        No other mentor accounts are available to add yet.
      </p>
    );
  }

  return (
    <form
      key={formKey}
      action={(formData) => run(() => addCourseTeacher(courseId, formData), () => setFormKey((k) => k + 1))}
      className="glass-panel space-y-3 p-5"
    >
      <h2 className="font-display text-sm font-bold text-foreground">
        {isAdmin ? "Add a co-mentor" : "Ask for a co-mentor"}
      </h2>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          An admin reviews every request. The mentor gets access once it is approved.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="teacherId"
          required
          defaultValue=""
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
        >
          <option value="" disabled>
            Choose a mentor…
          </option>
          {eligibleTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.firstName} {t.lastName}
              {t.email ? ` (${t.email})` : ""}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="roleLabel"
          placeholder="Role on this mission (optional, e.g. Lead Instructor)"
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground md:text-sm"
        />
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-xs font-medium ${message.ok ? "text-accent" : "text-danger"}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" variant="accent" size="sm" disabled={isPending}>
        <UserPlus className="h-4 w-4" />{" "}
        {isPending ? "Sending…" : isAdmin ? "Add co-mentor" : "Send request"}
      </Button>
    </form>
  );
}
