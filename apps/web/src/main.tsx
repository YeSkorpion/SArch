import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { bootCsrf } from './lib/api'
import './index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Der Anwendungsrahmen fehlt.')
}

bootCsrf()
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch(() => {
    root.replaceChildren()
    const message = document.createElement('p')
    message.textContent = 'Die Anwendung konnte nicht geladen werden. Prüfe, ob die API erreichbar ist.'
    message.setAttribute('role', 'alert')
    root.append(message)
  })
