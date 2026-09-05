export type FlatLesson = {
  lessonId: string;
  groupId: string;
  chapterId: string;
  moduleId: string;
  title: string;
};

type TreeInput = {
  id: string; // moduleId
  chapters: {
    id: string; // chapterId
    groups: {
      id: string; // groupId (teacher-defined class type, e.g. "Foundation Class")
      lessons: { id: string; title: string }[];
    }[];
  }[];
}[];

/** Flattens the module → chapter → group → lesson tree in curriculum order. */
export function flattenLessons(modules: TreeInput): FlatLesson[] {
  const out: FlatLesson[] = [];
  for (const mod of modules) {
    for (const chapter of mod.chapters) {
      for (const group of chapter.groups) {
        for (const lesson of group.lessons) {
          out.push({
            lessonId: lesson.id,
            groupId: group.id,
            chapterId: chapter.id,
            moduleId: mod.id,
            title: lesson.title,
          });
        }
      }
    }
  }
  return out;
}

/** Returns the previous/next lesson relative to `currentLessonId`, if any. */
export function getAdjacentLessons(flat: FlatLesson[], currentLessonId: string) {
  const idx = flat.findIndex((l) => l.lessonId === currentLessonId);
  return {
    previous: idx > 0 ? flat[idx - 1] : null,
    next: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null,
    index: idx,
    total: flat.length,
  };
}
