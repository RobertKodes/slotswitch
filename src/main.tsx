import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/600.css'
import '@fontsource/azeret-mono/400.css'
import '@fontsource/azeret-mono/500.css'
import App from './App.tsx'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
