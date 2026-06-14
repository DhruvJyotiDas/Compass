"use client";

import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { GripVertical } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Deal, Stage } from "@/lib/types";

function DealCard({ deal }: { deal: Deal }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => router.push(`/deals/${deal.id}`)} className="text-left text-sm font-medium hover:text-primary">
          {deal.name}
        </button>
        <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-600">{formatCurrency(deal.amount, deal.currency)}</span>
        <span className="text-xs text-muted-foreground">{deal.probability ?? 0}%</span>
      </div>
    </div>
  );
}

function Column({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{stage.name}</span>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{deals.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatCurrency(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[60vh] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        )}
      >
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  stages,
  deals,
  onMove,
}: {
  stages: Stage[];
  deals: Deal[];
  onMove: (dealId: string, stageId: string) => void;
}) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragStart = (e: DragStartEvent) => {
    setActiveDeal(deals.find((d) => d.id === e.active.id) ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveDeal(null);
    const dealId = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const deal = deals.find((d) => d.id === dealId);
    if (stageId && deal && deal.stage_id !== stageId) onMove(dealId, stageId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {stages.map((s) => (
          <Column key={s.id} stage={s} deals={deals.filter((d) => d.stage_id === s.id)} />
        ))}
      </div>
      <DragOverlay>{activeDeal && <DealCard deal={activeDeal} />}</DragOverlay>
    </DndContext>
  );
}
