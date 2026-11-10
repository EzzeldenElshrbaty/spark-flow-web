/** The people, themes and screens the whole-app tests use (UX Phase 6); plain data, so unit tests can read it too. */

export type Role = 'admin' | 'pm' | 'member' | 'sales'
export type Theme = 'light' | 'dark'
export type Size = 'desktop' | 'laptop' | 'tablet' | 'phone'

/** The seeded person who plays each role. */
export const ROLE_USER: Record<Role, { id: string; name: string; email: string; label: string }> = {
  admin: { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', label: 'Admin' },
  pm: { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', label: 'PM' },
  member: { id: 'u-3', name: 'Mariam Fathy', email: 'mariam.fathy@spark-sys.com', label: 'Member' },
  sales: { id: 'u-9', name: 'Karim Hassan', email: 'karim.hassan@spark-sys.com', label: 'Sales' },
}

/** The audit's four screens (width × height). */
export const SIZE: Record<Size, [number, number]> = {
  desktop: [1440, 900],
  laptop: [1280, 720],
  tablet: [768, 1024],
  phone: [390, 844],
}
