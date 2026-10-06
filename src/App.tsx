import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { GearIcon } from './components/icons'
import CategoriesPage from './pages/CategoriesPage'
import PlannerPage from './pages/PlannerPage'
import DashboardPage from './pages/DashboardPage'
import LabPage from './pages/LabPage'
import { LAB_TITLE } from './domain/lab'
import SettingsDialog, { type SettingsTab } from './pages/SettingsPage'
import TrackingPage from './pages/TrackingPage'

const NAV = [
  { to: '/planner', label: 'Planner' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/categories', label: 'Categories' },
  { to: '/lab', label: LAB_TITLE },
]

export default function App() {
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <img src="./favicon.svg" alt="" width={22} height={22} /> Pulse
        </span>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="settings-button"
          aria-label="Settings"
          title="Settings"
          aria-haspopup="dialog"
          onClick={() => setSettingsTab('general')}
        >
          <GearIcon />
        </button>
      </header>
      {settingsTab && <SettingsDialog initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/planner" replace />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/tags" element={<OpenSettings onOpen={() => setSettingsTab('tags')} />} />
          <Route path="/settings" element={<OpenSettings onOpen={() => setSettingsTab('general')} />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="*" element={<Navigate to="/planner" replace />} />
        </Routes>
      </main>
      <footer className="footer">Your data is stored only in this browser, on this device. Download a backup now and then in Settings (the gear at the top right).</footer>
    </div>
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
