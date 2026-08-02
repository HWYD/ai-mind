# Acceptance: Image Generation Agent v0.4.12

## Scope

本文件是 v0.4.12 Image Generation Agent 的实施验收记录。验收对象是显式
`/image` 入口、受控 ImageBrief/提示词规划、一次 Seedream 生成、同源临时图片
预览与下载，以及取消、冲突、失败和过期状态。普通聊天、Tasklist Agent 和
Delivery Chain 不在本功能入口内改变语义。

## Acceptance Criteria and Evidence

| Criterion  | Required behavior                                           | Evidence                                                        | Status                           |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| SC-052-001 | 合法 `/image` 只进入一次生图链路，不产生普通聊天回答        | route/orchestrator/idempotency tests; browser smoke             | Pass                             |
| SC-052-002 | 普通聊天不启动生图                                          | chat route/orchestrator regression tests                        | Pass                             |
| SC-052-003 | 形成结构化 ImageBrief，自动提示词修订最多 1 次              | graph contract/state/node tests                                 | Pass                             |
| SC-052-004 | 每个成功任务只有 1 张图片和 1 次 provider 调用              | coordinator/provider/route tests                                | Pass                             |
| SC-052-005 | 当前页面可预览、下载，且具备可访问名称和临时性提示          | ImageResultPart/content-route tests; browser smoke              | Pass                             |
| SC-052-006 | 从服务端接受 `/image` 到浏览器图片 load 的 120 秒边界可观测 | timing-boundary tests; one real smoke sample                    | Pass (sample only; no p95 claim) |
| SC-052-007 | 空描述、不支持能力、拒绝、无效/过期结果均给出安全指引       | error projection/content-route/UI tests                         | Pass                             |
| SC-052-008 | 跨会话不能读取或下载结果                                    | ownership/content-route integration tests                       | Pass                             |
| SC-052-009 | Blob/object URL 不写入本地快照，过期不承诺可恢复            | reducer/persistence/component tests                             | Pass                             |
| SC-052-010 | 普通聊天、Tasklist、Delivery Chain 和流式消费回归通过       | stable and integration regression suites                        | Pass                             |
| SC-052-011 | 用户只看到只读 ImageBrief 安全摘要，不看到内部 Prompt       | stream schema/reducer/UI tests; browser smoke                   | Pass                             |
| SC-052-012 | 一次修订后仍阻断时，生图调用数为 0                          | graph routing tests                                             | Pass                             |
| SC-052-013 | 主动停止在 1 秒内结束等待，迟到结果不覆盖取消终态           | cancellation/coordinator tests                                  | Pass                             |
| SC-052-014 | 同会话 3 个并发请求最多一个活动任务                         | lease/idempotency integration tests                             | Pass                             |
| SC-052-015 | provider 拒绝安全失败，不绕过审核重试                       | provider error/projection tests; credentialed smoke shape check | Pass                             |
| SC-052-016 | 图片结果完成后保留推荐问题，点击后走普通提问且不重复生图    | ChatMessageList image-result recommendation test                | Pass                             |

“Pass”表示对应的确定性测试集合已通过；不把单次真实 smoke 外推为生产流量
统计。SC-052-006 的 95% SLO 仍需独立的多样本观测，本文只记录链路样本。

| SC-052-017 | Session 每日 3 次生图配额，第 4 次被拒绝且普通聊天不受影响 | image rate-limit unit/route tests | Pass |
| SC-052-018 | 同一 IP 默认每日 10 次生图防刷上限，可配置到 20 | image rate-limit unit tests | Pass |
| SC-052-019 | 无效请求、幂等重放和活动冲突不计数；已接受任务后续失败仍计数 | image route/rate-limit boundary tests | Pass |

## Automated Verification

已执行的门禁包括：

- Image Agent contract、GraphState/edge/node、coordinator、provider、repository、
  route、stream projector、reducer 和 UI 测试；新增固定规划模型测试覆盖
  `deepseek/deepseek-v4-pro` 的服务端固定选择。
- `pnpm typecheck`、`pnpm lint`、相关 production build。
- `node scripts/dev/run-local-env.mjs pnpm test:integration`（Web 与 Database
  集成测试使用项目本地数据库装配）。
- `git diff --check`。

## Browser Acceptance

在目标 worktree 的本地 Web 应用中，使用 `/image` 提交一条合法文本描述，确认：

1. 页面出现只读 ImageBrief；
2. 进度依次经过 brief、prompt、generation 和 result；
3. 只出现一张图片，图片通过同源 `/api/chat/runs/{runId}/image` 读取；
4. `img.complete === true` 且 `naturalWidth > 0`；
5. 下载控件可通过键盘访问并触发下载；
6. 页面显示结果为临时资源，不承诺刷新后永久恢复。
7. 图片生成完成后仍显示“推荐问题”快捷入口；点击一个推荐问题后，页面提交普通问题，不新增图片生成任务。

浏览器验收样本（不记录 Key、内部 Prompt、完整签名 Provider URL 或原始审核信息）：

- 入口：`/image`；
- 样本描述：橘猫在海边阳光下睡觉；
- 结果：ImageBrief、图片预览和“下载生成图片”均可见；
- 图片加载：`complete=true`、`naturalWidth=2848`、`naturalHeight=1600`；
- 下载：点击“下载生成图片”成功触发下载，下载链接使用同一 Blob，未把 Provider URL 暴露给浏览器；
- 样本端到端页面耗时：约 41 秒（仅为链路样本，不代表 95% SLO）；
- 页面无普通聊天回答，也未发生第二次图片生成。

## Negative and Boundary Acceptance

- 空 `/image`、超过 2000 code points、非 NFC 或不支持的编辑/局部重绘/扩图/
  去背景/参考图/多图意图，在创建生图 run 前安全拒绝。
- 规划结构化输出无效时只消耗当前规划调用，不启动隐藏修复或重试模型。
- prompt 自动修订最多一次；修订后仍阻断则不调用图片 provider。
- 取消、同会话冲突、过期、跨会话访问、重定向、非图片 MIME、magic bytes 不符、
  超过 20 MiB 或超过 15 秒的上游响应均以稳定错误状态收口。

## External Smoke Boundary

T003/T055 使用固定的 `doubao-seedream-5.0-lite` 和固定 Agent Plan endpoint，
只记录安全的请求/响应事实与一次耗时样本。单次真实调用不能证明 95% SLO；
凭据不可用时不得改用其他模型或 endpoint 冒充通过。
