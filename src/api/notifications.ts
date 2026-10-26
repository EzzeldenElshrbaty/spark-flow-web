// The bell's notifications. TODO(api): load and mark them read through the Spark Flow API; until it exists the list
// is empty. Add a kind (and its icon and tone in NotificationsMenu) for each thing Spark Flow notifies about.
export type NotificationKind = 'update'

export type AppNotification = { id: string; kind: NotificationKind; title: string; text: string; link: string; at: string; read: boolean }

export const notificationsApi = {
  list: async (_userId: string): Promise<{ items: AppNotification[]; unread: number }> => ({ items: [], unread: 0 }),
  markRead: async (_userId: string, _ids: string[]): Promise<void> => {},
}
