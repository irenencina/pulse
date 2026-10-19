/**
 * Pulse as an app: a service worker so it opens without internet, the browser's offer to
 * install it, and asking the browser to keep its data.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let offer: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

/** Only on the real site: not inside the claude.ai preview's frame, and not from a file. */
function onRealSite(): boolean {
  try {
    return window.top === window && (location.protocol === 'https:' || location.hostname === 'localhost')
  } catch {
    return false
  }
}

export function startApp(): void {
  if (!onRealSite()) return
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Pulse still works; it just won't open without internet.
    })
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    // Kept for the Install button in Settings, instead of the browser's own banner.
    e.preventDefault()
    offer = e as InstallPrompt
    changed()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    changed()
  })
  void keepData()
}

/** Asks the browser never to clear Pulse's data on its own (when space runs low, say). */
export async function keepData(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/** True when the browser keeps Pulse's data until you delete it yourself. */
export async function dataKept(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

/** True when Pulse runs as an installed app, in its own window. */
export function runsAsApp(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

export const canInstall = (): boolean => offer !== null

export async function install(): Promise<boolean> {
  if (!offer) return false
  await offer.prompt()
  const { outcome } = await offer.userChoice
  offer = null
  changed()
  return outcome === 'accepted'
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
