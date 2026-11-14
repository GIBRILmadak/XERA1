import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './supabase-bridge.js' // Must run before legacy JS scripts
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
