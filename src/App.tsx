import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { GearIcon, LifebuoyIcon } from './components/icons'
import { usePopupScrollLock } from './components/usePopupScrollLock'
import PlannerPage from './pages/PlannerPage'
import DashboardPage from './pages/DashboardPage'
import LabPage from './pages/LabPage'
import { LAB_TITLE } from './domain/lab'
import SettingsDialog, { type SettingsTab } from './pages/SettingsPage'
import TrackingPage from './pages/TrackingPage'
import UpcomingPage from './pages/UpcomingPage'
import ResalePage from './pages/ResalePage'
import WishlistPage from './pages/WishlistPage'
import WorthPage from './pages/WorthPage'
import EmergencySheet from './pages/EmergencySheet'
import { EMERGENCY_PATH } from './domain/emergency'
import { useDueSoon } from './pages/useDueSoon'
import { getSettings } from './db/actions'
import { orderedPlugins, type PluginKey, type Settings } from './domain/types'

const NAV: Array<{ to: string; label: string; plugin?: PluginKey }> = [
  { to: '/planner', label: 'Planner' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/upcoming', label: 'Upcoming' },
  { to: '/wealth', label: 'Wealth' },
  { to: '/wishlist', label: 'Wishlist', plugin: 'pluginWishlist' },
  { to: '/resale', label: 'Resale', plugin: 'pluginResale' },
  { to: '/playground', label: LAB_TITLE, plugin: 'pluginPlayground' },
]

export default function App() {
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const settings = useLiveQuery(() => getSettings(), [])
  usePopupScrollLock()
  const dueSoon = useDueSoon()
  // Plug-in tabs show only when switched on in Settings → Plug-ins.
  const on = (plugin?: keyof Settings) => !plugin || settings?.[plugin] === true
  // In the order picked in Settings → Plug-ins.
  const order = orderedPlugins(settings?.pluginOrder)
  const pluginTabs = NAV.filter((item) => item.plugin && on(item.plugin)).sort((a, b) => order.indexOf(a.plugin!) - order.indexOf(b.plugin!))
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-side">
          <span className="brand">
            <img src="./favicon.svg" alt="" width={22} height={22} /> Pulse
          </span>
          <nav>
            {NAV.filter((item) => !item.plugin && item.to !== '/upcoming').map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {/* Upcoming gathers what has to happen from every tab, so it sits in the middle. */}
        <nav className="hub-nav" aria-label="Upcoming">
          <NavLink to="/upcoming">
            Upcoming
            {dueSoon > 0 && (
              <span className="nav-count" title={`${dueSoon} in the next 7 days`} aria-label={`${dueSoon} in the next 7 days`}>
                {dueSoon}
              </span>
            )}
          </NavLink>
        </nav>
        <div className="topbar-side end">
          {/* Plug-ins sit apart from the budget, on the right next to the gear. */}
          {pluginTabs.length > 0 && (
            <nav className="plugin-nav" aria-label="Plug-ins">
              {pluginTabs.map((item) => (
                <NavLink key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <button
            type="button"
            className="settings-button gear-button"
            aria-label="Settings"
            title="Settings"
            aria-haspopup="dialog"
            onClick={() => setSettingsTab('general')}
          >
            <GearIcon />
          </button>
          {/* Within reach from every page, for whoever has to step in. */}
          <button
            type="button"
            className="settings-button"
            aria-label="Emergency sheet"
            title="Emergency sheet: who to call, your accounts and your bills, ready to print"
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(true)}
          >
            <LifebuoyIcon />
          </button>
        </div>
        {/* On a phone every tab sits in one row you can swipe, under the name and the two buttons. */}
        <PhoneNav items={[...NAV.filter((item) => !item.plugin), ...pluginTabs]} dueSoon={dueSoon} />
      </header>
      {sheetOpen && <EmergencySheet onClose={() => setSheetOpen(false)} />}
      {settingsTab && <SettingsDialog initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/planner" replace />} />
          <Route path="/categories" element={<OpenSettings onOpen={() => setSettingsTab('categories')} />} />
          <Route path="/tags" element={<OpenSettings onOpen={() => setSettingsTab('tags')} />} />
          <Route path="/settings" element={<OpenSettings onOpen={() => setSettingsTab('general')} />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/wealth" element={<WorthPage />} />
          <Route path={EMERGENCY_PATH} element={<OpenSheet onOpen={() => setSheetOpen(true)} />} />
          <Route path="/worth" element={<Navigate to="/wealth" replace />} />
          <Route path="/playground" element={settings && !on('pluginPlayground') ? <PluginOff name={LAB_TITLE} onOpen={() => setSettingsTab('plugins')} /> : <LabPage />} />
          <Route path="/wishlist" element={settings && !on('pluginWishlist') ? <PluginOff name="Wishlist" onOpen={() => setSettingsTab('plugins')} /> : <WishlistPage />} />
          <Route path="/resale" element={settings && !on('pluginResale') ? <PluginOff name="Resale" onOpen={() => setSettingsTab('plugins')} /> : <ResalePage />} />
          <Route path="/lab" element={<Navigate to="/playground" replace />} />
          <Route path="*" element={<Navigate to="/planner" replace />} />
        </Routes>
      </main>
      <footer className="footer">Your data is stored only in this browser, on this device. Download a backup now and then in Settings (the gear at the top right).</footer>
    </div>
  )
}

/** All tabs in one swipeable row, for phones; the open one is scrolled into view. */
function PhoneNav({ items, dueSoon }: { items: Array<{ to: string; label: string }>; dueSoon: number }) {
  const row = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    row.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [pathname])
  return (
    <nav className="phone-nav" aria-label="Pages" ref={row}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to}>
          {item.label}
          {item.to === '/upcoming' && dueSoon > 0 && (
            <span className="nav-count" aria-label={`${dueSoon} in the next 7 days`}>
              {dueSoon}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** A plug-in page opened from an old link while the plug-in is off. */
function PluginOff({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <section className="page">
      <h1>{name}</h1>
      <p>
        The {name} plug-in is switched off.{' '}
        <button type="button" onClick={onOpen}>
          Open Settings → Plug-ins
        </button>
      </p>
    </section>
  )
}

/** Old links to the Settings page open the pop-up over the planner. */
function OpenSettings({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate()
  useEffect(() => {
    onOpen()
    navigate('/planner', { replace: true })
  }, [onOpen, navigate])
  return null
}

/** The emergency sheet's address (Upcoming's reminder links to it): opens it over the page you came from. */
function OpenSheet({ onOpen }: { onOpen: () => void }) {
  const navigate = useNavigate()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    onOpen()
    navigate(-1)
  }, [onOpen, navigate])
  return null
}
