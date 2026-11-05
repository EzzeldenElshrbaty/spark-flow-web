// The help chapters' screenshots (Admin and help, slice 6): `npm run help:shots` builds the prototype, serves it, and
// takes each picture with Playwright at 1280×800 in the light theme on the seeded demo data, into public/help/.
// Rerun it when a page in a picture changes. Each chapter names its picture: ![alt](name.jpg "caption").
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4179
const BASE = `http://localhost:${PORT}/w/engineering`
const OUT = 'public/help'

/** name → where, and what to wait for before the picture (a role and name, as Testing Library finds them). */
const SHOTS = [
  { name: 'home', path: '', ready: ['heading', 'Today · 0h'], before: startTimer },
  { name: 'projects', path: '/projects', ready: ['table', null] },
  { name: 'project-overview', path: '/p/NEX/overview', ready: ['heading', 'Nexus Core'] },
  { name: 'board', path: '/p/NEX/tasks', ready: ['button', 'New task'] },
  { name: 'chat', path: '/c/c-general', ready: ['textbox', null] },
  { name: 'dashboard', path: '/dashboard', ready: ['group', 'Hours per day'] },
  { name: 'time-cost', path: '/time?days=30', ready: ['heading', 'Time & cost'] },
  { name: 'users', path: '/settings/users', ready: ['table', 'People'] },
  { name: 'roles', path: '/settings/roles', ready: ['table', 'Permissions by role'] },
  { name: 'audit-log', path: '/settings/audit', ready: ['heading', 'Audit log'] },
  { name: 'attendance', path: '/settings/attendance', ready: ['table', 'Days'] },
  { name: 'archived', path: '/settings/archived', ready: ['heading', 'Archived records'], before: archiveOne },
]

/** Home's picture is of a day under way: the timer on a task, started from the Today card (timer slice 3). */
async function startTimer(page) {
  await page.getByRole('main').getByRole('button', { name: 'Start timer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start timer' })
  await dialog.getByLabel('Project').selectOption({ label: 'Nexus Core' })
  await dialog.getByLabel('Task').selectOption({ index: 1 })
  await dialog.getByRole('button', { name: 'Start timer' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.waitForTimeout(800)
}

/** Archived records has something to show: a project archived with a reason. */
async function archiveOne(page) {
  await page.goto(`${BASE}/p/SEL/overview`)
  await page.getByRole('button', { name: /More|project actions/i }).first().click()
  await page.getByRole('menuitem', { name: 'Archive project' }).click()
  await page.getByRole('textbox', { name: /Why/ }).fill('Client paused the booking work until next year')
  await page.getByRole('button', { name: 'Archive project' }).last().click()
  await page.waitForTimeout(800)
}

/** Waits until the preview server answers, or fails after 30 seconds (or at once if it stopped: the port was taken). */
async function serverUp(server) {
  for (let tries = 0; tries < 60; tries++) {
    if (server.exitCode !== null) throw new Error(`The preview server stopped (is port ${PORT} taken?).`)
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('The preview server didn\'t start in 30 seconds.')
}

const server = spawn('npx', ['vite', 'preview', '--mode', 'prototype', '--port', String(PORT), '--strictPort'], { stdio: 'inherit', detached: true })
let browser
try {
  await serverUp(server)
  mkdirSync(OUT, { recursive: true })
  // HELP_SHOTS_CHROME points at a Chromium of your own when Playwright's isn't installed.
  browser = await chromium.launch(process.env.HELP_SHOTS_CHROME ? { executablePath: process.env.HELP_SHOTS_CHROME } : {})
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    timezoneId: 'Africa/Cairo',
    geolocation: { latitude: 30.05712, longitude: 31.2272, accuracy: 25 },
    permissions: ['geolocation'],
  })
  await context.addInitScript(() => localStorage.setItem('spark-flow.theme', 'light'))
  const page = await context.newPage()
  // A first visit opens on Sign in (slice AB): its picture first, then in as Youssef, the Admin, for the rest.
  await page.goto(`http://localhost:${PORT}/signin`)
  await page.getByRole('list', { name: 'Demo people' }).waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/signin.jpg`, type: 'jpeg', quality: 80 })
  console.log(`${OUT}/signin.jpg`)
  await page.getByRole('button', { name: /Youssef Abdelrahman/ }).click()
  await page.waitForURL(/\/w\//)
  for (const shot of SHOTS) {
    if (shot.before && shot.name !== 'home') await shot.before(page)
    await page.goto(`${BASE}${shot.path}`)
    const [role, name] = shot.ready
    if (shot.name === 'home') {
      await page.getByRole(role, { name }).first().waitFor()
      await shot.before(page)
    } else await page.getByRole(role, name ? { name } : {}).first().waitFor()
    // Fades and the loading bar finish first.
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${shot.name}.jpg`, type: 'jpeg', quality: 80 })
    console.log(`${OUT}/${shot.name}.jpg`)
  }
} finally {
  await browser?.close()
  // npx starts vite as a child: end the whole group, or the server outlives the script.
  try {
    process.kill(-server.pid)
  } catch {
    // Already gone.
  }
}
