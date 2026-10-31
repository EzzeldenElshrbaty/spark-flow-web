import { IconDownload, IconEye, IconFileText, IconFileTypePdf, IconShare3 } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { noteDownload } from '@/api/audit'
import { useChannels } from '@/api/chat'
import { useFileDetails } from '@/api/files'
import { useProjectSummaries } from '@/api/projects'
import { useFolders } from '@/api/folders'
import type { Channel, FileDetails, Folder, ProjectSummary, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { useFileUrl } from '@/components/AttachmentView'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { FileViewer } from '@/components/ui/FileViewer'
import { viewedFile } from '@/lib/fileView'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/apiError'
import { channelLabel } from '@/lib/channels'
import { formatDate } from '@/lib/format'
import { fileSubline, previewOf } from '@/lib/fileTypes'
import { withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { useRole } from '@/lib/useRole'
import { NotFound } from '@/pages/NotFound'
import { FileActionsProvider, useFileActions } from '@/pages/chat/files/FileActions'
import { download } from '@/pages/chat/MessageFiles'

const linkClass = 'sf-focus rounded-sf-sm text-sf-accent hover:underline'

/** Who can see a file, place by place (spec 6.9 Access): a channel's audience, a DM's people, a project's people. */
function accessLines(details: FileDetails, channels: Channel[], projects: ProjectSummary[], users: User[], meId: string): string[] {
  const lines: string[] = []
  for (const channelId of new Set(details.sharedIn.map((s) => s.channelId))) {
    const channel = channels.find((c) => c.id === channelId)
    if (!channel) continue
    // By the channel's own audience first: a project's channel is open to the workspace (only its people post there).
    if (channel.kind === 'dm') lines.push(`You and ${channelLabel(channel, users, meId)}`)
    else if (channel.isPrivate) lines.push(`Members of #${channel.name}`)
    else lines.push(`Everyone in the workspace, through #${channel.name}`)
  }
  // A project's own files are its people's; a task's file is posted as a card in its project's channel, said above.
  for (const project of projects) if (details.projectIds.includes(project.id)) lines.push(`People on ${project.name}`)
  return [...new Set(lines)]
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="sf-meta text-sf-text-muted">{term}</dt>
      <dd className="sf-ui m-0 text-sf-text">{children}</dd>
    </div>
  )
}

/** The panel's content, inside the file actions (Share, Edit file details). */
function Details({ details, ws, users, channels, projects, folders, meId }: { details: FileDetails; ws: string; users: User[]; channels: Channel[]; projects: ProjectSummary[]; folders: Folder[]; meId: string }) {
  const { file } = details
  const actions = useFileActions()
  const manage = actions?.mayManage(file) ?? false
  const { url } = useFileUrl(file.scanStatus === 'clean' ? file.id : null)
  const [viewing, setViewing] = useState(false)
  // An office file opens as its converted preview, as from its card (spec 6.9).
  const viewed = viewedFile(file, url)
  const [params] = useSearchParams()
  const preview = previewOf(file.name)
  const uploader = users.find((u) => u.id === file.uploadedBy)?.name ?? 'Unknown person'
  const label = (c: Channel) => (c.kind === 'channel' ? `#${c.name}` : channelLabel(c, users, meId))
  return (
    <div className="sf flex flex-col gap-4">
      <div className="grid h-40 place-items-center overflow-hidden rounded-sf-lg border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        {preview === 'image' && url ? <img src={url} alt={file.title} className="max-h-full max-w-full object-contain" /> : (
          <span className="grid size-10 place-items-center rounded-sf-md border border-sf-line bg-sf-surface">
            <Icon icon={preview === 'pdf' ? IconFileTypePdf : IconFileText} />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {file.name !== file.title && <span className="sf-small break-all text-sf-text-secondary">{file.name}</span>}
        <span className="sf-small text-sf-text-secondary">{fileSubline(file.name, file.size)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          touch
          icon={IconDownload}
          disabled={!url}
          onClick={() => {
            if (!url) return
            download(url, file.name)
            noteDownload(file.id)
          }}
        >
          Download
        </Button>
        {actions && manage && (
          <Button size="sm" touch icon={IconShare3} onClick={() => actions.share(file)}>
            Share
          </Button>
        )}
        <Button size="sm" touch icon={IconEye} disabled={!viewed} onClick={() => setViewing(true)}>
          Open
        </Button>
      </div>
      <dl className="m-0 flex flex-col gap-3">
        <Row term="Uploaded by">{uploader}</Row>
        <Row term="Uploaded">{formatDate(file.createdAt)}</Row>
        <Row term="Shared in">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {details.sharedIn.map((place) => {
              const channel = channels.find((c) => c.id === place.channelId)
              if (!channel) return null
              const to = place.replyId ? `${paths.channel(ws, channel.id)}?thread=${encodeURIComponent(place.messageId)}` : `${paths.channel(ws, channel.id)}?message=${encodeURIComponent(place.messageId)}`
              return (
                <li key={place.replyId ?? place.messageId}>
                  <Link to={to} className={linkClass}>
                    {place.replyId ? `${label(channel)}, in a thread` : label(channel)}
                  </Link>
                </li>
              )
            })}
            {details.taskKeys.map((key) => (
              <li key={key}>
                <Link to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }} className={linkClass}>
                  {key}
                </Link>
              </li>
            ))}
            {projects
              .filter((p) => details.projectIds.includes(p.id))
              .map((project) => (
                <li key={project.id}>
                  <Link to={paths.project(ws, project.key)} className={linkClass}>
                    {project.name}
                  </Link>
                </li>
              ))}
          </ul>
        </Row>
        <Row term="Folder">{folders.find((f) => f.id === file.folderId)?.name ?? '—'}</Row>
        <Row term="Access">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {accessLines(details, channels, projects, users, meId).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Row>
        <Row term="Description">
          <span className="whitespace-pre-line">{file.description || '—'}</span>
        </Row>
      </dl>
      {actions && manage && (
        <div>
          <Button size="sm" touch onClick={() => actions.edit(file)}>
            Edit file details
          </Button>
        </div>
      )}
      {viewing && viewed && <FileViewer files={[viewed]} onClose={() => setViewing(false)} onDownload={() => noteDownload(file.id)} />}
    </div>
  )
}

/**
 * The File details panel (spec 6.9), in the right-hand inspector: the preview, the file's name, type and size,
 * Download / Share / Open, then Uploaded by, Uploaded, Shared in, Access and Description (Edit file details).
 */
export function FileInspector({ fileId, onClose, closeTo }: { fileId: string } & InspectorBodyProps) {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const details = useFileDetails(fileId)
  const users = useUsers(workspace?.id).data ?? []
  const channels = useChannels(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const folders = useFolders(workspace?.id).data ?? []
  const [, setParams] = useSearchParams()
  const notFound = details.error instanceof ApiError && details.error.status === 404

  let body
  if (notFound) body = <NotFound what="file" backTo={closeTo} backLabel="Close the details" />
  else if (details.isError) body = <QueryError what="File" onRetry={() => void details.refetch()} />
  else if (!details.data) body = <InspectorSkeleton />
  else body = <Details details={details.data} ws={workspace?.slug ?? ''} users={users} channels={channels} projects={projects} folders={folders} meId={persona.id} />

  return (
    <FileActionsProvider workspaceId={workspace?.id ?? ''} meId={persona.id} people={users} onDetails={(file) => setParams((p) => withInspector(p, { kind: 'file', fileId: file.id }))}>
      <InspectorFrame label="File details" eyebrow="File details" title={details.data ? details.data.file.title : notFound ? 'File' : <TitleSkeleton />} onClose={onClose} focusTitle>
        {body}
      </InspectorFrame>
    </FileActionsProvider>
  )
}
