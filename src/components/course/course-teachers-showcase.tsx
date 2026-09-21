import { Avatar } from "@/components/shared/avatar";

export type CourseTeacherEntry = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  /** Per-course label (CourseTeacher.roleLabel) if set, else the teacher's own User.headline. */
  roleLabel: string | null;
};

/**
 * "Course Teachers" section for the buying page — a row/grid of
 * circular photos, never a table. Avatar already renders
 * rounded-full + object-cover, which is what keeps every photo a
 * clean circle at a consistent size regardless of the source image's
 * own aspect ratio, without distorting faces.
 */
export function CourseTeachersShowcase({ teachers }: { teachers: CourseTeacherEntry[] }) {
  if (teachers.length === 0) return null;

  return (
    <section className="comic-panel bg-surface p-6">
      <h2 className="font-display text-lg font-extrabold text-foreground">Course Teachers</h2>
      <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {teachers.map((t) => {
          const name = `${t.firstName} ${t.lastName}`.trim();
          return (
            <div key={t.id} className="flex flex-col items-center text-center">
              <Avatar
                src={t.avatarUrl}
                name={name}
                size={88}
                className="h-[88px] w-[88px] border-2 border-border/10 text-2xl shadow-card"
              />
              <p className="mt-2.5 font-display text-sm font-bold text-foreground">{name}</p>
              {t.roleLabel && (
                <p className="mt-0.5 text-xs text-muted-foreground">{t.roleLabel}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
