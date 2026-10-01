import { ChevronUp, ChevronDown } from "lucide-react";

export const MENU_ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:hover:bg-transparent";

/** "Move up / Move down" entries for an overflow menu, as plain server-action forms. */
export function ReorderMenuItems({
  up,
  down,
  isFirst,
  isLast,
  noun,
}: {
  up: () => Promise<void>;
  down: () => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
  noun: string;
}) {
  return (
    <>
      <form action={up}>
        <button type="submit" role="menuitem" disabled={isFirst} className={MENU_ITEM_CLASS}>
          <ChevronUp className="h-4 w-4 text-muted-foreground" /> Move {noun} up
        </button>
      </form>
      <form action={down}>
        <button type="submit" role="menuitem" disabled={isLast} className={MENU_ITEM_CLASS}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" /> Move {noun} down
        </button>
      </form>
    </>
  );
}
