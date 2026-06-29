# Agent Demo Workspace

`examples/agent-demo/` 是 AI Mind public demo 的唯一本地 Agent resource root。

目标：

- 只提供公开可读的示例输入
- 不放真实源码
- 不映射真实项目目录
- 为 `/tasklist` 和后续 demo mode 提供稳定 corpus

约束：

- 公开本地资源只通过 `@demo://` 引用
- `version-plans/` 只保留少量已完成的重要版本方案输入和测试输入
- `scenarios/` 只放样例需求与样例产物，不放运行时代码
- `demo-manifest.json` 是 picker、测试和 corpus 完整性的单一入口
