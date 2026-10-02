import { useEffect, useState } from 'react'

interface Props {
  label: string
  confirmLabel: string
  onConfirm: () => void
}

/**
 * A destructive button that asks for a second click instead of a browser dialog
 * (dialogs are blocked in some embedded views). Resets after a few seconds.
 */
export default function ConfirmButton({ label, confirmLabel, onConfirm }: Props) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <button
      type="button"
      className={armed ? 'danger armed' : 'danger'}
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
