# Acceptance: AI Mind Desktop Host

**Feature**: `v0.5.0-electron-desktop-host`
**Version**: `v0.5.0`
**Status**: 仓库修复与公开 Beta 发布链路已完成；运营验收待执行
**Scope**: Windows x64 与 macOS arm64 的未签名公开 Beta（`Unsigned Experimental Preview`）

## Purpose

本文件是 v0.5.0 的执行期验收台账。每项实现、自动化验证、Windows/macOS smoke 和生产验证完成后，在对应条目记录脱敏证据与结果。它不替代 `spec.md`、`plan.md`、`tasks.md`、contracts 或测试报告。

除明确允许的 build/release metadata 外，不记录聊天正文、图片、Prompt、cookie、session/user identifier、secret、原始错误、证书详情、文件路径或保存路径。

## Closing Evidence: 2026-08-05

This implementation workspace completed the following repository gates:

| Gate                      | Result | Evidence                                                              |
| ------------------------- | ------ | --------------------------------------------------------------------- |
| `pnpm lint`               | Pass   | Completed with seven pre-existing Fast Refresh warnings and no errors |
| `pnpm typecheck`          | Pass   | All five workspace packages completed                                 |
| `pnpm test:stable`        | Pass   | 151 test files and 1006 tests passed                                  |
| `pnpm build`              | Pass   | Workspace boundary validation and production web build completed      |
| Desktop stable tests      | Pass   | 72 tests passed                                                       |
| Desktop integration tests | Pass   | 18 tests passed                                                       |
| CI governance tests       | Pass   | Seven tests passed; Windows lane remains non-distributable            |
| Shell syntax              | Pass   | `deploy-production.sh` and `verify-production.sh` passed `bash -n`    |

The fixed production Origin was probed with candidate version `0.5.0`. The compatibility
endpoint returned `404`, and `/` plus `/instant-mind` did not return the required v0.5.0
CSP/security headers. This is a server-first gate failure, not a client fallback case.
该次历史探测没有创建制品、manifest、SHA-256、发布记录或安装 smoke 证据；它不代表后续公开 Beta 发布链路的当前线上状态。

**Closing status**: 仓库实现、规格资产和公开 Beta 发布链路已完成；只有包含 T115-T119 的同一候选 commit 合并、部署并通过生产验证后，才能手动创建 GitHub Pre-release，再完成 Windows/macOS 安装 smoke。

## macOS arm64 Extension Evidence: 2026-08-06

| Gate                                   | Result  | Evidence                                                                                         |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Locked dependency installation         | Pass    | `pnpm install --frozen-lockfile` completed with the DMG maker locked at 7.11.2                   |
| Desktop lint and typecheck             | Pass    | `pnpm --filter @ai-mind/desktop lint` and `typecheck` completed locally                          |
| Desktop platform-policy tests          | Pass    | 11 test files and 77 tests passed, including manifest, diagnostics, and Forge maker policy       |
| CI governance and test-lane validators | Pass    | macOS arm64 CI policy and managed test-lane validators passed locally                            |
| macOS DMG/package audit                | Pass    | Run `31190520337`, job `92906756122`, completed DMG, architecture, hash, fuse, and content audit |
| Public Beta release                    | Blocked | T071/T072 server-first deployment and production verification remain incomplete                  |

The macOS implementation accepts only `darwin-arm64`; Intel and universal values are
rejected. Its post-fuse `codesign --sign -` step is ad-hoc local re-signing, not a
Developer ID signature or notarization.

## Pre-release Audit Remediation Evidence: 2026-08-06

| Gate                             | Result          | Evidence                                                                                                                                                        |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop typecheck and lint       | Pass            | `pnpm --filter @ai-mind/desktop typecheck` and `lint` completed after remediation                                                                               |
| Desktop stable tests             | Pass            | 14 files / 102 tests, including an actual `app.asar` entry containing `.env.production`                                                                         |
| Desktop integration tests        | Pass            | 20 Playwright Electron tests, including native safe-dialog retry/exit and local Chrome bootstrap failures                                                       |
| Governance validators            | Pass locally    | 21 Node subtests passed; the Linux deployment-host production-verifier behavior test, including lowercase HTTP header parsing, was correctly skipped on Windows |
| Production verifier shell syntax | Not run locally | Local WSL Bash service returned `E_ACCESSDENIED`; actual production verifier execution remains T072 only                                                        |
| Public Beta release              | Blocked         | T071/T072 server-first deployment and production verification remain incomplete                                                                                 |

