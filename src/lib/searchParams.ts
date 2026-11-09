import { useSearchParams } from 'react-router'

/**
 * Address state (UX Phase 2, 2.7): `typed` keys hold what someone types (a search box) and `sheets` keys open a sheet.
 * Typing, or closing a sheet, replaces the history entry; choosing a chip, select or tab, or opening a sheet, adds one,
 * so Back steps through choices and closes a sheet, but not each key typed.
 */
export type ParamOptions = { typed?: readonly string[]; sheets?: readonly string[] }

/** Whether this change replaces the entry instead of adding one. */
export function quietChange(values: Record<string, string | null | undefined>, { typed = [], sheets = [] }: ParamOptions): boolean {
  return Object.entries(values).every(([key, value]) => typed.includes(key) || (sheets.includes(key) && !value))
}

/** The page's query, and a setter that sets or (empty or null) clears keys, pushing or replacing by `quietChange`. */
export function useParamState(options: ParamOptions = {}): [URLSearchParams, (values: Record<string, string | null | undefined>) => void] {
  const [params, setParams] = useSearchParams()
  const set = (values: Record<string, string | null | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: quietChange(values, options) },
    )
  return [params, set]
}

/**
 * One key of the address as a string ('' when it's absent), and its setter; `typed` for a search box (replaces the
 * entry), else each change is a step Back undoes. Setting '' clears the key.
 */
export function useParam(key: string, { typed = false }: { typed?: boolean } = {}): [string, (value: string) => void] {
  const [params, set] = useParamState(typed ? { typed: [key] } : {})
  return [params.get(key) ?? '', (value) => set({ [key]: value })]
}
