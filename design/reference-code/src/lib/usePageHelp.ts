// The Help panel beside a page: whether it's open, and which part of the user's guide explains the page they're on.
import { createContext, useContext } from 'react'
import { matchPath, useLocation } from 'react-router'
import { pageHelpRules, type PageHelp } from '../layout/pageHelpTopics'
import { useRole } from './useRole'

export type PageHelpContextValue = { open: boolean; setOpen: (open: boolean) => void }

export const PageHelpContext = createContext<PageHelpContextValue>({ open: false, setOpen: () => {} })

export const usePageHelpPanel = () => useContext(PageHelpContext)

/** The guide's topics for this page and the viewer's role, or null when the guide doesn't cover it. */
export function usePageHelp(): PageHelp | null {
  const { pathname } = useLocation()
  const { role } = useRole()
  const rule = pageHelpRules.find((item) => item.paths.some((path) => matchPath(path, pathname)))
  return rule?.roles[role] ?? null
}
