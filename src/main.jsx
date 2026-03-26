import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { SyncProvider } from './contexts/SyncContext'
import './index.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateServiceWorker(true)
  }
})

if ('serviceWorker' in navigator) {
  let isReloadingForServiceWorker = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloadingForServiceWorker) return
    isReloadingForServiceWorker = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </AuthProvider>
  </React.StrictMode>
)
