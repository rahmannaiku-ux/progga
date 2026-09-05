export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type AchievementDef = {
  key: string;
  name: string;
  description: string;
  iconKey: string; // maps to an in-house icon in the UI, never third-party art
  xpBonus: number;
  rarity: AchievementRarity;
};

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  {
    key: "first-patrol",
    name: "First Steps",
    description: "Complete your first patrol (lesson).",
    iconKey: "footprints",
    xpBonus: 10,
    rarity: "common",
  },
  {
    key: "first-mission-complete",
    name: "Mission Accomplished",
    description: "Complete your first mission end to end.",
    iconKey: "award",
    xpBonus: 50,
    rarity: "common",
  },
  {
    key: "first-encounter-passed",
    name: "Sharp Mind",
    description: "Pass your first quiz or exam.",
    iconKey: "brain",
    xpBonus: 20,
    rarity: "common",
  },
  {
    key: "first-challenge-graded",
    name: "Field Tested",
    description: "Get your first challenge (assignment) graded.",
    iconKey: "check-check",
    xpBonus: 20,
    rarity: "common",
  },
  {
    key: "streak-7",
    name: "Week Streak",
    description: "Maintain a 7-day learning streak.",
    iconKey: "flame",
    xpBonus: 25,
    rarity: "rare",
  },
  {
    key: "perfect-encounter",
    name: "Flawless",
    description: "Score 100% on a quiz or exam.",
    iconKey: "sparkles",
    xpBonus: 30,
    rarity: "rare",
  },
  {
    key: "level-10",
    name: "Rising Hero",
    description: "Reach level 10.",
    iconKey: "trending-up",
    xpBonus: 0,
    rarity: "rare",
  },
  {
    key: "personal-best",
    name: "Personal Best",
    description: "Beat your own previous best score on a retaken encounter.",
    iconKey: "rocket",
    xpBonus: 15,
    rarity: "rare",
  },
  {
    key: "five-missions-complete",
    name: "Veteran Hero",
    description: "Complete five missions.",
    iconKey: "shield",
    xpBonus: 100,
    rarity: "epic",
  },
  {
    key: "streak-30",
    name: "Unstoppable",
    description: "Maintain a 30-day learning streak.",
    iconKey: "flame",
    xpBonus: 75,
    rarity: "epic",
  },
  {
    key: "top-decile-encounter",
    name: "Top of the Class",
    description: "Score in the top 10% of heroes on a graded encounter.",
    iconKey: "crown",
    xpBonus: 40,
    rarity: "epic",
  },
  {
    key: "level-25",
    name: "Elite Hero",
    description: "Reach level 25.",
    iconKey: "trending-up",
    xpBonus: 0,
    rarity: "legendary",
  },
  {
    key: "streak-100",
    name: "Legend",
    description: "Maintain a 100-day learning streak.",
    iconKey: "flame",
    xpBonus: 200,
    rarity: "legendary",
  },
];

export const ACHIEVEMENT_ICONS: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_CATALOG.map((a) => [a.key, a.iconKey])
);

export const RARITY_LABEL: Record<AchievementRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

// Display-only — deliberately not stored on the DB Achievement row,
// since only this catalog is read for rendering (see achievements
// page); the DB row just tracks which keys a user has unlocked.
export const RARITY_THEME: Record<
  AchievementRarity,
  { ring: string; badgeBg: string; badgeText: string; glow?: string }
> = {
  common: { ring: "border-border", badgeBg: "bg-muted", badgeText: "text-muted-foreground" },
  rare: { ring: "border-accent", badgeBg: "bg-accent/15", badgeText: "text-accent" },
  epic: { ring: "border-primary", badgeBg: "bg-primary/15", badgeText: "text-primary" },
  legendary: {
    ring: "border-xp",
    badgeBg: "bg-xp/15",
    badgeText: "text-xp",
    glow: "animate-glow-pulse",
  },
};