The remediation changes do not create an installer, manifest, hash, source commit, server
deployment, or distribution record. Linux CI will execute the production-verifier behavior
test; fixed-Origin production verification remains a T072 release gate.

## Package Compatibility Remediation Evidence: 2026-08-07

The prior local Windows `pnpm package` attempt was not acceptable: its generated executable
exited before application startup with `Error loading V8 startup snapshot file`. Inspection
confirmed that Electron `43.2.0` had `LoadBrowserProcessSpecificV8Snapshot` enabled while
the packaged runtime contained only `v8_context_snapshot.bin`, not the required browser
snapshot. The source baseline and actual-artifact verifier now require this optional fuse to
be disabled; the Node/ASAR security fuse baseline remains unchanged.

| Gate                               | Result       | Evidence                                                                                                                                                                                          |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop stable tests               | Pass         | `pnpm --filter @ai-mind/desktop test:stable`: 14 files / 102 tests                                                                                                                                |
| Desktop typecheck                  | Pass         | `pnpm --filter @ai-mind/desktop typecheck`                                                                                                                                                        |
| Desktop lint                       | Pass         | `pnpm --filter @ai-mind/desktop lint`                                                                                                                                                             |
| Rebuilt package and artifact audit | Pass locally | A clean non-distributable Windows package was rebuilt; its installer hash, Fuse wire, and actual package contents passed verification. Packaged startup smoke remains manual acceptance evidence. |

## CI Remediation Evidence: 2026-08-07

GitHub Actions run `31163422022` exposed three independent desktop-verification failures:
the Ubuntu integration runner had no X server, Squirrel.Windows lacked required NuGet
metadata, and macOS Playwright fixtures could not find the development Dock icon. Local
CI-equivalent packaging then exposed a fourth issue: Windows ASAR entry enumeration uses
native separators, while the audit passed slash-normalized paths back to the ASAR reader.
Run `31165837108` confirmed the stable, Docker, and Windows desktop jobs pass, including
the Windows Squirrel make and package audit. Its stateful job exposed one remaining
environment boundary: Xvfb created `DISPLAY`, but Turborepo strict env mode did not pass
that variable to the desktop workspace process. `turbo.json` now declares
`test:integration.passThroughEnv: ["DISPLAY"]`; the workflow governance test locked that
first remediation. Run `31167549129` then proved `DISPLAY` alone was insufficient: Xvfb
reported `Authorization required` because strict env mode also removed `XAUTHORITY`.
The contract now passes both variables. The same run reduced macOS failures to the four
fixtures that load the real `main.ts`: clean runners do not contain Forge's
`.webpack/renderer`, so local Chrome bootstrap entered recovery before any workspace
appeared. A shared test-side fixture now creates a temporary app root with minimal
renderer/preload/icon assets, isolates `appData` and `userData`, and removes no files
until Electron exits. Teardown waits for the actual child process and force-terminates
only after a short graceful-close timeout.

Run `31172141263` confirmed the X11 remediation: Linux no longer reported a missing
display or Xauthority failure. Linux and macOS then failed only the same four real-main
fixtures. An exact Linux/amd64 + Xvfb reproduction exposed the original production
exception hidden by the native-safe fallback: `resolveDesktopUserDataPath()` selected
`path.win32` for POSIX `/tmp/...` and `/Users/...` paths because Node also considers
those paths absolute under `path.win32`. The resulting backslash path made Electron
throw `Path must be absolute`. The resolver now handles POSIX absolute paths before
Windows/UNC paths and rejects relative input. On the failing commit the container
reproduced 16 passing and 4 failing integration tests; after this minimal correction,
desktop stable passed 103/103 and integration passed 20/20.

