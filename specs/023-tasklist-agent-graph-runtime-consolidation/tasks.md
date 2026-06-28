# 任务 023：v0.2.3 Completed Baseline

状态：Completed Baseline
版本：v0.2.3
归档日期：2026-06-28

## P0 冻结 graph baseline 与协议兼容面

- [x] 明确 `/tasklist + @docs://versions/*.md` 是本版唯一作用范围
- [x] 明确保留 artifact / graph trace / debug summary 对外兼容
- [x] 明确普通聊天、skills、tool calling、MCP 不受影响

## P1 入口收口为 Graph Runtime

- [x] 把 tasklist 分支固定接入 graph 执行入口
- [x] 删除生产路径中的 runtime selector
- [x] 删除 legacy runner 在生产链路中的可达性
- [x] 删除执行期 fallback 语义
- [x] 将 `AI_MIND_TASKLIST_AGENT_RUNTIME` 降级为历史变量

## P2 GraphState 与显式路由收口

- [x] 以 GraphState 分区作为 graph-first 运行态承载
- [x] 让 nodes 返回分区 patch，而不是隐式共享可变状态
- [x] 让 routes 基于显式状态字段做判断
- [x] 保持 Graph Debug Summary 继续只输出脱敏摘要

## P3 清理 legacy 死代码与回归测试

- [x] 清理 legacy wrapper / selector / fallback 相关代码
- [x] 清理对应 dead code 与历史测试
- [x] 将测试基线收口到 graph-only regression
- [x] 保持 stream-core 与 webapp 消费端兼容

## P4 文档与版本资产收口

- [x] 更新 v0.2.3 版本文档
- [x] 更新 v0.2.3 release note
- [x] 更新 v0.2.3 public tasklist
- [x] 记录 graph-only runtime 边界与非目标

## 基线结论

`v0.2.3` 的实质是：

- 先把 “走不走 graph” 收口成定局
- 再为 `v0.2.4` 的单状态模型清理路径
