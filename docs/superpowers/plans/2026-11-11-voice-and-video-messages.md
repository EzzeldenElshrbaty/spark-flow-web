# Voice and Video Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a voice or video message in the browser from a channel or thread composer, preview, re-record or attach it, send it as a file, and play it in the channel (a waveform player for voice, inline video for video).

**Architecture:** A recording is an ordinary chat file with `clip` data beside `snippet` (DB v35), uploaded through today's tray and `uploadForChat`. One browser seam (`lib/recorder.ts`) owns `getUserMedia`, `MediaRecorder` and Web Audio; the dialog takes it as a prop so tests fake it. The player reads the length from `clip.durationMs`, never from the media element.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (sf tokens), TanStack Query, Tabler icons via `components/sf/Icon`, sf primitives, Vitest (node, jsdom, Chromium through Playwright).

**Spec:** `docs/superpowers/specs/2026-11-11-voice-and-video-messages-design.md` (read it with this plan; section numbers below are the spec's).

## Global Constraints

- Limits: `VOICE_MAX_MS = 300_000`, `VIDEO_MAX_MS = 120_000`, `WAVE_BARS = 48`; 1 s of slack on the server's length check.
- Quality: voice `audioBitsPerSecond: 32_000`; video `{ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }`, `videoBitsPerSecond: 1_200_000`, `audioBitsPerSecond: 64_000`.
- Formats, first supported wins: voice `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg;codecs=opus`; video `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/mp4`.
- Every sentence a person reads comes verbatim from spec §9 (curly apostrophes; `src/copy.test.ts` checks).
- Chat screens: sf primitives (`components/sf/*`), sf tokens, Tabler icons through `Icon`, Readex; logical direction classes only (`src/rtl.test.ts`); 44 px touch on phones (`touch` / `max-md:touch-target`); no spinners, no toasts; `announce()` once per state change, never per second.
- Data access: components import from `@/api/*`, never `@/mocks`; the recorder is reached only through `lib/recorder.ts`.
- Every file URL through `safeFileUrl`.
- Commands that run vitest or tsc need the sandbox off.

## Review Focus

1. **Chrome's MediaRecorder WebM has no duration:** `audio.duration` is `Infinity` until played through. Expect the player's time, slider max and `aria-valuetext` to come from `clip.durationMs` only. Test in Task 3.
2. **The permission prompt left open, then Cancel:** `getUserMedia` resolves after the dialog closed. Expect the late stream's tracks to be stopped at once (no microphone light left on). Test in Task 2 (`startRecording` with an aborted signal) and Task 4.
3. **A device unplugged or a track ending mid-recording** (`track.onended`). Expect it to stop as if Stop was pressed, keeping what was recorded. Test in Task 2.
4. **Stop pressed within a moment of starting:** a near-zero `durationMs` would fail the server's 1 ms floor. Expect `durationMs = Math.max(1, elapsed)` and an attachable clip. Test in Task 2.
5. **The 11th file:** a recording when the tray already holds 10 files. Expect the tray's existing refusal sentence, and no upload. Test in Task 5.

---

### Task 1: Clip data end to end

**Files:**
- Create: `src/lib/clips.ts`, `src/lib/clips.test.ts`
- Modify: `src/api/types.ts` (`Clip`, `Attachment.clip`, `uploadForChat` options), `src/lib/format.ts` (+ test), `src/lib/fileTypes.ts` (+ test), `src/pages/chat/files/FilesTab.tsx`, `src/mocks/db.ts`, `src/mocks/migrations.ts` (+ test), `src/mocks/files.ts` (+ its test), `src/mocks/seed.ts`, `src/mocks/seedFiles.ts`, `src/lib/http.ts` (+ test), `docs/flow-chat/api-contract.md`

**Interfaces:**
- Produces:
  - `type Clip = { kind: 'voice' | 'video'; durationMs: number; waveform: number[] }` and `type ClipKind = Clip['kind']` in `api/types.ts`; `Attachment.clip: Clip | null`.
  - `uploadForChat(channelId, file, options?: UploadOptions & { snippet?: { language: CodeLanguage }; clip?: Clip })`.
  - `lib/clips.ts`: `VOICE_MAX_MS`, `VIDEO_MAX_MS`, `WAVE_BARS`, `clipMaxMs(kind: ClipKind): number`, `clipName(kind: ClipKind, at: Date, mimeType: string): string`, `clipLabel(clip: Clip): string`.
  - `lib/format.ts`: `formatClipLength(ms: number): string`.
  - `lib/fileTypes.ts`: `FileKind` gains `'audio'`.

- [ ] **Step 1: Write the failing tests**
  - `clips.test.ts`:
    - `clipName('voice', new Date(2026, 10, 11, 14, 32), 'audio/webm;codecs=opus')` → `'Voice message 11 Nov 2026 2.32 PM.webm'`.
    - Extensions by base type: `audio/mp4` → `.m4a`; `audio/ogg;codecs=opus` → `.ogg`; `video/webm;codecs=vp9,opus` → `.webm` with "Video message"; `video/mp4` → `.mp4`.
    - `clipLabel({ kind: 'voice', durationMs: 42_000, waveform: [] })` → `'Voice message · 0:42'`; for video → `'Video message · 0:42'`.
    - `clipMaxMs('voice')` → 300 000; `clipMaxMs('video')` → 120 000.
  - `format.test.ts`: `formatClipLength(0)` → `'0:00'`, `42_400` → `'0:42'`, `245_000` → `'4:05'`, `750_000` → `'12:30'`.
  - `fileTypes.test.ts`:
    - `fileKind({ name: 'Voice message.webm', mimeType: 'audio/webm' })` → `'audio'`, and the same name with `video/webm` → `'video'`.
    - `.mp3`, `.m4a`, `.wav` and `.ogg` → `'audio'`.
  - `migrations.test.ts`: a v34 doc with files in `attachments`, in a message's `attachments` and in a reply's `attachments` comes out with `clip: null` on each (as the snippet migration's test, key 17).
  - Mock files test:
    - A valid voice upload (`audio/webm`, 48 values in [0, 1], 42 000 ms) stores `clip` and gets the title "Voice message".
    - A video upload gets "Video message".
    - Each refusal is a 400 with spec §4.2's sentence: `audio/wav` for voice; 300 001 + 1000 ms of voice → "Voice messages can be up to 5 minutes."; 121 001 ms of video → "Video messages can be up to 2 minutes."; 47 bars; a bar of 1.2; a video with bars; `durationMs: 0`; both `snippet` and `clip`.
  - `http.test.ts`: `uploadForChat('c1', file, { clip })` posts `clip` in the upload-url body.
  - `seed.test.ts`: Nour's `m-g04` in #general carries one attachment with `clip.kind === 'voice'`, `durationMs === 4000`, 48 bars, and an `audio/wav` file; `DB_VERSION === 35`.

- [ ] **Step 2: Run them; expect failures** (missing exports, `clip` undefined)
  Run: `npx vitest run src/lib/clips.test.ts src/lib/format.test.ts src/lib/fileTypes.test.ts src/mocks/migrations.test.ts src/mocks/files.test.ts src/lib/http.test.ts src/mocks/seed.test.ts`
  Expected: FAIL on the new cases only.

- [ ] **Step 3: Implement**
  - `api/types.ts`: the types above.
  - `lib/clips.ts`: as tested. The date is `formatDate(at)`; the time is `h.mm AM/PM`, since a filename can't hold ":".
  - `lib/format.ts`: `formatClipLength` (floor seconds, `m:ss`).
  - `fileTypes.ts`: audio is `mimeType.startsWith('audio/')` or an extension in `['.mp3', '.m4a', '.wav', '.ogg']`, checked before video. `.ogg` joins the accepted types.
  - `FilesTab.tsx`: `{ id: 'audio', label: 'Audio', icon: IconHeadphones }` after Videos.
  - `db.ts`: `DB_VERSION = 35` ("35: voice and video messages").
  - `migrations.ts`: key 34, mirroring key 17.
  - `mocks/files.ts`:
    - `checkClip(file: { type: string }, clip: Clip)`.
    - `fileRecord(file, uploadedBy, at, snippet = null, clip = null)` sets the clip title.
    - `uploadUnlinked`'s `snippet` parameter becomes `extra: { snippet: Attachment['snippet']; clip: Attachment['clip'] }`.
    - `uploadForChat` runs `checkClip` before storing.
  - `seedFiles.ts`: `voiceNoteWav(ms = 4000): string` returns base64 of an 8 kHz, 8-bit, mono PCM WAV of a soft 220 Hz tone, fading in and out.
  - `seed.ts`:
    - `fileOf` gains `clip: null`.
    - A `fileOf('a-voice-g04', 'Voice message.wav', 'audio/wav', voiceNoteWav(), ago(5, 21), 'u-2')` (m-g04's time) with `clip: { kind: 'voice', durationMs: 4000, waveform: Array.from({ length: 48 }, (_, i) => Math.round((0.35 + 0.6 * Math.abs(Math.sin(i / 3))) * 100) / 100) }`.
    - After `buildMessages`, `m-g04.attachments = [that attachment]`.
    - Ruling: attach to Nour's existing `m-g04` rather than add a message, so #general's message order and seq numbers stay as they are.
  - `http.ts`: `uploadForChat` passes `clip` in `extra`, as it does `snippet`.
  - `api-contract.md`: a "Phase 4 · Slice VM" section, from spec §4.3.

- [ ] **Step 4: Run the Step 2 command; expect PASS.** Then run `npx vitest run --project unit` and fix any count that moved because #general now has a file: the Files tab and the a11y lists, each change checked against the new file.

- [ ] **Step 5: Commit** — `feat(chat): voice and video clip data on chat files (DB v35)`

---

### Task 2: The recorder seam

**Files:**
- Create: `src/lib/recorder.ts`, `src/lib/recorder.test.ts` (node), `src/lib/recorder.browser.test.ts`
- Modify: `vite.config.ts` (browser project `playwright({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })`)

**Interfaces:**
- Consumes: `ClipKind`, `WAVE_BARS` (Task 1).
- Produces:
  - `type Recording = { blob: Blob; mimeType: string; durationMs: number; waveform: number[] }`
  - `type RecordError = 'denied' | 'missing' | 'busy' | 'failed'`
  - `type Recorder = { stream: MediaStream; level(): number; elapsedMs(): number; stop(): Promise<Recording>; cancel(): void }`
  - `canRecord(kind: ClipKind): boolean`
  - `startRecording(kind: ClipKind, opts: { maxMs: number; onLimit: () => void; onEnded?: () => void; signal?: AbortSignal }): Promise<Recorder>`, rejecting with a `RecordError`
  - `pickMimeType(kind, isTypeSupported: (t: string) => boolean): string | null`
  - `waveformOf(levels: number[], bars = WAVE_BARS): number[]`
  - `recordErrorOf(error: unknown): RecordError`
  - `type StartRecording = typeof startRecording` (what the dialog takes as a prop)

- [ ] **Step 1: Write the failing tests** (`recorder.test.ts`, node)
  - `pickMimeType('voice', (t) => t !== 'audio/webm;codecs=opus')` → `'audio/mp4'`; with nothing supported → `null`; video's order as in Global Constraints.
  - `waveformOf`:
    - 480 levels → 48 values, each in [0, 1] with two decimals, and the loudest is 1.
    - All zeros → 48 zeros.
    - 10 levels → 48 values (a level spreads over several bars).
    - `[]` → 48 zeros.
  - `recordErrorOf`: `DOMException` names `NotAllowedError` and `SecurityError` → `'denied'`; `NotFoundError` and `OverconstrainedError` → `'missing'`; `NotReadableError` → `'busy'`; a plain `Error` → `'failed'`.
  - `canRecord('voice')` is false in node (no `navigator.mediaDevices`).

- [ ] **Step 2: Run; expect FAIL** (module missing). `npx vitest run src/lib/recorder.test.ts`

- [ ] **Step 3: Implement `lib/recorder.ts`**
  - `startRecording`:
    - Calls `getUserMedia` with the kind's constraints. If `signal` is aborted when it resolves, it stops every track and rejects with `'failed'` (Review Focus 2).
    - Starts a `MediaRecorder` with the picked type and bitrates.
    - An `AnalyserNode` gives the RMS level every 50 ms; voice keeps the levels.
    - The `maxMs` timer calls `stop()`, then `onLimit`.
    - Any track's `ended` event stops it the same way and calls `onEnded` (Review Focus 3).
  - `stop()` resolves with `durationMs = Math.max(1, elapsed)` (Review Focus 4) and `waveformOf(levels)` for voice (`[]` for video), and stops every track and the audio context.
  - `cancel()` stops everything and keeps nothing.

- [ ] **Step 4: Run the node tests; expect PASS.**

- [ ] **Step 5: The real-media check** (`recorder.browser.test.ts`)
  - Add the launch args to `vite.config.ts`.
  - Test: `canRecord('voice')` is true; `startRecording('voice', { maxMs: 5000, onLimit })`; wait about 1200 ms; `stop()` gives a blob over 0 bytes, a mime type starting `audio/`, `durationMs` ≥ 1000, and 48 bars; then every track of `stream` has `readyState === 'ended'`.
  - A second test: `startRecording` with an already-aborted signal rejects, leaving no live track.
  - Run: `npx vitest run --project browser src/lib/recorder.browser.test.ts`. Expected: PASS.
  - If the provider won't take the args, write `Task 2: Ruling:` in the ledger, mark the test `it.skip` with the reason, and add a manual check to the final review notes.

- [ ] **Step 6: Commit** — `feat(chat): a recorder for voice and video messages`

---

### Task 3: The voice player and clips in messages

**Files:**
- Create: `src/lib/clipPlayback.ts` (+ test), `src/pages/chat/clips/VoicePlayer.tsx`, `src/pages/chat/clips/VoicePlayer.test.tsx` (jsdom), `src/pages/chat/clips/VoicePlayer.browser.test.tsx`
- Modify: `src/pages/chat/MessageFiles.tsx` (+ its test)

**Interfaces:**
- Consumes: `Clip`, `clipLabel`, `formatClipLength` (Task 1).
- Produces:
  - `clipPlayback`: `play(id: string, pause: () => void)` (pauses the one before), `stopped(id: string)`.
  - `<VoicePlayer src={string} clip={Clip} />`, used in messages and in the dialog's preview (Task 4). `src` already went through `safeFileUrl`.

- [ ] **Step 1: Write the failing tests**
  - `clipPlayback.test.ts`: `play('a', pauseA)` then `play('b', pauseB)` calls `pauseA` once; after `stopped('b')`, `play('a', …)` pauses nothing.
  - `VoicePlayer.test.tsx` (stub `HTMLMediaElement.prototype.play` and `pause`; set `duration` to `Infinity` on purpose):
    - The button is "Play voice message"; clicking it calls `play()` and the label becomes "Pause voice message".
    - The time reads `0:42` (from `clip.durationMs`, not `audio.duration`).
    - The slider is named "Position", with `aria-valuemax` = 42 and `aria-valuetext` "0:00 of 0:42".
    - ArrowRight sets `currentTime` to 5 and the text to "0:05 of 0:42"; End → 42; Home → 0; ArrowLeft at 0 stays 0.
    - The 48 bars render; with `currentTime` 21 the first 24 have the played class.
    - Two players: playing the second pauses the first.
  - `MessageFiles` test:
    - An attachment with a voice clip renders the player, not a file card.
    - A video clip renders the inline video with the label "Video message · 0:42".
    - A plain `.mp3` (no clip) stays a file card, and so does a voice clip whose type the browser can't play (`canPlayType` returns `''`).
  - `VoicePlayer.browser.test.tsx`: the seeded `m-g04` in #general (`renderApp`) shows "Play voice message"; clicking it plays the real WAV (`currentTime` rises above 0 within 2 s); axe has no serious problems, light and dark.

- [ ] **Step 2: Run; expect FAIL.**
  `npx vitest run src/lib/clipPlayback.test.ts src/pages/chat/clips/VoicePlayer.test.tsx src/pages/chat/MessageFiles.test.tsx`

- [ ] **Step 3: Implement**
  - `VoicePlayer`:
    - The look is spec §8 / the kit's `.sf-clip`. The card: `w-[380px] max-w-full rounded-sf-lg border border-sf-line bg-sf-surface px-3 py-2`, play button 32 px `bg-sf-accent-fill text-sf-on-accent rounded-full` with `max-md:touch-target`.
    - Bars: `w-[3px] rounded-[2px]`, `bg-sf-line-strong`, played ones `bg-sf-accent`; height is `max(2px, value × 28px)`.
    - The slider div owns keys and pointer seek.
    - `preload="none"`, and `onEnded` resets to 0 and calls `stopped`.
  - `MessageFiles`: a clip voice file the browser can play (`canPlayType(mimeType) !== ''`) → `VoicePlayer`, otherwise the file card; a clip video → today's video branch with `clipLabel` as the type label; `typeLabel` uses `clipLabel` when `clip` is set.

- [ ] **Step 4: Run Step 2's command and the browser file; expect PASS.**

- [ ] **Step 5: Commit** — `feat(chat): a waveform player for voice messages`

---

### Task 4: The recorder dialog

**Files:**
- Create: `src/pages/chat/clips/RecordDialog.tsx`, `src/pages/chat/clips/RecordDialog.test.tsx` (jsdom)
- Modify: `src/components/sf/Modal.tsx` (`keepLabel`) and its test

**Interfaces:**
- Consumes: `StartRecording`, `Recorder`, `Recording`, `RecordError` (Task 2); `VoicePlayer` (Task 3); `clipMaxMs`, `formatClipLength` (Task 1).
- Produces: `<RecordDialog kind={ClipKind} start?={StartRecording} onAttach={(file: File, clip: Clip) => void} onClose={() => void} />`. `start` defaults to `startRecording`.

- [ ] **Step 1: Write the failing tests** (`RecordDialog.test.tsx`)
  - Use a fake `start` that returns a controllable `Recorder`: `level()` 0.5, `elapsedMs()` from the fake clock, `stop()` resolving a 42 s `Recording` with a `blob` and a `mimeType`.
  - Opening: the title is "Record a voice message" and the body reads "Waiting for your microphone…". Video: "Record a video message" and "Waiting for your camera…".
  - Once `start` resolves: "Recording", the time "0:00 / 5:00", Stop has focus, `announce` "Recording started.", and the time is "0:42 / 5:00" after 42 s of fake time.
  - Stop: `announce` "Recording stopped, 0:42."; a `VoicePlayer` preview shows; Re-record and Attach show.
  - Attach calls `onAttach` with a `File` named by `clipName` and `{ kind: 'voice', durationMs: 42000, waveform }`, then `onClose`.
  - Re-record: `cancel` was called on the old recorder, `start` is called again, and no question is asked.
  - The limit (the fake calls `onLimit`): "Stopped at 5:00, the longest a voice message can be." For video: "Stopped at 2:00, the longest a video message can be."
  - Errors: each `RecordError` shows spec §9's sentence for the kind and is announced. Try again calls `start` again.
  - Cancel with nothing recorded closes at once. While recording, it asks "Discard the recording?" with "Keep recording"; once stopped, "Keep the recording"; Discard calls `cancel` and `onClose`.
  - Closing while `start` is still pending aborts its `signal` (Review Focus 2).
  - Unmount while recording calls `cancel`.
  - Video while recording shows a `<video muted autoplay playsinline>` whose `srcObject` is the stream.
  - Modal test: `keepLabel="Keep recording"` replaces "Keep editing".

- [ ] **Step 2: Run; expect FAIL.**
  `npx vitest run src/pages/chat/clips/RecordDialog.test.tsx src/components/sf/Modal.test.tsx`

- [ ] **Step 3: Implement**
  - `RecordDialog` follows spec §6; its footer buttons are `touch` (44 px on phones).
  - The meter is 24 bars from `level()`, refreshed each animation frame while recording. With `prefers-reduced-motion` it is one static bar showing the level.
  - The time redraws from `elapsedMs()` four times a second, without announcing.
  - `Modal` gains `keepLabel = 'Keep editing'`.

- [ ] **Step 4: Run the Step 2 command; expect PASS.**

- [ ] **Step 5: Commit** — `feat(chat): the record dialog for voice and video messages`

---

### Task 5: In the composer, the tray and the docs

**Files:**
- Modify:
  - `src/pages/chat/composer/RichComposer.tsx` (`ComposerFiles.onRecorded`, the row buttons, the + menu items)
  - `src/pages/chat/uploads/useUploads.ts` (`addClip`), `src/pages/chat/uploads/UploadTray.tsx`
  - `src/pages/chat/ChannelPage.tsx`, `src/pages/chat/ThreadComposer.tsx`
  - `src/layers.browser.test.tsx`, `src/help/chat.md`, `docs/flow-chat/FLOW_CHAT_REDESIGN.md` (§6.9 Built line), `CLAUDE.md` ("Voice and video messages" rule), `tasks/todo.md`
- Create: `src/pages/chat/clips/voiceMessages.browser.test.tsx`

**Interfaces:**
- Consumes: `RecordDialog` (Task 4), `canRecord` (Task 2), `clipLabel` (Task 1), `uploadChatFile` (`api/files.ts`, whose options now carry `clip`).
- Produces: `ComposerFiles.onRecorded?: (file: File, clip: Clip) => void`; `useUploads(...).addClip(file: File, clip: Clip): void`; `Upload.clip?: Clip`.

- [ ] **Step 1: Write the failing tests** (`voiceMessages.browser.test.tsx`, whole app as Admin)
  - Fake the recorder: `vi.mock('@/lib/recorder', …)`. `canRecord` → true; `startRecording` → a fake whose `stop()` returns a `Recording` made from the seed's WAV bytes (`voiceNoteWav()`), 4000 ms, 48 bars.
  - Desktop, #general:
    - The row has "Record a video message" and "Record a voice message" after a divider, in that order.
    - Record a voice message → Stop → Attach. The tray card reads "Voice message · 0:04".
    - Send → the new message shows "Play voice message", and `api.files` stored `clip.kind === 'voice'`.
  - A thread: the reply box has the same buttons; a recorded clip sends as a reply.
  - Phone (390 px): the row has no record buttons; the + menu has both items, and they answer touch (`answersTouch`); there's no sideways scroll.
  - `canRecord` → false: no buttons and no menu items.
  - Editing a message: no record buttons.
  - Review Focus 5: with 10 files in the tray, Attach shows the tray's refusal sentence and uploads nothing.
  - axe has no serious problems with the dialog open, in light and dark.
  - `layers.browser.test.tsx`: an entry `{ name: 'Record a voice message', path: '/w/engineering/c/c-general', open: …, kind: 'modal' }` with the recorder faked.

- [ ] **Step 2: Run; expect FAIL.**
  `npx vitest run --project browser src/pages/chat/clips/voiceMessages.browser.test.tsx src/layers.browser.test.tsx`

- [ ] **Step 3: Implement**
  - `RichComposer`:
    - From `md`, when `files.onRecorded` is set and `canRecord(kind)`, add a divider then two `IconButton`s (`IconVideo`, `IconMicrophone`; `size="sm"`, `tone="muted"`) after "Mention someone".
    - Below `md`, add the same two as `MenuItem`s at the end of the + menu.
    - Each opens `RecordDialog` with `onAttach={files.onRecorded}`.
  - `useUploads.addClip`: goes through the same 10-file check as `add`, keeps `clip` on the item, and `start` passes `{ clip }` to `uploadChatFile`.
  - `UploadTray`: when the item has a clip, its subline is `clipLabel(clip)`.
  - `ChannelPage` and `ThreadComposer` pass `onRecorded: uploads.addClip`.
  - Docs:
    - Help gets "## Voice and video messages" (record, preview, re-record, attach; limits; permissions).
    - The redesign gets a Built line.
    - `CLAUDE.md` gets a rule: `lib/recorder.ts` is the only media seam, `clip` is beside `snippet`, the length comes from `clip.durationMs`, `RecordDialog` takes `start`.
    - `tasks/todo.md` gets the checklist.

- [ ] **Step 4: Run the Step 2 command, then `npm test`; expect PASS.**

- [ ] **Step 5: Commit** — `feat(chat): record voice and video messages from the composer`

---

## After the tasks

Final Opus review of the branch; one fix pass (each fix RED → GREEN); then `npm run lint`, `npx tsc -b`, `npm test`, `npm run test:ux`, `npm run build:prototype`. Look at it in the browser: desktop light, phone dark, and Chrome's own microphone permission prompt (manual). Deferred minors go in `tasks/todo.md`.