| Gate                                     | Result       | Evidence                                                                                                             |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Desktop typecheck and lint               | Pass         | `pnpm --filter @ai-mind/desktop typecheck` and `lint`                                                                |
| Desktop stable tests                     | Pass         | 14 files / 103 tests; includes nested clean-ASAR traversal and forbidden-entry coverage                              |
| Development Electron integration         | Pass         | `pnpm --filter @ai-mind/desktop test:integration`: 20 tests                                                          |
| CI and governance validators             | Pass         | 22 Node governance tests (one Linux deployment-host test skipped by design)                                          |
| GitHub Actions runtime                   | Updated      | `checkout@v5`, `setup-node@v5`, and `pnpm/action-setup@v4.4.0` run on Node 24; Node 22 remains the project runtime   |
| Non-distributable Windows package        | Pass locally | `pnpm --filter @ai-mind/desktop make:windows` completed after Squirrel metadata remediation                          |
| Windows package fuse/hash/contents audit | Pass locally | `verify-release-artifact.mjs` passed against the generated `win32-x64` package                                       |
| Windows GitHub job                       | Pass         | Run `31190520337`, job `92906756031`, completed desktop tests, Squirrel make, and fuse/hash/package audit            |
| Stateful GitHub job                      | Pass         | Run `31190520337`, job `92906756131`, completed the Xvfb-backed integration lane                                     |
| macOS arm64 GitHub job                   | Pass         | Run `31190520337`, job `92906756122`, completed native build verification, tests, DMG make, and final artifact audit |

The local package and manifest/hash are CI-equivalent, non-distributable test outputs under
ignored `apps/desktop/out/`; they are not public Beta candidates and were not uploaded or
distributed. The server-first production gate, T071/T072, and all manual smoke evidence
remain unchanged.

## macOS DMG Native Build Remediation Evidence: 2026-08-07

GitHub Actions run `31182847863`, job `92880933374`, passed macOS packaging, fuse
modification, and ad-hoc signing, then failed in Forge's DMG maker because
`macos-alias` could not load `build/Release/volume.node`. The clean-install log showed
that pnpm had ignored the build scripts for `macos-alias@0.2.12` and
`fs-xattr@0.3.1`. This isolates the failure to the DMG dependency install policy; it is
not evidence of a fuse, signing, application-package, or architecture failure.

| Gate                                        | Result | Evidence                                                                                                                                     |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm build-script policy                    | Pass   | Run `31190520337` used explicit `fs-xattr`/`macos-alias` entries while wildcard build permissions remained rejected                          |
| Platform-specific policy verification       | Pass   | Windows and macOS jobs passed their distinct required-build checks                                                                           |
| macOS native module load before Forge make  | Pass   | Job `92906756122` loaded both `xattr.node` and `volume.node` before packaging                                                                |
| macOS arm64 DMG make                        | Pass   | The same job completed the non-distributable Forge DMG maker                                                                                 |
| Absolute artifact path into desktop scripts | Pass   | The same job completed manifest generation and final artifact verification with absolute DMG/package paths                                   |
| Existing CI workflow boundaries             | Pass   | Stable, Stateful, Windows, macOS, and Docker jobs all passed; no production secret, release asset upload, public Beta release, or deploy ran |

Run `31190520337` passed all five CI jobs. The native macOS arm64 job proved clean
installation, native-module loading, development tests, DMG creation, architecture, manifest,
hash, fuses, and package contents. This remediation does not authorize public Beta release or
change T071/T072.

## Current Public Beta Status

- 维护者已将此前 v0.5.0 桌面宿主代码合并到 `main` 并部署线上。
- 当前分支的 `public-beta` metadata、公开发布 Workflow 与本次规格恢复仍待合并；它们部署后才构成可运行生产 verifier 的同一候选 commit。
- 2026-08-05 的 `404` 探测保留为历史证据，不作为当前公开 Beta 候选的生产验证结果。
- 2026-08-08 已重新通过 `pnpm --filter @ai-mind/desktop test:stable`（103 tests）和 `node --test scripts/validate/validate-ci-workflow.test.mjs`（4 tests）。

## Public Beta Spec Recovery Validation: 2026-08-08

| Gate                           | Result | Evidence                                                                                |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| Desktop stable tests           | Pass   | `pnpm --filter @ai-mind/desktop test:stable`: 14 files / 103 tests                      |
| Desktop integration tests      | Pass   | `pnpm --filter @ai-mind/desktop test:integration`: 20 tests                             |
| Workflow governance            | Pass   | `node --test scripts/validate/validate-ci-workflow.test.mjs`: 4 tests                   |
| Workspace lint                 | Pass   | `pnpm lint`: 0 errors; 7 existing Fast Refresh warnings                                 |
| Workspace typecheck            | Pass   | `pnpm typecheck`: all 7 Turbo tasks succeeded                                           |
| Spec Kit analysis and converge | Pass   | No Constitution conflict, no unmapped buildable requirement and no new convergence task |
| Diff hygiene                   | Pass   | `git diff --check`                                                                      |

## Release Decision

