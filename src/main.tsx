import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migraNazioniPes } from './db/nazioni'

// Migrazione dati storici: "PES-215" → "Italia" (idempotente, eseguita una volta).
void migraNazioniPes().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
