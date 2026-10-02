/** "#Football Club " -> "football-club". Returns '' when nothing usable is left. */
export function normaliseTagName(input: string): string {
  return input
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatTag(name: string): string {
  return `#${name}`
}