| Gate                        | Required evidence                                                                                                  | Result                          | Evidence reference                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Scope                       | Windows x64 与 macOS arm64、online host、`public-beta`、`unsigned`；无 auto-update、正式签名/公证或本地 AI Runtime | Pass (repository review)        | T069 audit; T115-T119 public Beta release workflow; operational evidence pending                            |
| Automated quality           | `pnpm lint`、`pnpm typecheck`、`pnpm test:stable`、`pnpm build` 通过                                               | Pass                            | Closing Evidence: 2026-08-05                                                                                |
| Desktop remediation quality | Current desktop typecheck/lint/stable/integration and governance tests pass                                        | Pass locally                    | Pre-release Audit Remediation Evidence: 2026-08-06                                                          |
| Windows desktop lane        | locked install、desktop unit、development Electron integration、不可分发 `make:windows`、fuse/package audit 通过   | Pass                            | Run `31190520337`, job `92906756031`                                                                        |
| macOS arm64 desktop lane    | native locked install、desktop unit/integration、不可分发 DMG、architecture/fuse/package audit 通过                | Pass                            | Run `31190520337`, job `92906756122`                                                                        |
| Server-first gate           | production compatibility API 与 document security headers 已由既有 server deploy route 上线并验证                  | Not run for current candidate   | Historical 2026-08-05 probe returned 404; re-run T072 after merging and deploying the public Beta candidate |
| Public Beta assets          | 仅在 server-first gate 通过后，创建同一 commit 的 GitHub Pre-release、安装器、平台 manifest 与 SHA-256             | Not run                         | -                                                                                                           |
| Manual smoke                | fresh install、overlay install、核心场景和安全拒绝场景完成                                                         | Not run                         | -                                                                                                           |
| Spec closing                | T068 spec drift 同步、`speckit-analyze`、阶段工程审计和 `speckit-converge` 已完成                                  | Pass with operational follow-up | T069; Phase 10 T070-T075                                                                                    |

**Release decision**: 在所有门禁通过且证据已关联前，不得手动创建公开 GitHub Pre-release。

## Environment Record

每次 Windows 验收或 production verification 填一行。允许记录版本和安全状态，不记录身份、cookie 或用户内容。

| Run ID | Date | Commit | Windows version | Desktop Release | Electron version | Server version | Compatibility state | Operator | Result  |
| ------ | ---- | ------ | --------------- | --------------- | ---------------- | -------------- | ------------------- | -------- | ------- |
| -      | -    | -      | -               | -               | -                | -              | -                   | -        | Not run |

## Candidate Traceability

每个公开 Beta 候选只记录必要的 release 审计字段。三个角色可以由同一获授权人员承担，但都必须明确记录；不记录用户名、cookie、聊天、Prompt、secret、原始错误或文件路径。

| Source commit | Version owner role | Server deploy operator role | GitHub Pre-release publisher role | Installer | Manifest | SHA-256 file | Release URL | Result  |
| ------------- | ------------------ | --------------------------- | --------------------------------- | --------- | -------- | ------------ | ----------- | ------- |
| -             | -                  | -                           | -                                 | -         | -        | -            | -           | Not run |

## Success-Criteria Evaluation Set

对每个候选，SC-001、SC-003、SC-007 与 SC-011 必须按照 `spec.md` 的固定样本集逐行记录；所有列均为 Pass 才能将相应的“100%”或启动目标视为达成。

| Criterion | Required sample                                                                              | Evidence reference | Result  |
| --------- | -------------------------------------------------------------------------------------------- | ------------------ | ------- |
| SC-001    | Fresh install + fresh desktop profile on a recorded Windows x64 host                         | -                  | Not run |
| SC-003    | New/existing desktop session, existing web session, rejected or expired session              | -                  | Not run |
| SC-007    | Fresh install, same-product overlay install, confirmed reset, reset recheck                  | -                  | Not run |
| SC-011    | Installer, manifest, SHA-256, GitHub Pre-release URL and native About use one commit/version | -                  | Not run |

## Automated Acceptance

