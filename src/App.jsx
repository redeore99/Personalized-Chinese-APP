import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import WritePage from './pages/WritePage'
import AddCardPage from './pages/AddCardPage'
import PinLock from './components/PinLock'
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

const AddIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v8"/>
    <path d="M8 12h8"/>
  </svg>
)

function App() {
  const [stats, setStats] = useState({ dueCount: 0 })

  const refreshStats = () => {
    getStats().then(setStats)
  }

  useEffect(() => {
    refreshStats()
    // Refresh stats every 30 seconds
    const interval = setInterval(refreshStats, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <PinLock>
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage stats={stats} onRefresh={refreshStats} />} />
        <Route path="/review" element={<ReviewPage onRefresh={refreshStats} />} />
        <Route path="/write" element={<WritePage onRefresh={refreshStats} />} />
        <Route path="/add" element={<AddCardPage onRefresh={refreshStats} />} />
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
        <NavLink to="/add" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <AddIcon />
          <span>Add</span>
        </NavLink>
      </nav>
    </HashRouter>
    </PinLock>
  )
}

export default App
