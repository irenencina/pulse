import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import CategoriesPage from './pages/CategoriesPage'
import PlannerPage from './pages/PlannerPage'
import ComingSoon from './pages/ComingSoon'
import SettingsPage from './pages/SettingsPage'
import TagsPage from './pages/TagsPage'
import TrackingPage from './pages/TrackingPage'

const NAV = [
  { to: '/planner', label: 'Planner' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/categories', label: 'Categories' },
  { to: '/tags', label: 'Tags' },
  { to: '/settings', label: 'Settings' },
]

export default function App() {
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
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/planner" replace />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/dashboard" element={<ComingSoon title="Dashboard" step={5} />} />
          <Route path="*" element={<Navigate to="/planner" replace />} />
        </Routes>
      </main>
      <footer className="footer">Your data is stored only in this browser, on this device. Download a backup now and then in Settings.</footer>
    </div>
  )
}
