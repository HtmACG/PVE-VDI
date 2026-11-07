import { createRoot } from 'react-dom/client'
import App from './App'
import { ConsoleWindowApp } from './components/console/console-window'
import { SshWindowApp } from './components/views/ssh-window'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element was not found')
}

const params = new URLSearchParams(window.location.search)
const windowKind = params.get('ssh') === '1' ? 'ssh' : params.get('console') === '1' ? 'console' : 'main'

createRoot(container).render(
  windowKind === 'ssh' ? <SshWindowApp /> : windowKind === 'console' ? <ConsoleWindowApp /> : <App />
)
