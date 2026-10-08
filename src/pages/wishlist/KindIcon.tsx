import { BoxIcon, RepeatIcon, TicketIcon } from '../../components/icons'
import type { WishKind } from '../../domain/wishlist'

/** Item, experience or subscription, as a small picture. */
export function KindIcon({ kind }: { kind: WishKind }) {
  return kind === 'experience' ? <TicketIcon /> : kind === 'subscription' ? <RepeatIcon /> : <BoxIcon />
}
