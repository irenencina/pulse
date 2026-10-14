import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** "#2f6fd6" → hue 0–360, saturation and value 0–1. */
function toHsv(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max]
}

function toHex(h: number, s: number, v: number): string {
  const f = (k: number) => {
    const x = (k + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(x, 4 - x, 1))
  }
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

/**
 * Any colour: a shade square, a hue bar and the colour's code, as wide as the menu it sits in.
 * The colour is kept when you let go, not on every move.
 */
export default function ColourPicker({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => toHsv(isHex(value) ? value : '#2f6fd6'))
  const [code, setCode] = useState(value)
  const square = useRef<HTMLDivElement>(null)
  const [h, s, v] = hsv
  const hex = toHex(h, s, v)
  const show = (next: [number, number, number]) => {
    setHsv(next)
    setCode(toHex(...next))
  }

  const dragSquare = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = square.current!.getBoundingClientRect()
    const at = (ev: { clientX: number; clientY: number }) =>
      [h, Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)), 1 - Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height))] as [number, number, number]
    let last = at(e)
    show(last)
    const move = (ev: PointerEvent) => show((last = at(ev)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onPick(toHex(...last))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="colour-picker">
      <div
        ref={square}
        className="colour-square"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))` }}
        onPointerDown={dragSquare}
        role="presentation"
      >
        <span className="colour-knob" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hex }} />
      </div>
      <input
        type="range"
        className="colour-hue"
        aria-label="Hue"
        min={0}
        max={359}
        value={Math.round(h)}
        onChange={(e) => show([Number(e.target.value), s, v])}
        onPointerUp={() => onPick(hex)}
        onKeyUp={() => onPick(hex)}
      />
      <span className="colour-code">
        <span className="colour-preview" style={{ background: hex }} />
        <input
          aria-label="Colour code"
          value={code}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim()
            setCode(next)
            if (isHex(next)) {
              setHsv(toHsv(next))
              onPick(next.toLowerCase())
            }
          }}
        />
      </span>
    </div>
  )
}
