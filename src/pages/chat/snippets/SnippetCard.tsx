import { useEffect, useId, useMemo, useState } from 'react'
import type { Attachment, CodeLanguage } from '@/api/types'
import { languageLabel, tokenize, type CodeToken } from '@/lib/codeTokens'
import { fetchCredentials } from '@/lib/fileView'

/** Lines shown before Show all (spec 6.9 "collapsible"). */
const FOLDED = 10

/** Ink weights only (spec 6.3): no syntax colour. */
const TONE: Record<CodeToken['kind'], string | undefined> = {
  plain: undefined,
  number: undefined,
  keyword: 'font-semibold text-sf-text',
  string: 'text-sf-text-secondary',
  comment: 'text-sf-text-muted',
}

const language = (attachment: Attachment): CodeLanguage => attachment.snippet?.language ?? 'text'

/** "SQL snippet": the label over a snippet's card. */
export const snippetLabel = (attachment: Attachment) => `${languageLabel(language(attachment))} snippet`

/** A snippet's text, fetched once its file can be read; null while it comes, false when it can't. */
export function useSnippetText(url: string | null): string | null | false {
  const [text, setText] = useState<string | null | false>(null)
  useEffect(() => {
    if (!url) return
    let current = true
    fetch(url, { credentials: fetchCredentials(url) })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((body) => current && setText(body))
      .catch(() => current && setText(false))
    return () => {
      current = false
    }
  }, [url])
  return text
}

/**
 * A snippet as code (spec 6.9): its title and "SQL · 6 lines", then the code on `surface-sunken` with line numbers,
 * scrolling sideways inside the card; 10 lines until Show all. Up to 720px wide.
 */
export function SnippetView({ attachment, text }: { attachment: Attachment; text: string }) {
  const regionId = useId()
  const lines = useMemo(() => tokenize(text, language(attachment)), [text, attachment])
  const [open, setOpen] = useState(false)
  const shown = open ? lines : lines.slice(0, FOLDED)
  const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
  return (
    <div className="w-[720px] max-w-full overflow-hidden rounded-sf-lg border border-sf-line bg-sf-surface">
      <div className="min-w-0 px-3 pt-2 pb-2 pe-40 max-md:pe-20">
        <p id={regionId} className="m-0 truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">
          {attachment.title}
        </p>
        <p className="sf-small m-0 text-sf-text-secondary">
          {languageLabel(language(attachment))} · {count}
        </p>
      </div>
      <div role="region" aria-labelledby={regionId} tabIndex={0} className="sf-focus overflow-x-auto border-t border-sf-line bg-sf-surface-sunken py-2">
        <div className="sf-code grid w-max min-w-full grid-cols-[auto_1fr]">
          {shown.map((line, i) => (
            <div key={i} data-line className="contents">
              <span aria-hidden className="ps-3 pe-3 text-end text-sf-text-muted select-none">
                {i + 1}
              </span>
              <span className="pe-3 whitespace-pre text-sf-text">
                {line.map((token, j) => (
                  <span key={j} className={TONE[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
      {lines.length > FOLDED && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="sf-focus sf-small w-full border-t border-sf-line px-3 py-2 text-start font-medium text-sf-accent hover:bg-sf-surface-hover max-md:min-h-11">
          {open ? 'Show less' : `Show all ${count}`}
        </button>
      )}
    </div>
  )
}
