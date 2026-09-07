# Chat Scroll Amendment Checklist

## Requirements and Design

- [x] 同一 v0.5.4 canonical workspace，spec/plan/decisions/data-model/contracts 无有效旧 terminal-follow 冲突。
- [x] 用户意图、展示身份、历史 entry 和几何观测分离。
- [x] followOutput=false 基于 4.18.12 源码/Chrome 证据；不再声称仅支持追加。
- [x] Footer 单次计入、移动导航在 viewport 外占位、Header 默认留空、外部 overflow-anchor:none。
- [x] 不改 wire/数据库，不新增 UI 库或 production test-only branch。

## Implementation and Verification

- [x] 先失败再修复；首问/promotion、静态延迟、阅读停止/恢复、缓存边界有覆盖。
- [x] accepted-turn 在请求接受后发出，completion revision 保留 memory usage。
- [x] 上翻取消 rAF，切换隔离旧回调，手动展开优先于几何变化。
- [x] 多帧 End/触摸惯性不丢失向下输入；内层可消费滚动不污染主列表。
- [x] 真正 Page + Chrome/Virtuoso 验证，有限 DOM、可见底部与阅读位置。
- [x] 独立审查问题已修复并回归，复审限制如实登记。
- [x] T053 增量全过程显隐观测先 red 后 green；following 不闪烁，reading 按钮可操作，显式/原生回底后持续隐藏。

## Accepted Follow-up Turn Runway

- [x] D022 只扩展已有历史的新问题 send；首问、regenerate、resume、拒绝和重连保持原行为。
- [x] submitted/streaming 由同一个 TurnEntry 承载 user 与 assistant loading slot；slot 使用同一 runway `min-height`，首包复用 item key，仅替换 slot 内容，逐帧交接没有可见位置跳变。
- [x] 不读取 assistant 实时高度，不增加 Footer reserve、ResizeObserver、timer、scrollTop 数学或第二个定位 API。
- [x] 真实 Chrome 验证初始位置、runway 内稳定、超界后 follow、完成清理及既有 reading/button 回归。

## Measured-Height Follow Latency

- [x] D023 以 presentation-local 总高基线识别正向 measurement；首个 observation 和新展示代次不 force。
- [x] 正向总高增长仅 force 既有单个 rAF；reading、旧代次、空列表与未增长不被拉底，pending entry 保持自身定位重试且不叠加 D023 follow 命令。
- [x] TDD red/green、慢速与快速 Chrome 流式采样均通过；慢速增量最长 3 帧贴底；保留 48 码点早刷后，快速 18 个 25ms delta 产生 18 次实际高度提交，最长 2 帧贴底且无反向 `scrollTop`。

## Early Stream Buffer Flush

- [x] D024 保留 40ms 合并，并在 pending Map 累计 48 Unicode code point 时提前请求既有 rAF；定向 hook 测试已通过。
- [x] 不实现展示队列/内容分片、独立 scroll command 或 Virtuoso 配置变更；Streamdown 动画和残影问题后续单独优化。
