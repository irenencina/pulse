import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  label: ReactNode
  confirmLabel: string
  onConfirm: () => void
  /** Hover text, and the accessible name when the label is an icon. */
  title?: string
  className?: string
}

/**
 * A destructive button that asks for a second click instead of a browser dialog
 * (dialogs are blocked in some embedded views). Resets after a few seconds.
 */
export default function ConfirmButton({ label, confirmLabel, onConfirm, title, className }: Props) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      className={[className, 'danger', armed ? 'armed' : ''].filter(Boolean).join(' ')}
      title={armed ? undefined : title}
      aria-label={!armed && typeof label !== 'string' ? title : undefined}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
