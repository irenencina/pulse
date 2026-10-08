import { placeholderArt } from '../../domain/wishlist'

/** Until a card has a picture: its initials on a gradient, the same every time for the same name. */
export function PlaceholderArt({ name }: { name: string }) {
  const art = placeholderArt(name)
  return (
    <div className="placeholder-art" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
      <span>{art.initials}</span>
    </div>
  )
}
