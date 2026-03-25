import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { SyncProvider } from './contexts/SyncContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </AuthProvider>
  </React.StrictMode>
)