| Area                                 | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                     | Primary tasks              | Required evidence                                                                                                                                                                        | Result                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Compatibility API                    | Strict v1 DTO; invalid input fails closed; no identity, DB, cookie or upgrade URL; `Cache-Control: no-store`                                                                                                                                                                                                                                                                                                                                          | T007-T010                  | Route/policy tests passed; production result pending                                                                                                                                     | Pass locally                                                           |
| Web security headers                 | Document nonce CSP for scripts; Web document and local Chrome/recovery CSS use exactly `style-src 'self' 'unsafe-inline'` with no style nonce/hash or `style-src-attr`; Web scripts remain nonce-restricted and local scripts remain `'self'` with no `unsafe-eval`; API/static/image/prefetch and local resource allowlists preserve their separate semantics                                                                                        | T011-T012, T092-T100, T106 | Header and local protocol regression tests, current desktop typecheck/lint, and Linux-only production-verifier behavior test are present; production verification remains a release gate | Pass locally                                                           |
| Responsive workspace layout          | At widths below `lg`, the mobile conversation bar spans the page outer width while heading, messages, and composer retain the `53.5rem` content column; desktop sidebar and native About remain unchanged                                                                                                                                                                                                                                             | T086                       | Page structure regression test, typecheck, lint, and browser smoke                                                                                                                       | Pass locally                                                           |
| Desktop chrome layout                | Local AI Mind brand, existing `查看` and `帮助` menus, and platform window controls occupy one title-bar row; the application menu row is hidden, and remote workspace has no menu bridge                                                                                                                                                                                                                                                             | T087                       | Desktop Chrome bridge/unit tests and Forge development smoke                                                                                                                             | Pass locally                                                           |
| Cross-platform desktop chrome        | New desktop windows open at `1280 × 800` so the `lg` conversation sidebar is visible, while `720 × 480` remains the responsive minimum; Windows has light native right-side controls and a continuous bottom divider; macOS has native left-side traffic lights; the light Chrome row keeps the existing menus interactive, limits `no-drag` to their content bounds, keeps remaining title-bar area draggable, and avoids overlap at supported sizes | T088-T091, T102-T104       | Local protocol/bridge/startup tests plus Windows and macOS native smoke                                                                                                                  | Pass locally; macOS native smoke remains required                      |
| Desktop application icon             | The generated transparent AI Mind PNG master produces a multi-image Windows `.ico` and macOS `.icns`; packaged applications embed the platform asset, and Squirrel `Setup.exe`/`Update.exe` use the same `.ico` without an install-time remote icon URL                                                                                                                                                                                               | T105                       | Icon-container and Forge config tests; Windows installer and macOS DMG visual smoke                                                                                                      | Pass locally; packaged visual smoke remains required                   |
| Local Chrome CSP and workspace route | Local Chrome and recovery load only their actual packaged JS/CSS assets; local CSS uses `style-src 'self' 'unsafe-inline'`, while scripts remain `'self'` without `unsafe-eval`; renderer webpack uses non-eval `source-map`; compatibility success opens fixed `/instant-mind`, never a user-configured URL                                                                                                                                          | T088-T091, T098-T101       | Local protocol unit tests, desktop typecheck/lint, Electron startup integration and Forge smoke                                                                                          | Pass locally; development-process restart required after config change |
| Build and package policy             | Packaged build uses only fixed production HTTPS Origin; dev Origin is unpackaged-only; fuses match policy; every actual `app.asar` entry is audited for forbidden names/content                                                                                                                                                                                                                                                                       | T013-T014, T019-T020, T108 | Desktop stable tests include actual ASAR entry rejection; actual public-beta package audit remains pending                                                                               | Pass locally                                                           |
| Profile and local protocol           | Persistent workspace profile and isolated recovery memory session; ASAR allowlist; no inherited browser state                                                                                                                                                                                                                                                                                                                                         | T015-T018                  | Desktop stable/integration tests passed                                                                                                                                                  | Pass locally                                                           |
| Remote window security               | No preload/Node/webview; off-origin navigation, redirect, popup and undeclared permissions denied                                                                                                                                                                                                                                                                                                                                                     | T021-T027                  | Windows behavior evidence plus desktop integration tests passed                                                                                                                          | Pass locally                                                           |
| Compatibility and recovery           | `ses.fetch()` uses remaining shared five-second budget; compatible is the sole workspace admission; stale callbacks cannot revive workspace; failed local Chrome/recovery bootstrap destroys its shell and enters retry/exit-safe recovery                                                                                                                                                                                                            | T028-T038, T107            | Desktop stable/integration tests passed                                                                                                                                                  | Pass locally                                                           |
| Diagnostics and reset                | Diagnostic uses an allowlist and has no upload; reset clears local trusted data only, then rechecks compatibility                                                                                                                                                                                                                                                                                                                                     | T030-T038                  | Desktop stable/integration tests passed                                                                                                                                                  | Pass locally                                                           |
| Startup and Safe MVP                 | Single instance; only compatible state loads fixed Origin; chat input interactive within startup criterion; native About is local                                                                                                                                                                                                                                                                                                                     | T039-T043                  | Desktop integration tests passed; Windows fresh-install smoke pending                                                                                                                    | Pass locally                                                           |
| Existing Runtime behavior            | Image, controlled Agent, history and persisted StreamRun terminal state retain webapp semantics; no cancel/re-subscribe/fake completion                                                                                                                                                                                                                                                                                                               | T044-T047                  | Desktop integration tests passed                                                                                                                                                         | Pass locally                                                           |
| Download and clipboard               | Only trusted user-gesture image downloads with one safe URL chain reach native save dialog; clipboard read and unsafe downloads denied                                                                                                                                                                                                                                                                                                                | T048-T052                  | Desktop unit/integration tests passed                                                                                                                                                    | Pass locally                                                           |
| Session continuity                   | Thirty-day sliding cookie in web and desktop; overlay install retains profile; reset does not delete server data                                                                                                                                                                                                                                                                                                                                      | T053-T058                  | Route/session/profile tests passed; Windows overlay smoke pending                                                                                                                        | Pass locally                                                           |
| CI and release validation            | Windows job has no production secret/deploy and creates only non-distributable `make:windows`; production verifier checks API and the exact document CSS directive                                                                                                                                                                                                                                                                                    | T059-T061, T106, T109      | Governance tests pass locally; Linux-only verifier behavior test and T072 production execution remain pending                                                                            | Pass locally                                                           |

