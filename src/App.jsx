import { useState, useEffect, useCallback } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import WritePage from './pages/WritePage'
import AddCardPage from './pages/AddCardPage'
import CardsPage from './pages/CardsPage'
import DecksPage from './pages/DecksPage'
import SettingsPage from './pages/SettingsPage'
import AuthGate from './components/AuthGate'
import { getStats } from './lib/db'

// SVG Icons as components
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

const CardsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M12 8v8"/>
    <path d="M8 12h8"/>
  </svg>
)

const WriteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
)

const DecksIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="6" rx="1"/>
    <rect x="2" y="10" width="20" height="6" rx="1"/>
    <rect x="4" y="18" width="16" height="4" rx="1"/>
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
)

function App() {
  const [stats, setStats] = useState({ dueCount: 0 })

  const refreshStats = useCallback(() => {
    getStats().then(setStats)
  }, [])

  useEffect(() => {
    refreshStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(refreshStats, 30000)
    return () => clearInterval(interval)
  }, [refreshStats])

  return (
    <AuthGate>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage stats={stats} onRefresh={refreshStats} />} />
          <Route path="/review" element={<ReviewPage onRefresh={refreshStats} />} />
          <Route path="/write" element={<WritePage onRefresh={refreshStats} />} />
          <Route path="/add" element={<AddCardPage onRefresh={refreshStats} />} />
          <Route path="/cards" element={<CardsPage onRefresh={refreshStats} />} />
          <Route path="/decks" element={<DecksPage onRefresh={refreshStats} />} />
          <Route path="/settings" element={<SettingsPage onRefresh={refreshStats} />} />
        </Routes>

        <nav className="bottom-nav">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
            <HomeIcon />
            <span>Home</span>
          </NavLink>
          <NavLink to="/review" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <CardsIcon />
            <span style={{ position: 'relative' }}>
              Review
              {stats.dueCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -14,
                  right: -16,
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px'
                }}>
                  {stats.dueCount > 99 ? '99+' : stats.dueCount}
                </span>
              )}
            </span>
          </NavLink>
          <NavLink to="/write" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <WriteIcon />
            <span>Write</span>
          </NavLink>
          <NavLink to="/decks" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <DecksIcon />
            <span>Decks</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <SettingsIcon />
            <span>Settings</span>
          </NavLink>
        </nav>
      </HashRouter>
    </AuthGate>
  )
}

export default App
