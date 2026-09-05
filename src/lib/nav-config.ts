import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Rocket,
  Trophy,
  Award,
  BarChart3,
  Calendar,
  Bell,
  User,
  Users,
  ClipboardCheck,
  Megaphone,
  Settings,
  Shield,
  FileClock,
  Mail,
  DatabaseBackup,
  Layers,
  BookOpen,
  Wallet,
  CreditCard,
  MessageCircle,
  LifeBuoy,
  HardDrive,
  Radio,
  History,
  Video,
  UserPlus,
  Coins,
  Newspaper,
  Store,
  Wrench,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Next.js prefetches every <Link> that's in viewport by default. The
   * sidebar/drawer render every nav item simultaneously, so on a page
   * with a long nav (admin especially) that's a burst of prefetch
   * requests for pages the user may never open in this session. Set
   * `false` only on items that are genuinely rarely visited utility
   * pages — leave everything else on the default (undefined = prefetch
   * enabled), since most items here ARE common destinations.
   */
  prefetch?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const heroNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "My Courses", href: "/my-courses", icon: BookOpen },
      { label: "Missions", href: "/missions", icon: Rocket },
      { label: "Live Classes", href: "/live-classes", icon: Video },
      { label: "Proggy Store", href: "/store", icon: Store },
      { label: "Wallet", href: "/wallet", icon: Coins },
      { label: "Community", href: "/community", icon: MessageCircle },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      // "Certificates" in the reference design — this app calls the
      // underlying page "Medals" (same feature: earned course
      // certificates), so the label is updated without renaming the route.
      { label: "Certificates", href: "/medals", icon: Award },
      { label: "Calendar", href: "/calendar", icon: Calendar, prefetch: false },
      // No dedicated messaging feature exists in the data model — this
      // points at the closest real feature (notifications) rather than
      // a fabricated inbox with no backing data.
      { label: "Messages", href: "/notifications", icon: Bell },
      { label: "Support", href: "/support", icon: LifeBuoy, prefetch: false },
      { label: "Settings", href: "/profile", icon: Settings },
    ],
  },
];

export const mentorNav: NavSection[] = [
  {
    title: "Mentor",
    items: [
      { label: "Dashboard", href: "/mentor/dashboard", icon: LayoutDashboard },
      { label: "My Missions", href: "/mentor/missions", icon: Rocket },
      { label: "Live Classes", href: "/mentor/live-classes", icon: Video },
      { label: "Calendar", href: "/mentor/calendar", icon: Calendar },
      { label: "Heroes", href: "/mentor/students", icon: Users },
      { label: "Grant Access", href: "/mentor/enrollments", icon: UserPlus },
      {
        label: "Assignment Grading",
        href: "/mentor/grading/assignments",
        icon: ClipboardCheck,
      },
      {
        label: "Exam Grading",
        href: "/mentor/grading/exams",
        icon: ClipboardCheck,
      },
      { label: "Live Exams", href: "/mentor/live-exams", icon: Radio },
      { label: "Exams", href: "/mentor/exam-history", icon: History, prefetch: false },
      { label: "Analytics", href: "/mentor/analytics", icon: BarChart3 },
      {
        label: "Announcements",
        href: "/mentor/announcements",
        icon: Megaphone,
        prefetch: false,
      },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Reports", href: "/admin/reports", icon: BarChart3 },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Activity Logs", href: "/admin/activity-logs", icon: FileClock, prefetch: false },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Grant Access", href: "/admin/enrollments", icon: UserPlus },
      { label: "Mentors", href: "/admin/mentors", icon: Shield },
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      { label: "Heroes", href: "/admin/heroes", icon: User },
      {
        label: "Roles & Permissions",
        href: "/admin/roles-permissions",
        icon: Shield,
        prefetch: false,
      },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Missions", href: "/admin/missions", icon: Rocket },
      { label: "Categories", href: "/admin/categories", icon: Layers },
      { label: "Blog", href: "/admin/blog", icon: Newspaper },
      { label: "Batches", href: "/admin/batches", icon: BookOpen },
      { label: "Medals", href: "/admin/medals", icon: Award },
      { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { label: "Calendar", href: "/admin/calendar", icon: Calendar },
      { label: "Proggy Store", href: "/admin/store", icon: Store },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Control Center", href: "/admin/control-center", icon: Wrench },
      { label: "Branding", href: "/admin/settings/branding", icon: Settings, prefetch: false },
      {
        label: "Payment Settings",
        href: "/admin/settings/payments",
        icon: Wallet,
        prefetch: false,
      },
      {
        label: "Email Templates",
        href: "/admin/settings/email-templates",
        icon: Mail,
        prefetch: false,
      },
      {
        label: "Backup & Restore",
        href: "/admin/backup-restore",
        icon: DatabaseBackup,
        prefetch: false,
      },
      { label: "Storage", href: "/admin/storage", icon: HardDrive, prefetch: false },
    ],
  },
];