## Manual Windows Acceptance Matrix

| Scenario                  | Expected result                                                                                                                                                                              | Evidence to record                                                      | Result  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Fresh install and startup | From first `attemptId` creation to fixed-Origin workspace visible with an interactive existing chat input is at most 10 seconds on a real trusted HTTPS path without injected throttle/fault | Windows/Desktop/Server versions, compatibility state, measured duration | Not run |
| Normal chat               | Existing send, stream display, stop and error feedback work in the desktop workspace                                                                                                         | Pass/fail only; no chat content                                         | Not run |
| Native About              | In workspace and recovery states, native About displays desktop version, `public-beta`, `unsigned` and fixed Origin; it opens no URL                                                         | Displayed fields and pass/fail                                          | Not run |
| Existing features         | Image generation, controlled Agent and permitted conversation history behave as the webapp does                                                                                              | Scenario names and pass/fail                                            | Not run |
| Stream lifecycle          | Close, renderer crash, sleep/resume and second instance send no cancel, do not re-subscribe and show only existing hydrated/persisted terminal state                                         | Event type and pass/fail                                                | Not run |
| Compatibility states      | `compatible`, `manual_upgrade_required` and unavailable each have the expected local/workspace outcome                                                                                       | State and pass/fail                                                     | Not run |
| Network/TLS failure       | Offline, DNS, TLS, HTTP/schema and workspace-load failures reach packaged recovery within the same five-second attempt budget without HTTP/TLS fallback                                      | Safe error code and measured duration                                   | Not run |
| Profile continuity        | Close/reopen and same-product overlay install preserve local profile; expired/rejected session never exposes another identity's data                                                         | Scenario and pass/fail only                                             | Not run |
| Local reset               | Confirmed reset clears local trusted browser data only; server session/memory data is not deleted                                                                                            | Result and no-delete verification                                       | Not run |
| External links            | Windows/Electron behavior gate leaves no safely distinguishable external-open vector; every external-open request remains denied and no system browser window opens                          | Vector class and pass/fail                                              | Not run |
| Download and clipboard    | Trusted image save opens native dialog; cancellation writes no file; auto/redirect/off-origin/unsafe downloads and clipboard read are denied                                                 | Scenario class and pass/fail                                            | Not run |
| Diagnostic                | Copy/export includes required safe fields, excludes sensitive data and causes no upload                                                                                                      | Scan result and pass/fail                                               | Not run |

## Manual macOS arm64 Acceptance Matrix

