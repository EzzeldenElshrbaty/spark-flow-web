import { IconFileText, IconFileTypePdf, IconPhoto, IconVideo, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Tooltip } from '@/components/sf/Tooltip'
import { fileSubline, previewOf } from '@/lib/fileTypes'
import { useUploadProgress } from '@/pages/chat/uploads/uploadProgress'
import type { Upload } from '@/pages/chat/uploads/useUploads'

/** A local picture of an image being uploaded, freed when the card goes. */
function useLocalPreview(file: File) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (previewOf(file.name) !== 'image') return
    const made = URL.createObjectURL(file)
    setUrl(made)
    return () => URL.revokeObjectURL(made)
  }, [file])
  return url
}

const typeIcon = (name: string) => {
  const kind = previewOf(name)
  if (kind === 'image') return IconPhoto
  if (kind === 'pdf') return IconFileTypePdf
  if (/\.(mp4|webm|mov)$/i.test(name)) return IconVideo
  return IconFileText
}

function Card({ upload, onRemove, onRetry }: { upload: Upload; onRemove: (key: string) => void; onRetry: (key: string) => void }) {
  const { file, status, error } = upload
  // Live while it goes up (uploadProgress); the card's own value once it's done.
  const live = useUploadProgress(upload.key)
  const progress = status === 'uploading' ? (live ?? upload.progress) : upload.progress
  const preview = useLocalPreview(file)
  const percent = Math.round(progress * 100)
  return (
    <li className="relative flex w-[232px] flex-none items-center gap-2 rounded-sf-md border border-sf-line bg-sf-surface p-2">
      <span aria-hidden="true" className="grid size-10 flex-none place-items-center overflow-hidden rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        {preview ? <img src={preview} alt="" className="size-full object-cover" /> : <Icon icon={typeIcon(file.name)} size={20} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-sf text-[13px]/[18px] font-medium text-sf-text">{file.name}</span>
        {status === 'uploading' && (
          <span
            role="progressbar"
            aria-label={`Uploading ${file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="block h-1 overflow-hidden rounded-sf-full bg-sf-line"
          >
            <span className="block h-full rounded-sf-full bg-sf-accent-fill transition-[width] duration-150 ease-sf" style={{ width: `${percent}%` }} />
          </span>
        )}
        {status === 'ready' && <span className="sf-meta text-sf-text-muted">{fileSubline(file.name, file.size)}</span>}
        {status === 'failed' && (
          <span className="flex min-w-0 items-center gap-1">
            <span className="sf-meta min-w-0 truncate text-sf-error">{error}</span>
            {upload.retryable && (
              <Button size="sm" variant="ghost" touch aria-label={`Retry ${file.name}`} onClick={() => onRetry(upload.key)}>
                Retry
              </Button>
            )}
          </span>
        )}
      </span>
      {/* A 20px round × on the card's corner (spec 6.9), with a 44px touch target on phones. */}
      <Tooltip label={`Remove ${file.name}`}>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={() => onRemove(upload.key)}
        className="sf-focus absolute -end-2 -top-2 grid size-5 cursor-pointer place-items-center rounded-sf-full border-0 bg-sf-text p-0 text-sf-surface max-md:after:absolute max-md:after:-inset-3"
      >
        <Icon icon={IconX} size={14} />
      </button>
      </Tooltip>
    </li>
  )
}

/**
 * The composer's pending tray (spec 6.9): a 232px card per file with its thumbnail or type icon, its name, a 4px
 * progress bar while it goes up and then "PNG · 412 KB", and ×. A failed card says why, with Retry; what couldn't be
 * added at all is said above the cards.
 */
export function UploadTray({ uploads, refused, onRemove, onRetry }: { uploads: Upload[]; refused: string[]; onRemove: (key: string) => void; onRetry: (key: string) => void }) {
  if (uploads.length === 0 && refused.length === 0) return null
  return (
    <div className="flex flex-col gap-1 px-3 pt-3">
      {refused.length > 0 && (
        <p role="alert" className="sf-small m-0 text-sf-error">
          {refused.join(' ')}
        </p>
      )}
      {uploads.length > 0 && (
        // The strip scrolls sideways, which clips; the room above the cards keeps each ×'s 44px phone target whole.
        <ul aria-label="Files to send" className="m-0 -mx-3 flex list-none gap-2 overflow-x-auto px-3 pt-2 pb-1 max-md:pt-6">
          {uploads.map((upload) => (
            <Card key={upload.key} upload={upload} onRemove={onRemove} onRetry={onRetry} />
          ))}
        </ul>
      )}
    </div>
  )
}
