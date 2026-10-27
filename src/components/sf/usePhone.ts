import { useEffect, useState } from 'react'

const query = '(max-width: 767px)'

/** True below 768px, where the redesign goes single-pane and menus become bottom sheets. */
export function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const onChange = () => setPhone(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return phone
}
