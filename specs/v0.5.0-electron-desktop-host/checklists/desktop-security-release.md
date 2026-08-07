# Desktop Security & Release Requirements Checklist: AI Mind Desktop Host

**Purpose**: 以评审与内部预览发布为使用场景，检查 v0.5.0 桌面宿主的安全、恢复、发布要求是否完整、清晰且可验收。
**Created**: 2026-08-03
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md)

**Depth**: Standard · **Actor/Timing**: PR reviewer / 内部预览候选发布前

## Requirement Completeness

- [x] CHK001 - 受信生产 Origin 的唯一性、所有者、变更审批和 packaged build 禁止覆盖的要求是否完整定义？[Completeness, Resolved: Spec §FR-002; Plan §Change Control and Existing Facts]
- [x] CHK002 - workspace persistent profile 与 recovery memory session 的资料隔离、保留期和 reset 范围是否都已定义？[Completeness, Resolved: Spec §FR-005, FR-015, FR-024; Data Model §DesktopSessionProfile, §DesktopRecoverySession]
- [x] CHK003 - compatibility API 的版本、无身份边界、允许状态和未知 response 的 fail-closed 规则是否都有可追溯要求？[Completeness, Resolved: Contract: desktop-compatibility-api]
- [x] CHK004 - recovery 页面允许的用户操作、明确拒绝的网络/外链/下载能力，以及本地静态资源范围是否完整规定？[Completeness, Resolved: Contract: desktop-host-policy §Recovery Bridge]
- [x] CHK005 - 外链允许范围中，pointer、keyboard、`window.open`、form target 与合成事件的处理要求是否完整覆盖？[Completeness, Resolved: Spec §FR-008; Contract: desktop-host-policy §Navigation and External Opening]
- [x] CHK006 - 图像保存的来源、原生用户手势、redirect、URL chain、文件名、MIME 和用户保存选择等条件是否完整定义？[Completeness, Resolved: Spec §FR-016; Data Model §DesktopDownloadRequest; Contract: desktop-host-policy §Download Policy]
- [x] CHK007 - CSP document、API、static 与 prefetch 的分路由边界，以及新增路由后的归属规则是否已定义？[Completeness, Resolved: Contract: web-security-headers §Route Scope]
- [x] CHK008 - 内部预览候选的 server 前置发布、生产验证、artifact 证据、分发限制和 server rollback 顺序是否完整定义？[Completeness, Resolved: Contract: desktop-preview-release]

## Requirement Clarity

- [x] CHK009 - “受信工作页 main frame”“同源图片结果”和“安全图像来源”是否有足以判定的精确定义？[Clarity, Resolved: Spec §FR-016; Data Model §DesktopDownloadRequest]
- [x] CHK010 - “可稳定辨识的外链交互”的判定证据、不可辨识时的用户可见结果和允许范围是否明确？[Clarity, Resolved: Spec §FR-008; Plan §8 external-opening feasibility gate]
- [x] CHK011 - 5 秒总时限的起点、涵盖阶段、超时结果与旧 attempt 异步结果处理是否无歧义？[Clarity, Resolved: Spec §FR-014, SC-005; Data Model §DesktopHostState]
- [x] CHK012 - “正常会话使用”哪些请求会续期 cookie、compatibility API 为什么例外，是否被明确限定？[Clarity, Resolved: Plan §5; Contract: desktop-host-policy §Session Persistence Boundary]
- [x] CHK013 - “受控内部渠道”“暂停分发”和“内部预览候选”是否有明确责任主体与可审计含义？[Clarity, Resolved: Spec §FR-023; Contract: desktop-preview-release §Responsibilities and Audit Record]
- [x] CHK014 - 规格中的 `DownloadItem.hasUserGesture()` 是否有意作为不可替换的安全需求，而不是应下沉到 technical contract 的实现细节？[Clarity, Resolved: Spec §FR-016; Data Model §DesktopDownloadRequest]

## Requirement Consistency

