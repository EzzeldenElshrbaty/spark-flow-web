import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './useTheme'

// Keep in sync with the inline script in index.html, which applies the theme before first paint.
// TODO(auth): once users log in, save the theme on the user's profile via the API and load it on login,
// so it follows them across browsers and devices. Keep localStorage as the pre-login/offline cache.
const STORAGE_KEY = 'spark-crm.theme'

/** Light unless the user chose dark (an older "system" choice also reads as light). */
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    // Storage unavailable (private mode); use the default.
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    // Phone status bar color follows the top bar (the --surface token).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1c1d' : '#ffffff')
  }, [theme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't survive a reload.
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
