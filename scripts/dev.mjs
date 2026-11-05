import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const electronModule = path.join(root, 'node_modules', 'electron')
const localDist = path.join(electronModule, 'dist')
const localExecutableName = process.platform === 'win32' ? 'electron.exe' : 'electron'
const localVersionFile = path.join(localDist, 'version')

if (!fs.existsSync(localVersionFile) || !fs.existsSync(path.join(localDist, localExecutableName))) {
  const installer = path.join(electronModule, 'install.js')
  if (!fs.existsSync(installer)) {
    console.error('Electron is not installed. Run `pnpm install` first.')
    process.exit(1)
  }
  console.log('[dev] downloading Electron runtime...')
  const result = spawnSync(process.execPath, [installer], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    console.error('[dev] Electron runtime installation failed.')
    process.exit(result.status ?? 1)
  }
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// Windows can fail to launch Chromium child processes from secondary drives in
// some environments. When the project is not on C:, keep a runtime copy on the
// system drive for local development. electron-vite reads ELECTRON_EXEC_PATH.
if (process.platform === 'win32' && path.parse(root).root.toUpperCase() !== 'C:\\') {
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local')
  const runtimeDir = path.join(base, 'pve-vdi-electron-dev')
  const localVersion = fs.readFileSync(localVersionFile, 'utf8').trim()
  const targetVersionFile = path.join(runtimeDir, 'version')
  const targetVersion = fs.existsSync(targetVersionFile)
    ? fs.readFileSync(targetVersionFile, 'utf8').trim()
    : ''
  if (localVersion !== targetVersion) {
    console.log(`[dev] preparing Electron runtime on system drive: ${runtimeDir}`)
    fs.rmSync(runtimeDir, { recursive: true, force: true })
    fs.mkdirSync(runtimeDir, { recursive: true })
    fs.cpSync(localDist, runtimeDir, { recursive: true })
  }
  env.ELECTRON_OVERRIDE_DIST_PATH = runtimeDir
  env.ELECTRON_EXEC_PATH = path.join(runtimeDir, localExecutableName)
}

const cli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
if (!fs.existsSync(cli)) {
  console.error('electron-vite CLI is missing. Run `pnpm install` first.')
  process.exit(1)
}

const child = spawn(process.execPath, [cli, 'dev'], {
  cwd: root,
  env,
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
child.on('error', (error) => {
  console.error('[dev] failed to start electron-vite:', error)
  process.exit(1)
})
