import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Un fichier lâché hors d'une zone de dépôt ne doit pas remplacer le launcher par son contenu
for (const type of ['dragover', 'drop']) document.addEventListener(type, (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
