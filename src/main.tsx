import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TreeLab } from './devtools/TreeLab'
import { applyTheme } from './ui/theme'
import './ui/styles.css'

applyTheme()
const lab = new URLSearchParams(location.search).get('lab')

createRoot(document.getElementById('root')!).render(<StrictMode>{lab === 'tree' ? <TreeLab /> : <App />}</StrictMode>)
