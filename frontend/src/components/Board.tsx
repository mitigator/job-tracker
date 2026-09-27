import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useState } from 'react'
import { type Job, type JobStatus, STATUSES } from '../types'
import { Column } from './Column'
import { JobCardContent } from './JobCard'

interface BoardProps {
  columns: Record<JobStatus, Job[]>
  hiddenInNew: number
  hiddenHint: string
  onMove: (jobId: number, status: JobStatus) => void
  onOpenDetails: (jobId: number) => void
}

// Prefer the column under the mouse pointer; fall back to overlap (keyboard dragging).
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args)
  return underPointer.length > 0 ? underPointer : rectIntersection(args)
}

/** The 5-column Kanban board with drag-and-drop between columns. */
export function Board({ columns, hiddenInNew, hiddenHint, onMove, onOpenDetails }: BoardProps) {
  const [activeJob, setActiveJob] = useState<Job | null>(null)

  const sensors = useSensors(
    // Mouse: start dragging after moving 6px, so a plain click still opens the card.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold 200ms, so swiping still scrolls the page on phones.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Keyboard: focus a card, Space to pick up, arrows to move, Space to drop.
    useSensor(KeyboardSensor),
  )

  const findJob = (id: number): Job | undefined => {
    for (const status of STATUSES) {
      const job = columns[status].find((candidate) => candidate.id === id)
      if (job) return job
    }
    return undefined
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveJob(findJob(Number(event.active.id)) ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveJob(null)
    const target = event.over?.id as JobStatus | undefined
    const job = findJob(Number(event.active.id))
    if (job && target && target !== job.status) {
      onMove(job.id, target)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveJob(null)}
    >
      <div className="thin-scroll -mx-4 flex items-start gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 xl:gap-4">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            jobs={columns[status]}
            hiddenCount={status === 'New' ? hiddenInNew : 0}
            hiddenHint={hiddenHint}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>

      {/* Floating copy of the card that follows the pointer (not clipped by column scroll). */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeJob ? (
          <div className="w-80 cursor-grabbing">
            <JobCardContent job={activeJob} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
