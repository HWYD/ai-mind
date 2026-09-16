# AI Mind v0.6.0 General ReAct Trace

Canonical Pencil source: `../../pencil/agent-ui.pen`。该文件已通过 Pencil 自身能力保存，并由 Pencil MCP 从项目路径重新读取验证。

后续 UI 开发必须通过 Pencil MCP 读取 canonical `.pen` 的节点、reusable components、状态和布局；本目录 PNG 只用于设计评审和代码 Review，不是开发事实源。

正常完成后的完整 public-safe Trace 与最终回答复用现有浏览器 IndexedDB `conversation-snapshots` 在刷新后恢复；原始思维链、原始工具数据和 Agent state 不进入快照。显式取消使用“已停止思考”，取消/失败/部分回答不提交稳定快照。

| Export       | Pencil node | Purpose                                                              |
| ------------ | ----------- | -------------------------------------------------------------------- |
| `wtRvx.png`  | `wtRvx`     | 设计总览与实现约束                                                   |
| `AkNwb.png`  | `AkNwb`     | Header、Tool、Skill、Resource、来源与终态 primitives                 |
| `PQwFA.png`  | `PQwFA`     | State 01：正在思考 / 展开                                            |
| `zLnf9.png`  | `zLnf9`     | State 01B：并行执行 / 部分完成                                       |
| `FGxge.png`  | `FGxge`     | State 02：Tool action 已结束、最终回答未开始，仍保持 Shimmer loading |
| `hPpQn.png`  | `hPpQn`     | State 03：最终回答开始 / 自动收起                                    |
| `U1aNLT.png` | `U1aNLT`    | State 04：已完成 / 恢复后由用户手动展开                              |
| `zSXLs.png`  | `zSXLs`     | State 05：异常终态 / 展开                                            |

实现时以 `specs/v0.6.0-general-react-agent-mvp/` 为行为事实源，以 canonical `.pen` 为视觉、层级和状态稿事实源。外层画板标签与设计说明不是产品 UI；原稿更新后必须重新导出对应 PNG。
