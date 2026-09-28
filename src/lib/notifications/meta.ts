import {
  Bell,
  Trophy,
  ClipboardCheck,
  MessageSquare,
  Flame,
  Rocket,
  Wallet,
  Megaphone,
  Award,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { formatDhakaDate } from "@/lib/timezone";

/**
 * Presentation for each notification type — shared by the /notifications
 * page and the top-bar bell popover so both show the same icon, colour and
 * tag for a given notification.
 */
export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { icon: LucideIcon; color: string; tag: string }
> = {
  ANNOUNCEMENT: { icon: Megaphone, color: "text-accent", tag: "Announcement" },
  GRADE_POSTED: { icon: MessageSquare, color: "text-primary", tag: "Grade" },
  ENROLLMENT: { icon: Rocket, color: "text-primary", tag: "Enrollment" },
  CERTIFICATE_ISSUED: { icon: Award, color: "text-xp", tag: "Certificate" },
  EXAM_REMINDER: { icon: ClipboardCheck, color: "text-danger", tag: "Exam" },
  ASSIGNMENT_DUE: { icon: ClipboardCheck, color: "text-accent", tag: "Assignment" },
  STREAK_RISK: { icon: Flame, color: "text-danger", tag: "Streak" },
  ACHIEVEMENT_UNLOCKED: { icon: Trophy, color: "text-xp", tag: "Achievement" },
  SYSTEM: { icon: Bell, color: "text-muted-foreground", tag: "System" },
  PAYMENT_AWAITING_VERIFICATION: { icon: Wallet, color: "text-xp", tag: "Payment" },
  PAYMENT_VERIFIED: { icon: Wallet, color: "text-accent", tag: "Payment" },
  PAYMENT_REJECTED: { icon: Wallet, color: "text-danger", tag: "Payment" },
  LIVE_CLASS_REMINDER: { icon: Video, color: "text-danger", tag: "Live class" },
};

export function notificationTimeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDhakaDate(date);
}
