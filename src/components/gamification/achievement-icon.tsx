import {
  Footprints,
  Award,
  Shield,
  Brain,
  Sparkles,
  CheckCheck,
  Flame,
  TrendingUp,
  Rocket,
  Crown,
  Lock,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  footprints: Footprints,
  award: Award,
  shield: Shield,
  brain: Brain,
  sparkles: Sparkles,
  "check-check": CheckCheck,
  flame: Flame,
  "trending-up": TrendingUp,
  rocket: Rocket,
  crown: Crown,
};

export function AchievementIcon({
  iconKey,
  locked,
  className,
}: {
  iconKey: string;
  locked?: boolean;
  className?: string;
}) {
  const Icon = locked ? Lock : ICON_MAP[iconKey] ?? Award;
  return <Icon className={className} />;
}
