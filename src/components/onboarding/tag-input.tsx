"use client";
import { useState } from "react";
import { Button, IconButton, Input } from "@/components/ui";

/**
 * Listă editabilă (categorii, mărci, produse, adrese): cipuri cu „×” și un câmp pentru adăugat.
 * Trimite valorile într-un câmp ascuns, câte una pe rând.
 */
export function TagInput({ name, initial, placeholder, max = 12, addLabel = "Adaugă" }: { name: string; initial: string[]; placeholder?: string; max?: number; addLabel?: string }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
    if (!parts.length) return;
    setItems((cur) => [...cur, ...parts.filter((p) => !cur.some((c) => c.toLowerCase() === p.toLowerCase()))].slice(0, max));
    setDraft("");
  };
  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={items.join("\n")} />
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((x) => (
            <li key={x} className="ob-pop inline-flex h-8 items-center gap-1 rounded-full border border-border bg-bg pl-3 text-sm">
              <span className="max-w-64 truncate">{x}</span>
              <IconButton type="button" label={`Scoate ${x}`} className="size-8 sm:size-8" onClick={() => setItems((cur) => cur.filter((c) => c !== x))}>×</IconButton>
            </li>
          ))}
        </ul>
      )}
      {items.length < max && (
        <div className="flex gap-2">
          <Input value={draft} placeholder={placeholder} aria-label={placeholder ?? addLabel} className="min-w-0 flex-1"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button type="button" variant="secondary" onClick={add}>{addLabel}</Button>
        </div>
      )}
    </div>
  );
}
