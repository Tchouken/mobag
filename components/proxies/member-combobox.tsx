"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeHeader } from "@/lib/import/table";
import { cn } from "@/lib/utils";

export type MemberOption = { id: string; label: string; ref: string | null; disabled?: string };

type Props = {
  id: string;
  options: MemberOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  labelledBy: string;
};

const MAX_RESULTS = 50;

// Liste de choix avec recherche (nom ou référence, accents ignorés), utilisable au clavier
// et par les lecteurs d'écran (motif ARIA « combobox »).
export function MemberCombobox({ id, options, value, onChange, placeholder, labelledBy }: Props) {
  const listId = useId();
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = normalizeHeader(query);
    const matches = q
      ? options.filter((o) => normalizeHeader(`${o.label} ${o.ref ?? ""}`).includes(q))
      : options;
    return matches.slice(0, MAX_RESULTS);
  }, [options, query]);

  const choose = (option: MemberOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-labelledby={labelledBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        autoComplete="off"
        placeholder={selected ? `${selected.ref ? `${selected.ref} — ` : ""}${selected.label}` : placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(selected && !query && "placeholder:text-foreground")}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="border-border bg-card absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-lg"
        >
          {results.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-sm">Aucun résultat</li>
          )}
          {results.map((o, index) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={o.id === value}
              aria-disabled={o.disabled ? true : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm",
                index === active && "bg-muted",
                o.disabled && "text-muted-foreground cursor-not-allowed",
              )}
            >
              {o.ref && <span className="mr-2 font-mono">{o.ref}</span>}
              {o.label}
              {o.disabled && <span className="ml-2 text-xs">({o.disabled})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
