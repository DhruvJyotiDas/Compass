"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";

const MODULE_PATH: Record<string, string> = {
  lead: "/leads",
  contact: "/contacts",
  account: "/accounts",
  deal: "/deals",
};

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits([]);
        return;
      }
      try {
        const res = await api.search(q.trim());
        setHits(res.hits);
        setOpen(true);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQ("");
    router.push(`${MODULE_PATH[hit.module]}/${hit.id}`);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search leads, contacts, accounts, deals…"
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {hits.map((h) => (
            <button
              key={`${h.module}-${h.id}`}
              onClick={() => go(h)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                <span className="font-medium">{h.title}</span>
                {h.subtitle && <span className="ml-2 text-muted-foreground">{h.subtitle}</span>}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{h.module}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
