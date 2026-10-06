import { useState } from 'react'
import { evalAmount } from '../domain/money'

/** An amount (or a sum) saved when you leave the box. */
export default function AmountInput({ label, cents, onSave }: { label: string; cents: number; onSave: (cents: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  return (
    <input
      className={`amount-input${invalid ? ' invalid' : ''}`}
      inputMode="decimal"
      aria-label={label}
      title={invalid ? 'Type an amount like 1000 or a sum like 800+200' : undefined}
      value={draft ?? (cents / 100).toFixed(2).replace(/\.00$/, '')}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => (setDraft(e.target.value), setInvalid(false))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={() => {
        if (draft === null) return
        const value = evalAmount(draft === '' ? '0' : draft)
        if (value === null) return setInvalid(true)
        setDraft(null)
        if (value !== cents) onSave(value)
      }}
    />
  )
}
