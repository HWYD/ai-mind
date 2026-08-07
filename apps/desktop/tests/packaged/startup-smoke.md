# Windows x64 and macOS arm64 Safe MVP Smoke

**Scope**: T043 Safe MVP manual acceptance. This record does not authorize preview distribution. Run it only for a locally built, unsigned internal-preview candidate after the applicable server-first gate has passed.

## Environment Record

Record only the following non-user data for each run:

| Field                          | Value |
| ------------------------------ | ----- |
| Date and operator              |       |
| Source commit                  |       |
| Windows version                |       |
| macOS version and architecture |       |
| Desktop Release                |       |
| Server compatibility state     |       |
| Startup elapsed milliseconds   |       |
| Result                         |       |

Do not record chat messages, images, cookies, prompts, credentials, raw errors, or diagnostics that contain user content.

## Fresh Install and Startup

1. On Windows x64, install the unsigned internal-preview candidate into a clean Windows user profile. Do not publish or redistribute the installer.
2. Start AI Mind Desktop with normal trusted HTTPS network connectivity and no injected rate limit or fault.
3. From the first compatibility attempt through an interactive chat input, measure elapsed time. It must be at most 10 seconds.
4. Send a normal chat message and confirm the response streams in the workspace. Use synthetic, non-sensitive text only.
5. Start a second application instance. Confirm no second business window is created and the existing workspace is focused.
6. Open `AI Mind Desktop` > `关于 AI Mind Desktop`. Confirm the Chinese About dialog shows the desktop version, `internal-preview`, `unsigned`, and the fixed Trusted Origin. It must not load remote content or offer an upgrade URL.
7. Fill the Environment Record with the observed result. Keep failed runs as failures; do not replace them with a later successful run.

## Existing Features and Lifecycle Recovery

1. Open an existing conversation from the conversation list and confirm the existing messages remain visible after restarting the desktop application.
2. Use the existing image-generation entry point and confirm the generated image result is rendered by the webapp. Do not save the image during this Safe MVP smoke.
3. Exercise the existing controlled Agent entry point and confirm its webapp result is displayed without a desktop-specific model, Agent, MCP, database, or business IPC path.
4. Start a streaming response, close the workspace window, and reopen the desktop application. Confirm the webapp decides whether the StreamRun is resumable from its existing hydration/terminal state; the desktop host must not send cancel or fabricate a terminal result.
5. During a streaming response, terminate the renderer process using a controlled test environment. Confirm the desktop reaches local recovery and does not issue cancel, silently reattach an active subscription, or expose raw renderer errors.
6. Suspend and resume Windows during a streaming response. Confirm the desktop does not issue cancel or fabricate a completed/failed response. A second launch must focus the existing state only.
7. Record only the result and sanitized version/compatibility evidence. Do not record chat, image, cookie, prompt, Agent, or diagnostic contents.

## Session Continuity and Overlay Install

1. Use the desktop normally, close it, and reopen it within 30 days. Confirm the server-authorized conversation list remains available and that the normal session-bound request refreshes the cookie lifetime. Do not inspect or record cookie values.
2. Install a newer unsigned internal-preview candidate with the same product identity over the existing installation for the same Windows user. Confirm the restarted application retains the existing desktop profile and only exposes data authorized by the server session.
3. Use a server-rejected or expired session in a controlled environment. Confirm the server creates or restores only a usable session under its existing rules; the desktop does not reveal another identity or construct a local replacement identity.
4. Confirm local profile reset. Verify the trusted-origin browser data is cleared, compatibility runs again, and no server delete API is called for conversations, memory, or StreamRun data.
5. Repeat the close/reopen check from a different Windows user account. Confirm its profile and authorized conversation visibility remain separate from the first Windows account.
6. Record only pass/fail, Windows user scope, desktop release, and compatibility result. Do not record cookies, conversation content, prompts, or server data.

## Trusted Image Save and Clipboard Boundaries

1. From the current trusted workspace, initiate a user-clicked save for a generated PNG, JPEG, or WebP image result. Confirm the native save dialog opens with the sanitized image filename and matching image filter.
2. Cancel the native save dialog. Confirm no file is created and the desktop does not fall back to a network-content or arbitrary-path download.
3. Trigger an automatic download, a redirecting download, an off-origin URL, an unsafe scheme, and an unsupported image MIME/extension. Confirm each is denied without a file path being selected or written.
4. Use the existing trusted user gesture to copy text. Confirm clipboard write follows the webapp flow. Attempt clipboard read, camera/microphone, and other undeclared permissions; confirm they are denied.
5. Record only pass/fail and sanitized policy evidence. Do not record image contents, clipboard text, cookies, prompts, or file paths.

## Failure Boundaries

1. Disconnect the network or make the compatibility endpoint unavailable. Confirm the app reaches packaged local recovery within the same five-second attempt budget.
2. Confirm recovery shows only a safe code and fixed retry/reset actions. It must not show raw TLS/network details, chat content, cookie values, or an upgrade URL.
3. Do not use TLS bypass switches, a production Origin override, or a browser fallback during this smoke.

## macOS arm64 DMG Install and Gatekeeper

1. On an Apple Silicon Mac, mount the same-commit unsigned internal-preview DMG only after the server-first gate has passed. Confirm the manifest platform is `darwin-arm64` and its SHA-256 matches the DMG.
2. Drag `AI Mind Desktop.app` to Applications and start it. If Gatekeeper blocks the first start, use Finder's controlled right-click/Open action and confirm the system prompt. Do not disable Gatekeeper globally or use quarantine-removal commands.
3. Confirm the displayed application architecture is Apple Silicon arm64, not Intel or universal. Record only the macOS release, architecture, desktop version, compatibility result, and pass/fail.
4. Repeat the fresh-start, recovery, profile continuity, controlled image save, and security-denial scenarios above. For overlay verification, replace the same app bundle for the same macOS user and confirm only the existing platform profile is retained.
