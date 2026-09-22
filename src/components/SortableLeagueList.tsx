'use client';

import type { ReactNode } from 'react';
import {
    DndContext, closestCenter, PointerSensor, TouchSensor,
    useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DragHandleProps {
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners:  ReturnType<typeof useSortable>['listeners'];
    isDragging: boolean;
}

// A single draggable row. Renders as whatever element `as` specifies (li by
// default) so callers can drop this straight into an existing <ul>/<ol>
// without changing markup shape.
function SortableRow({
    id, as: Tag = 'li', children,
}: {
    id:       string;
    as?:      'li' | 'div';
    children: (drag: DragHandleProps) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity:  isDragging ? 0.4 : 1,
        zIndex:   isDragging ? 10 : undefined,
        position: 'relative',
    };
    return (
        <Tag ref={setNodeRef} style={style}>
            {children({ attributes, listeners, isDragging })}
        </Tag>
    );
}

// A small ⋮⋮ grip handle — spread the drag attributes/listeners onto it so
// only the handle (not the whole row) initiates a drag, leaving clicks on
// the league link/remove button unaffected.
export function DragHandle({ attributes, listeners }: Pick<DragHandleProps, 'attributes' | 'listeners'>) {
    return (
        <button
            type="button"
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            className="shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition px-1 touch-none"
        >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
                <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
                <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
            </svg>
        </button>
    );
}

/**
 * Wraps a list of items with drag-to-reorder. `getId` must return a stable
 * unique id per item. On drop, calls `onReorder` with the full reordered
 * array — callers own persisting that (optimistic update + PATCH).
 */
export function SortableLeagueList<T>({
    items, getId, onReorder, as = 'li', children,
}: {
    items:      T[];
    getId:      (item: T) => string;
    onReorder:  (newItems: T[]) => void;
    as?:        'li' | 'div';
    children:   (item: T, drag: DragHandleProps) => ReactNode;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = items.findIndex(item => getId(item) === active.id);
        const newIndex = items.findIndex(item => getId(item) === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        onReorder(arrayMove(items, oldIndex, newIndex));
    }

    // No wrapping element here on purpose — callers render their own
    // <ul>/<ol> (or grid container) and this just supplies its <li>/<div>
    // children directly, preserving existing list semantics/styling
    // (e.g. divide-y borders between <li> siblings).
    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
                {items.map(item => (
                    <SortableRow key={getId(item)} id={getId(item)} as={as}>
                        {drag => children(item, drag)}
                    </SortableRow>
                ))}
            </SortableContext>
        </DndContext>
    );
}
