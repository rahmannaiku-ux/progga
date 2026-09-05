"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil, X, Check } from "lucide-react";
import { createNote, updateNote, deleteNote } from "@/server/actions/learning-actions";

type Note = {
  id: string;
  content: string;
  timestampSec: number | null;
  createdAt: string;
};

function formatTimestamp(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NotesPanel({
  lessonId,
  initialNotes,
}: {
  lessonId: string;
  initialNotes: Note[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submitNew() {
    if (!draft.trim()) return;
    setError(null);
    const optimistic: Note = {
      id: `temp-${Date.now()}`,
      content: draft,
      timestampSec: null,
      createdAt: new Date().toISOString(),
    };
    setNotes((n) => [optimistic, ...n]);
    setDraft("");
    startTransition(async () => {
      try {
        await createNote(lessonId, optimistic.content, null);
      } catch (e) {
        setNotes((n) => n.filter((x) => x.id !== optimistic.id));
        setError(e instanceof Error ? e.message : "Couldn't save note.");
      }
    });
  }

  function submitEdit(noteId: string) {
    if (!editDraft.trim()) return;
    const prev = notes;
    setNotes((n) => n.map((x) => (x.id === noteId ? { ...x, content: editDraft } : x)));
    setEditingId(null);
    startTransition(async () => {
      try {
        await updateNote(noteId, editDraft);
      } catch (e) {
        setNotes(prev);
        setError(e instanceof Error ? e.message : "Couldn't update note.");
      }
    });
  }

  function remove(noteId: string) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== noteId));
    startTransition(async () => {
      try {
        await deleteNote(noteId);
      } catch (e) {
        setNotes(prev);
        setError(e instanceof Error ? e.message : "Couldn't delete note.");
      }
    });
  }

  return (
    <div className="comic-panel bg-surface p-4">
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Jot down a note for this patrol..."
          rows={2}
          className="w-full rounded-xl border-[2.5px] border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <button
        type="button"
        onClick={submitNew}
        disabled={isPending || !draft.trim()}
        className="comic-btn mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        Save note
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <ul className="mt-4 space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="rounded-xl border-[2.5px] border-border bg-background p-3">
            {editingId === note.id ? (
              <div>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border-[2.5px] border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                />
                <div className="mt-1.5 flex gap-2">
                  <button
                    onClick={() => submitEdit(note.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-accent"
                  >
                    <Check className="h-3.5 w-3.5" /> Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  {note.timestampSec !== null && (
                    <span className="sticker mr-2 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                      {formatTimestamp(note.timestampSec)}
                    </span>
                  )}
                  <p className="whitespace-pre-line text-sm text-foreground">
                    {note.content}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setEditingId(note.id);
                      setEditDraft(note.content);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit note"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(note.id)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground">No notes yet for this patrol.</p>
        )}
      </ul>
    </div>
  );
}