| Scenario                | Expected result                                                                                                                         | Evidence to record                                   | Result  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- |
| Fresh DMG install       | A `darwin-arm64` DMG installs on an Apple Silicon Mac and reaches the fixed-Origin workspace or local recovery                          | macOS release, arm64, compatibility state, pass/fail | Not run |
| Gatekeeper first launch | Finder right-click/Open may be used for the unsigned app; Gatekeeper is not globally disabled and no quarantine-removal command is used | Pass/fail only                                       | Not run |
| Overlay install         | Replacing the same app bundle for the same macOS user retains only the existing platform profile                                        | Scenario and pass/fail only                          | Not run |
| Package audit           | DMG, manifest, SHA-256, executable architecture, and fuse audit all state `darwin-arm64`; Intel and universal output are absent         | Sanitized audit result                               | Not run |

## Public Beta Release Asset Acceptance

| Check                 | Expected result                                                                                                                                                            | Result  | Evidence reference |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ |
| Distribution boundary | GitHub Pre-release、制品、应用 About 与说明均显著标记 `Unsigned Experimental Preview`、`public-beta` 与 `unsigned`                                                         | Not run | -                  |
| Manifest and hash     | `desktop-release.json` fields match the actual `win32-x64` or `darwin-arm64` artifact and SHA-256                                                                          | Not run | -                  |
| Package contents      | Every actual `app.asar` entry plus packaged path is audited; no `.env`, secret, signing credential, user profile, dev Origin fallback, `autoUpdater` or telemetry endpoint | Not run | -                  |
| Fuses                 | Actual package enables cookie encryption, ASAR integrity and ASAR-only loading; disables RunAsNode, Node options and inspect arguments                                     | Not run | -                  |
| Server-first sequence | Existing server deploy and production verification succeeded before GitHub Pre-release creation                                                                            | Not run | -                  |
| Rollback readiness    | Server rollback without compatibility API/security headers first pauses matching GitHub Pre-release; installed clients remain fail closed                                  | Not run | -                  |

## Required Commands

Record the command, platform, exit result and a sanitized report reference after execution. Do not paste environment values, cookies or secrets.

```text
pnpm lint
pnpm typecheck
pnpm test:stable
pnpm build
pnpm --filter @ai-mind/desktop test:stable
pnpm --filter @ai-mind/desktop make:windows
pnpm --filter @ai-mind/desktop make:macos-arm64
pnpm --filter @ai-mind/desktop verify:artifact
node apps/desktop/scripts/verify-pnpm-builds.mjs --platform win32-x64 --install-log .artifacts/desktop/pnpm-install.log --report .artifacts/desktop/pnpm-builds-win32-x64.json
node apps/desktop/scripts/verify-pnpm-builds.mjs --platform darwin-arm64 --install-log .artifacts/desktop/pnpm-install.log --report .artifacts/desktop/pnpm-builds-darwin-arm64.json
deploy/scripts/verify-production.sh
```

| Command                                          | Platform                            | Result  | Evidence reference                                         |
| ------------------------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------- |
| `pnpm lint`                                      | local Windows workspace             | Pass    | Closing Evidence: 2026-08-05                               |
| `pnpm typecheck`                                 | local Windows workspace             | Pass    | Closing Evidence: 2026-08-05                               |
| `pnpm test:stable`                               | local Windows workspace             | Pass    | Closing Evidence: 2026-08-05                               |
| `pnpm build`                                     | local Windows workspace             | Pass    | Closing Evidence: 2026-08-05                               |
| Desktop Windows lane                             | Windows x64                         | Pass    | Run `31190520337`, job `92906756031`                       |
| Desktop macOS lane                               | macOS arm64                         | Pass    | Run `31190520337`, job `92906756122`                       |
| `verify-pnpm-builds.mjs --platform win32-x64`    | Windows x64 CI                      | Pass    | Job `92906756031`; report remained in the runner workspace |
| `verify-pnpm-builds.mjs --platform darwin-arm64` | macOS arm64 CI                      | Pass    | Job `92906756122`; both required native modules loaded     |
| `verify-production.sh`                           | Production verification environment | Not run | -                                                          |

## Final Acceptance Sign-off

| Role                      | Confirmation                                                    | Name | Date |
| ------------------------- | --------------------------------------------------------------- | ---- | ---- |
| Implementation owner      | All scoped tasks are complete and linked evidence is accurate   | -    | -    |
| Security/release reviewer | Security, release order and rollback boundaries are satisfied   | -    | -    |
| Release owner             | GitHub Pre-release creation and release asset boundary approved | -    | -    |

**Final status**: Not accepted. This status may change to Accepted only after all required gates are Pass and the sign-off table is complete.
