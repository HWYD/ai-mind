# Chat Scroll Policy Contract

## Scope

FR-027/SC-010 前端本地契约，无 wire/API/数据库变化；D017、D022、D023、D024 与 plan 滚动修订为事实源。

## State

presentationKey 是展示身份，新建/真实切换更新，promotion 不更新。intent 为 following/reading，与 stream status 正交。历史 entry 必须收到尾项 mount/range/bottom/停止滚动观测才显示。geometry 为库总高、4px bottom、viewport、Footer 与当前 follow-up runway；`lastObservedTotalListHeight` 只存当前展示代次首个/最近一次总高，pending 至多一个事件驱动 follow rAF。runway eligibility 由接受的新问题 send 是否已有稳定历史决定，不从 acceptedTurnRevision 或 stream status 单独推断。

## Events

| 事件                                        | 结果                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 接受有历史的新问题 send                     | following，启用当前轮次 reply runway 并请求到底；拒绝/重连不重置                                                                                  |
| 接受首问/regenerate/resume                  | following，请求到底，不启用 reply runway                                                                                                          |
| 用户上阅/滚动条离底/手动展开                | reading，取消待发拉底                                                                                                                             |
| 用户向下实际回底/按钮                       | following，auto 到底；按钮按下方显隐契约更新                                                                                                      |
| measurement/finish/延迟布局/Footer/viewport | 首个总高只建基线；following 中正向总高变化以 force 合并到下一 rAF，不等待迟到的 at-bottom；reading 保持，token render 仍等待 Virtuoso measurement |
| promotion                                   | ID 更新，展示/意图保持                                                                                                                            |
| 切换/unmount                                | 清除旧命令/观测；历史初始化后 following                                                                                                           |

## Geometry and Cache

按钮显隐独立于瞬时 bottom：following 时不因 token 或延迟布局短暂离底而显示；reading 且确实离底才显示。显式恢复跟随后，已经可见的按钮保留至首次确认真实 bottom，随后持续隐藏；用户实际向下回底也隐藏。重新进入 reading、切换和初始化及时同步显隐。不新增定时防抖，也不以 stream status 隐藏阅读时的按钮。

外部 viewport 设置 overflow-anchor:none，避免双重锚定。移动会话导航位于 viewport 外并由 flex 布局占位；全局 Messages 通过 Portal 固定定位；持续故障位于所属功能区域。它们都不进入 Virtuoso 总高。Header 保持可选但默认空；列表总高由 items 与 Footer 构成，Footer 仅计 Composer 实测 +54px，命令不重复加 offset。reply runway 不进入 Footer：其长度为 `clamp(10rem, calc(72dvh - bottomInset - 4rem), 48rem)`。submitted/streaming 阶段由同一个 TurnEntry item 同时承载 user 与 assistant loading slot，slot 使用该 CSS 长度的 `min-height`；assistant 首包只替换 slot 内容并复用 item key，完成/失败/取消后移除 TurnEntry runway。TurnEntry 不进入真实消息数据、disclosure 或 height hint。禁止按 token 测量或递减高度。所有交互使用公共 Virtuoso.scrollTo。历史 hints 首次等待最多 500ms，列表挂载后缓存重读不能隐藏/卸载。

## Streaming Measurement and Render Stability

流式 token 更新属于 content render，不作为独立回底命令来源。following 状态由 Virtuoso `totalListHeightChanged`、viewport/composer/迟到布局和 accepted-turn 等事件进入同一个事件驱动 rAF；首个总高 observation 只建基线，后续正向总高增长可 force 该 rAF 以绕过尚未更新的 `atBottom` 缓存。force 不绕过 presentation、intent、pending entry 或空列表 guard；同帧仍至多一个 scrollToEnd。高度未增加继续按普通 bottom geometry 判断。reading 状态只记录 geometry，不滚动。

`useStreamTextBuffer` 保留 40ms timer 合并；同一个 pending Map 累计达到 48 个 Unicode code point 或出现代码围栏时，可提前请求既有 rAF flush。该路径只合并并提交内容，不读写 following/reading、`atBottom`、`scrollTop` 或 Virtuoso 的滚动接口。

当前 streaming assistant 的启发式高度 hint 在同一 message 生命周期内冻结；Virtuoso 真实 DOM measurement 继续生效并覆盖初始估算。流式期间不得持久化高度 hint；finish 后最终 assistant 只有在 render fingerprint 稳定、item size 连续观察两次、字体 ready、非 busy 且无 disclosure 偏差时才可写入。

reply runway 不属于 height estimate，也不新增 measurement source。submitted/streaming 阶段的 TurnEntry item 先由 Virtuoso 测量 user 与 loading slot，首包复用同一个 key 后只替换 slot 内容并保留 slot `min-height`，避免新 assistant item 默认高度造成中间帧重复计量。assistant 内容小于 `min-height` 时 slot 外部尺寸保持不变；超过后由 Virtuoso 原有 measurement 上报真实增长。following/reading 的状态机和每帧至多一个到底命令保持不变。

Markdown TextPart 的 Streamdown mode 与 animated 配置在 finish 前后保持不变；仅 isAnimating 从 true 切为 false。该契约不改变 stream/API/NDJSON。

## Verification

见 acceptance.md、T048–T054、T069–T074 与 contracts/ui-feedback.md；真实浏览器验证 DOM 几何、上翻位置、mount 连续性、测量增长收敛和通知不改变列表几何，mock 只验证状态与接口。
