import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { mediaSrc } from "@/lib/media-url";
import { SELF_SWITCH_LIMIT } from "@/lib/course-migration/rules";
import { countSelfSwitches, findOpenSwitch, listSwitchTargets } from "@/server/services/course-migration";
import { MissionSwitchPicker } from "@/components/missions/mission-switch-picker";
import { OpenSwitchCard } from "@/components/missions/open-switch-card";
import { formatMoney } from "@/lib/payments/format";

export const metadata = { title: "Switch mission — Proggaa" };

export default async function SwitchMissionPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const user = await getCurrentUser();

  const course = await db.course.findUnique({ where: { slug }, select: { id: true } });
  if (!course) notFound();
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: course.id } },
    select: { id: true },
  });
  if (!enrollment) notFound();

  const [data, selfSwitches, open] = await Promise.all([
    listSwitchTargets(user.id, course.id),
    countSelfSwitches(user.id),
    findOpenSwitch(user.id),
  ]);
  if (!data) notFound();

  const usedOwnSwitch = selfSwitches >= SELF_SWITCH_LIMIT;
  const fromIsFree = data.from.isFree || data.from.priceCents <= 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/my-courses" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My Courses
      </Link>

      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
          <ArrowRightLeft className="h-6 w-6 text-accent" aria-hidden="true" /> Switch mission
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Move from <span className="font-semibold text-foreground">{data.from.title}</span> to another mission. If the new
          one costs the same or less, the switch is free. If it costs more, you pay only the difference.
        </p>
      </header>

      <dl className="comic-panel grid gap-4 bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">You&apos;re leaving</dt>
          <dd className="mt-0.5 font-display font-bold text-foreground">{data.from.title}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Its value</dt>
          <dd className="mt-0.5 font-mono font-bold text-foreground">{fromIsFree ? "Free" : formatMoney(data.from.priceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Your own switch</dt>
          <dd className="mt-0.5 font-bold text-foreground">{usedOwnSwitch ? "Used. Further switches go through an admin" : "1 available"}</dd>
        </div>
      </dl>

      {open ? (
        <OpenSwitchCard
          migration={{
            id: open.id,
            status: open.status,
            fromCourseTitle: open.fromCourseTitle,
            toCourseTitle: open.toCourseTitle,
            differenceCents: open.differenceCents,
            paymentId: open.payment?.id ?? null,
            paymentStatus: open.payment?.status ?? null,
          }}
        />
      ) : fromIsFree ? (
        <p className="comic-panel bg-surface p-4 text-sm text-muted-foreground">
          This mission is free, so there&apos;s nothing to switch. Join the other mission from the{" "}
          <Link href="/courses" className="font-semibold text-accent hover:underline">catalog</Link> instead.
        </p>
      ) : (
        <MissionSwitchPicker
          fromCourseId={data.from.id}
          mode={usedOwnSwitch ? "request" : "self"}
          targets={data.targets.map(({ course: c, quote }) => ({
            id: c.id,
            title: c.title,
            category: c.category?.name ?? null,
            thumb: mediaSrc(c.thumbnailUrl, 400),
            priceCents: quote.to.priceCents,
            differenceCents: quote.differenceCents,
          }))}
        />
      )}
    </div>
  );
}
