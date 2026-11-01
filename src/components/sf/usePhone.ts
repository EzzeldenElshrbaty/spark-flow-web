import { useEffect, useState } from 'react'

/** Whether a media query matches, kept up to date. */
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** True below 768px, where the redesign goes single-pane and menus become bottom sheets. */
export function usePhone() {
  return useMedia('(max-width: 767px)')
}

/** True on a touch screen with no hover (a tablet): what shows on hover must be there already. */
export function useNoHover() {
  return useMedia('(hover: none)')
}
