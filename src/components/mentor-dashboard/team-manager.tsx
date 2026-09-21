"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/avatar";
import { addCourseTeacher, removeCourseTeacher } from "@/server/actions/course-team-actions";

type CoTeacherRow = {
  id: string; // CourseTeacher row id
  roleLabel: string | null;
  teacher: { id: string; firstName: string; lastName: string; avatarUrl: string | null; headline: string | null };
};

type EligibleTeacher = { id: string; firstName: string; lastName: string; email: string };

export function TeamManager({
  courseId,
  primaryTeacher,
  coTeachers,
  eligibleTeachers,
}: {
  courseId: string;
  primaryTeacher: { firstName: string; lastName: string; avatarUrl: string | null; headline: string | null };
  coTeachers: CoTeacherRow[];
  eligibleTeachers: EligibleTeacher[];
}) {
  return (
    <div className="space-y-6">
      <div className="glass-panel p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Primary teacher</p>
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
        <h2 className="font-display text-sm font-bold text-foreground">
          Co-teachers ({coTeachers.length})
        </h2>
        {coTeachers.length === 0 ? (
          <p className="glass-panel p-5 text-sm text-muted-foreground">
            No co-teachers yet — add one below.
          </p>
        ) : (
          coTeachers.map((ct) => <CoTeacherRow key={ct.id} courseId={courseId} row={ct} />)
        )}
      </div>

      <AddTeacherForm courseId={courseId} eligibleTeachers={eligibleTeachers} />
    </div>
  );
}

function CoTeacherRow({ courseId, row }: { courseId: string; row: CoTeacherRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    if (!confirm(`Remove ${row.teacher.firstName} ${row.teacher.lastName} from this mission's team?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeCourseTeacher(courseId, row.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
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
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.roleLabel ?? row.teacher.headline ?? "Co-teacher"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
        <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={isPending}>
          <UserMinus className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </div>
  );
}

function AddTeacherForm({ courseId, eligibleTeachers }: { courseId: string; eligibleTeachers: EligibleTeacher[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addCourseTeacher(courseId, formData);
        setFormKey((k) => k + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  if (eligibleTeachers.length === 0) {
    return (
      <p className="glass-panel p-5 text-sm text-muted-foreground">
        No other teacher accounts are available to add yet.
      </p>
    );
  }

  return (
    <form key={formKey} action={handleSubmit} className="glass-panel space-y-3 p-5">
      <h2 className="font-display text-sm font-bold text-foreground">Add a co-teacher</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="teacherId"
          required
          defaultValue=""
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
        >
          <option value="" disabled>
            Choose a teacher…
          </option>
          {eligibleTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.firstName} {t.lastName} ({t.email})
            </option>
          ))}
        </select>
        <input
          type="text"
          name="roleLabel"
          placeholder="Role on this mission (optional, e.g. Lead Instructor)"
          className="h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-sm text-foreground"
        />
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <Button type="submit" variant="accent" size="sm" disabled={isPending}>
        <UserPlus className="h-4 w-4" /> {isPending ? "Adding…" : "Add co-teacher"}
      </Button>
    </form>
  );
}
