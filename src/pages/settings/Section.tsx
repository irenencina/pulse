import type { ReactNode } from 'react'
import Info from '../../components/Info'

/** One part of a Settings tab: a title with its explanation behind the ⓘ, then its rows. */
export default function Section({ title, about, children }: { title: string; about: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title}>
      <h2 className="settings-title">
        {title} <Info>{about}</Info>
      </h2>
      {children}
    </section>
  )
}
