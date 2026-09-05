import { z } from "zod";

export const assignmentCreateSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().optional().or(z.literal("")),
  title: z.string().min(3, "Give the challenge a title").max(150),
  instructions: z.string().min(10, "Add instructions for students"),
  dueAt: z.string().optional().or(z.literal("")),
  maxPoints: z.coerce.number().int().min(1).max(1000).default(100),
  allowLateSubmission: z.coerce.boolean().default(true),
  rubricCriteria: z.array(z.string()).default([]),
  rubricPoints: z.array(z.coerce.number()).default([]),
  coinReward: z.coerce.number().int().min(0).default(0),
  xpReward: z.coerce.number().int().min(0).default(0),
  maxRewardClaims: z.coerce.number().int().min(1).optional().or(z.literal("")),
});
