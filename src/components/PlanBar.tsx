import type { ReactNode } from 'react'

/**
 * A thin bar of tracked against planned. Above the plan it fills up, and the part above the
 * plan is the block's colour made dark, like the outer arc on the Dashboard's rings.
 */
export default function PlanBar({ tracked, planned, children }: { tracked: number; planned: number; children?: ReactNode }) {
  const above = planned > 0 && tracked > planned
  const fill = planned > 0 ? Math.min(1, tracked / planned) : tracked > 0 ? 1 : 0
  return (
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${Math.round(fill * 100)}%` }} />
      {above && <span className="above" style={{ left: `${(planned / tracked) * 100}%` }} />}
      {children}
    </span>
  )
}