- [x] CHK015 - 不兼容状态仅显示内部渠道升级说明、不得应用内打开升级 URL 的要求是否在 User Story、Edge Case、FR-013 和 recovery contract 中一致？[Consistency, Resolved: Spec §User Story 5, Edge Cases, FR-013; Contract: desktop-host-policy]
- [x] CHK016 - “连续 30 天未使用失效”的会话承诺是否与 profile reset、手动覆盖安装和普通网页端的说明一致？[Consistency, Resolved: Spec §FR-005, FR-015, SC-003; Data Model §Reset and Upgrade Semantics]
- [x] CHK017 - 外链一律由系统浏览器处理、Electron 内不嵌入外站的要求是否与新窗口、重定向和 recovery 规则一致？[Consistency, Resolved: Spec §FR-007, FR-008; Contract: desktop-host-policy §Trust Zones]
- [x] CHK018 - “不自动更新、未签名内部预览”的版本边界是否与 Squirrel metadata、手动覆盖安装和 hash manifest 的措辞一致？[Consistency, Resolved: Spec §FR-011, FR-022; Plan §7; Contract: desktop-preview-release]
- [x] CHK019 - service fail-closed、无 HTTP/Origin fallback 与 server rollback 的要求是否没有形成相互冲突的恢复承诺？[Consistency, Resolved: Spec §FR-014, FR-021, FR-023; Contract: desktop-preview-release §Rollback Rule]

## Acceptance Criteria Quality

- [x] CHK020 - SC-001 的“正常网络”前提、起止点和 Windows 设备范围是否足以让不同评审者得出一致结论？[Measurability, Resolved: Spec §SC-001, §Acceptance Evaluation Set]
- [x] CHK021 - SC-005 是否能以单次 attempt 的统一时限、明确失败类别和本地失败状态客观判定？[Measurability, Resolved: Spec §SC-005; Data Model §DesktopHostState]
- [x] CHK022 - SC-003 与 SC-007 的“100%”样本范围、账号/Windows 用户边界和覆盖安装条件是否已量化？[Measurability, Resolved: Spec §SC-003, SC-007, §Acceptance Evaluation Set]
- [x] CHK023 - SC-011 的“100% 分发安装包和配套发布说明”是否明确包含 artifact、manifest、内部渠道说明及其版本对应关系？[Measurability, Resolved: Spec §SC-011, §Acceptance Evaluation Set; Contract: desktop-preview-release §Candidate Evidence]

## Scenario and Edge-case Coverage

- [x] CHK024 - 并发 retry、reset 期间 second-instance、旧 attempt 回调与窗口异常关闭的状态优先级是否都有需求定义？[Coverage, Resolved: Spec §Edge Cases; Data Model §DesktopHostState]
- [x] CHK025 - workspace profile 损坏、恢复 session 创建失败、包内 recovery asset 缺失或 protocol 白名单拒绝时的用户可见安全结果是否有要求？[Coverage, Resolved: Spec §FR-014, §Edge Cases; Contract: desktop-host-policy §Bootstrap Failure Handling]
- [x] CHK026 - `manual_upgrade_required` 的最低版本字段缺失、格式不合法或与当前版本无逻辑关系时的 fail-closed 要求是否已完整定义？[Coverage, Resolved: Spec §Edge Cases; Contract: desktop-compatibility-api §Desktop Client Rules]
- [x] CHK027 - 下载的 MIME 与扩展名不一致、URL chain 含 redirect、native save 被取消及图片 Blob 生命周期异常时的需求是否一致完整？[Coverage, Resolved: Spec §FR-016, §Edge Cases; Contract: desktop-host-policy §Download Policy]
- [x] CHK028 - CSP resource inventory 新增字体、connect source、图像格式、document 路由或元素内联样式兼容范围时的变更评审和 requirements 同步规则是否已定义？[Coverage, Resolved: Contract: web-security-headers §Document Response Rules; Plan §Change Control and Existing Facts]

## Dependencies and Governance

- [x] CHK029 - Windows x64 CI、受支持的 Electron/Forge 版本、最小依赖安装权限和生产 server deploy route 是否作为显式依赖记录？[Dependency, Resolved: Plan §8; Research §Decision 10, §Decision 11]
- [x] CHK030 - 当前 webapp 的 StreamRun/hydration 语义、cookie 续期行为和图像下载链接形式是否作为必须保持的外部事实源明确列出？[Dependency, Resolved: Plan §Change Control and Existing Facts]
- [x] CHK031 - 受信 Origin、release metadata、compatibility policy 与安全 headers 的任何变更是否要求同一 canonical spec 资产同步更新？[Traceability, Resolved: Constitution §9; Spec §FR-002, FR-023; Plan §Change Control and Existing Facts]

## Notes

- 本清单评估“需求写得是否足够好”，不是实现测试或 QA 用例。
- 勾选时可在条目末尾补充发现、决策链接或待澄清内容；不要以勾选代替 spec/plan 的实际修订。
