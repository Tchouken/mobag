"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { reorderResolutions } from "@/app/(admin)/orgs/[orgId]/assemblies/[assemblyId]/resolutions/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export type ResolutionItem = {
  id: string;
  parent_id: string | null;
  number: string;
  title: string;
  is_information: boolean;
  is_secret: boolean;
  weight_key_label: string;
  is_primary_key: boolean;
  majority_text: string;
  own_quorum: boolean;
  attachments: number;
};

type Props = { orgId: string; assemblyId: string; items: ResolutionItem[]; editable: boolean };

const instructions = {
  draggable:
    "Pour déplacer une résolution, appuyez sur Espace ou Entrée, utilisez les flèches haut et bas, puis Espace ou Entrée pour la déposer, ou Échap pour annuler.",
};

function announcements(items: ResolutionItem[]): Announcements {
  const label = (id: string | number) => {
    const item = items.find((i) => i.id === id);
    return item ? `résolution ${item.number}, ${item.title}` : "résolution";
  };
  const position = (id: string | number | undefined) => (id ? items.findIndex((i) => i.id === id) + 1 : 0);
  return {
    onDragStart: ({ active }) => `${label(active.id)} saisie.`,
    onDragOver: ({ active, over }) => (over ? `${label(active.id)} en position ${position(over.id)}.` : ""),
    onDragEnd: ({ active, over }) =>
      over ? `${label(active.id)} déposée en position ${position(over.id)}.` : "",
    onDragCancel: ({ active }) => `Déplacement de ${label(active.id)} annulé.`,
  };
}

function Row({
  item,
  editable,
  base,
  children,
}: {
  item: ResolutionItem;
  editable: boolean;
  base: string;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      <div className="border-border bg-card flex items-start gap-3 rounded-md border p-3">
        {editable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Déplacer la résolution ${item.number}`}
            className="text-muted-foreground hover:bg-muted cursor-grab rounded px-1 active:cursor-grabbing"
          >
            ⠿
          </button>
        )}
        <span className="w-10 shrink-0 font-mono font-semibold tabular-nums">{item.number}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`${base}/${item.id}`} className="font-medium hover:underline">
            {item.title}
          </Link>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {item.is_information ? (
              <Badge variant="outline">Information, sans vote</Badge>
            ) : (
              <span>{item.majority_text}</span>
            )}
            {!item.is_primary_key && <Badge variant="secondary">Clé : {item.weight_key_label}</Badge>}
            {item.own_quorum && <Badge variant="secondary">Quorum propre</Badge>}
            {item.is_secret && <Badge variant="warning">Vote secret</Badge>}
            {item.attachments > 0 && <span>{item.attachments} pièce(s) jointe(s)</span>}
          </div>
        </div>
      </div>
      {children}
    </li>
  );
}

function SortableGroup({
  items,
  allItems,
  editable,
  base,
  onReorder,
  renderChildren,
}: {
  items: ResolutionItem[];
  allItems: ResolutionItem[];
  editable: boolean;
  base: string;
  onReorder: (ids: string[]) => void;
  renderChildren?: (item: ResolutionItem) => React.ReactNode;
}) {
  // Identifiant stable : évite un écart d'hydratation sur les attributs ARIA de dnd-kit.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements: announcements(allItems), screenReaderInstructions: instructions }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {items.map((item) => (
            <Row key={item.id} item={item} editable={editable} base={base}>
              {renderChildren?.(item)}
            </Row>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

// Même règle que private.renumber_resolutions : 1, 2… puis 2.1, 2.2… (affichage optimiste).
function renumber(items: ResolutionItem[]): ResolutionItem[] {
  const top = items.filter((i) => i.parent_id === null);
  const numbers = new Map(top.map((i, index) => [i.id, String(index + 1)]));
  for (const parent of top) {
    items
      .filter((i) => i.parent_id === parent.id)
      .forEach((child, index) => numbers.set(child.id, `${numbers.get(parent.id)}.${index + 1}`));
  }
  return items.map((i) => ({ ...i, number: numbers.get(i.id) ?? i.number }));
}

export function ResolutionList({ orgId, assemblyId, items: initial, editable }: Props) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const base = `/orgs/${orgId}/assemblies/${assemblyId}/resolutions`;

  const reorder = (parentId: string | null, orderedIds: string[]) => {
    const previous = items;
    // Mise à jour optimiste ; la base renumérote et fait foi au rechargement.
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    setItems(
      renumber(
        [...items].sort((a, b) =>
          a.parent_id === parentId && b.parent_id === parentId ? rank.get(a.id)! - rank.get(b.id)! : 0,
        ),
      ),
    );
    startTransition(async () => {
      setError(undefined);
      const result = await reorderResolutions(orgId, assemblyId, parentId, orderedIds);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  };

  const topLevel = items.filter((i) => i.parent_id === null);
  const childrenOf = (id: string) => items.filter((i) => i.parent_id === id);

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="destructive">{error}</Alert>}
      <SortableGroup
        items={topLevel}
        allItems={items}
        editable={editable}
        base={base}
        onReorder={(ids) => reorder(null, ids)}
        renderChildren={(parent) => {
          const children = childrenOf(parent.id);
          if (children.length === 0) return null;
          return (
            <div className="mt-2 ml-8">
              <SortableGroup
                items={children}
                allItems={items}
                editable={editable}
                base={base}
                onReorder={(ids) => reorder(parent.id, ids)}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
