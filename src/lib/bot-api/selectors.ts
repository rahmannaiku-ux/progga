// Central place for "what's the minimum the bot needs" per entity, so
// every /api/bot/* route returns the same lean shape instead of each
// route deciding ad hoc which fields to leak.

export const botUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  avatarUrl: true,
} as const;

export const botCourseSummarySelect = {
  id: true,
  slug: true,
  title: true,
  thumbnailUrl: true,
  status: true,
  level: true,
} as const;

export const botCourseDetailSelect = {
  ...botCourseSummarySelect,
  subtitle: true,
  description: true,
  durationMinutes: true,
  xpReward: true,
  examsEnabled: true,
  teacher: { select: { id: true, firstName: true, lastName: true } },
} as const;
