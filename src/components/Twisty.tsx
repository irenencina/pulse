/**
 * The small arrow left of a category with subcategories: ▸ when they're hidden, ▾ when shown.
 * Categories without subcategories get an empty space of the same size, so names line up.
 */
export default function Twisty({ name, open, show, onToggle }: { name: string; open: boolean; show: boolean; onToggle: () => void }) {
  if (!show) return <span className="twisty-space" aria-hidden="true" />
  return (
    <button
      type="button"
      className={`twisty${open ? ' open' : ''}`}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} the subcategories of ${name}`}
      title={open ? 'Hide the subcategories' : 'Show the subcategories'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}
