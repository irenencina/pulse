/** Small line icons, drawn in the current text colour. */
import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const EditIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
)

export const DoneIcon = () => (
  <Icon>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
)

export const ArchiveIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </Icon>
)

export const RestoreIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    <path d="M12 12v5" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const GripIcon = () => (
  <Icon>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Icon>
)

export const ImportIcon = () => (
  <Icon>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Icon>
)

/** A clock with a list: import history. */
export const HistoryIcon = () => (
  <Icon>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

/** A shop with a tag: shop categories. */
export const ShopTagIcon = () => (
  <Icon>
    <path d="M3.5 9 5 4h12l1.5 5" />
    <path d="M3.5 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
    <path d="M5 11.5V20h7" />
    <path d="M14 15.5v-3h3l4 4-3 3-4-4Z" />
  </Icon>
)

export const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const TagIcon = () => (
  <Icon>
    <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
)

export const AddBelowIcon = () => (
  <Icon>
    <path d="M4 6h16M4 11h16" />
    <path d="M12 14v7M8.5 17.5h7" />
  </Icon>
)

export const AddInsideIcon = () => (
  <Icon>
    <path d="M5 4v8a3 3 0 0 0 3 3h5" />
    <path d="M17 12v6M14 15h6" />
  </Icon>
)

export const MoveIcon = () => (
  <Icon>
    <path d="M5 4v6a3 3 0 0 0 3 3h11" />
    <path d="m15 9 4 4-4 4" />
  </Icon>
)

export const MergeIcon = () => (
  <Icon>
    <path d="M6 4v4a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6" />
    <path d="M18 4v4a6 6 0 0 1-6 6" />
    <path d="m15 18 3 2 3-2" />
  </Icon>
)


export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
)

export const FlaskIcon = () => (
  <Icon>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
    <path d="M7.5 15h9" />
  </Icon>
)

export const ChartIcon = () => (
  <Icon>
    <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
  </Icon>
)

/** An arrow going into a cell: a value brought in from somewhere else. */
export const ArrowInIcon = () => (
  <Icon>
    <path d="M3 12h12M11 8l4 4-4 4M20 5v14" />
  </Icon>
)

/** A calendar page: something that happens on a date, like a cost paid once a year. */
export const CalendarIcon = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Icon>
)
