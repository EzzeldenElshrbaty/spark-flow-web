import type { UploadFile, UploadOptions } from '@/api/types'
import { api } from '@/lib/api'

/** Uploads a file for a message in a channel (spec 6.9): progress as it goes up; the signal cancels it. */
export const uploadChatFile = (channelId: string, file: UploadFile, options?: UploadOptions) => api.files.uploadForChat(channelId, file, options)
