import { createRoot } from 'react-dom/client'
import App from './App'
import { ConsoleWindowApp } from './components/console/console-window'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element was not found')
}

const isConsoleWindow = new URLSearchParams(window.location.search).get('console') === '1'

createRoot(container).render(isConsoleWindow ? <ConsoleWindowApp /> : <App />)
