"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createCategory, updateCategory } from "@/server/actions/admin-actions";

type ExistingCategory = {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  displayOrder: number;
  isActive: boolean;
};

const inputClass =
  "h-10 w-full rounded-lg border border-border/60 bg-surface px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const labelClass = "text-xs font-semibold text-muted-foreground";

export function CategoryForm({
  existing,
  onSaved,
}: {
  existing?: ExistingCategory;
  /** Called after a successful save. New-category pages typically
   * reset the form (return `false`/void to skip the redirect a plain
   * page.tsx would otherwise not have); the edit page navigates back
   * to the list. Kept as a callback instead of a hardcoded redirect so
   * this one form works for both create and edit without a prop just
   * to switch behavior. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetCount, setResetCount] = useState(0);
  const formKey = existing ? existing.id : `new-${resetCount}`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    if (existing) formData.set("id", existing.id);
    startTransition(async () => {
      const result = existing ? await updateCategory(formData) : await createCategory(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onSaved) {
        onSaved();
      } else {
        router.push("/admin/categories");
      }
      if (!existing) setResetCount((n) => n + 1); // remounts the form with blank fields
      router.refresh();
    });
  }

  return (
    <form key={formKey} onSubmit={submit} className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={existing?.name}
          placeholder="Web Development"
          className={`${inputClass} mt-1`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={existing?.description ?? ""}
          placeholder="Optional short description"
          className={`${inputClass} mt-1 h-auto py-2`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="iconKey">
            Icon key
          </label>
          <input
            id="iconKey"
            name="iconKey"
            maxLength={60}
            defaultValue={existing?.iconKey ?? ""}
            placeholder="code, design, ..."
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="displayOrder">
            Display order
          </label>
          <input
            id="displayOrder"
            name="displayOrder"
            type="number"
            min={0}
            max={100000}
            defaultValue={existing?.displayOrder ?? 0}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={existing?.isActive ?? true}
          className="h-4 w-4 rounded border-border/60"
        />
        Active (visible on the public Categories page)
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="comic-btn h-10 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {isPending ? "Saving..." : existing ? "Save changes" : "Add category"}
      </button>
    </form>
  );
}
