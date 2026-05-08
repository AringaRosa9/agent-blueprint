# Agent Blueprint

> Anthropic《Building Effective Agents》方法论的 Claude Code Skill 实现 —— 从架构选型到代码落地的完整 Agent 开发工作流。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

## 这是什么？

Agent Blueprint 是一组 **Claude Code Skills**，将 Anthropic 官方研究博文 [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 中的方法论，转化为可在 Claude Code 中直接调用的交互式开发助手。

安装后，你在开发 Agent 时可以随时获得：

- **架构选型建议** — 不再纠结该用 Workflow 还是 Agent
- **工具接口设计审查** — 按 ACI 最佳实践打磨你的工具定义
- **可运行的代码模板** — 7 种模式的 TypeScript 实现骨架

## 包含的 Skills

| Skill | 调用方式 | 用途 |
|-------|----------|------|
| **Agent Architect** | `/agent-architect` | 描述业务需求 → 推荐最合适的架构模式 |
| **Tool Designer** | `/tool-designer` | 提交工具定义 → 获得 ACI 最佳实践审查和改进 |
| **Agent Patterns** | `/agent-patterns` | 指定模式名称 → 生成可运行的代码骨架 |

## 快速安装

### 方式一：npx（推荐）

```bash
git clone https://github.com/AringaRosa9/agent-blueprint.git
cd agent-blueprint
npm install
npm run build
npx agent-blueprint install
```

### 方式二：npm scripts

```bash
git clone https://github.com/AringaRosa9/agent-blueprint.git
cd agent-blueprint
npm install
npm run install-skills
```

### CLI 命令

```bash
npx agent-blueprint install      # 安装所有 Skills 到 ~/.claude/skills/
npx agent-blueprint uninstall    # 卸载所有 Skills
npx agent-blueprint list         # 查看安装状态
npx agent-blueprint help         # 帮助信息
```

### 卸载

```bash
npx agent-blueprint uninstall
```

## 使用流程

### 完整工作流：从需求到代码

```
  你的业务需求
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: /agent-architect                           │
│  "我想做一个自动化的论文审稿系统"                       │
│                                                     │
│  输出 → 推荐 Parallelization + Evaluator-Optimizer   │
│        Level 3 + Level 5 组合                        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: /agent-patterns                            │
│  "给我 Parallelization + Evaluator-Optimizer 的代码"  │
│                                                     │
│  输出 → 可运行的 TypeScript 代码骨架                   │
│        基于 Anthropic SDK                            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: /tool-designer                             │
│  "帮我设计论文解析工具和评审维度分析工具"                 │
│                                                     │
│  输出 → 符合 ACI 最佳实践的 tool schema               │
│        + 防呆设计 + 测试建议                           │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
                 开始编码实现
```

### 场景一：我有一个新需求，不知道怎么设计

```
你：/agent-architect
    我想做一个客服系统，能自动回答用户问题、查订单、处理退款

Claude：推荐 Routing（Level 2）+ Augmented LLM（Level 0）
       - 用路由将客服请求分类（咨询/查单/退款）
       - 每个分支用增强型 LLM + 对应工具处理
       - 预估 2-3 次 LLM 调用/请求
```

### 场景二：我知道要什么模式，需要代码

```
你：/agent-patterns
    给我一个 Routing 模式的客服系统代码，
    分三类：一般咨询、订单查询、退款处理

Claude：[生成完整的 TypeScript 代码，包含分类器、三个 handler、路由逻辑]
```

### 场景三：我的 Agent 老是用错工具

```
你：/tool-designer
    我的 Agent 经常把 search_orders 和 search_products 搞混，
    这是我的工具定义：[粘贴 JSON]

Claude：问题诊断 — 两个工具的描述太相似
       改进建议 — 在描述中明确区分使用场景，添加示例
       改进后的定义 — [给出优化后的 JSON schema]
```

### 场景四：独立使用某个 Skill

每个 Skill 都可以独立使用，不需要按顺序走完全流程：

| 你的情况 | 用哪个 |
|----------|--------|
| "这个需求该用什么架构？" | `/agent-architect` |
| "给我一个 prompt chaining 的模板" | `/agent-patterns` |
| "审查一下我的 tool definition" | `/tool-designer` |
| "Orchestrator 和 Parallelization 有什么区别？" | `/agent-architect` |
| "我的工具参数该怎么设计？" | `/tool-designer` |

## 架构模式速查

从简单到复杂的 6 种模式，**永远从最简单的可行方案开始**：

```
Level 0  ──  Augmented LLM        单次调用 + RAG + 工具
Level 1  ──  Prompt Chaining      固定步骤顺序执行
Level 2  ──  Routing              分类 → 专业化处理
Level 3  ──  Parallelization      并行处理 / 投票表决
Level 4  ──  Orchestrator-Workers 动态拆分 → 分派 → 汇总
Level 5  ──  Evaluator-Optimizer  生成 → 评估 → 迭代优化
Level 6  ──  Autonomous Agent     自主规划 + 工具循环
```

### 怎么选？

```
任务一次调用能搞定？ ─── 是 ──→ Level 0
        │ 否
能拆成固定步骤？ ─────── 是 ──→ Level 1
        │ 否
输入有明确分类？ ─────── 是 ──→ Level 2
        │ 否
子任务可以并行？ ─────── 是 ──→ Level 3
        │ 否
子任务需要动态决定？ ─── 是 ──→ Level 4
        │ 否
需要迭代优化输出？ ──── 是 ──→ Level 5
        │ 否
需要完全自主执行？ ──── 是 ──→ Level 6
```

## 示例

`examples/` 目录包含完整的 TypeScript 示例代码：

| 示例 | 文件 | 使用的模式 |
|------|------|-----------|
| 智能客服系统 | [`customer_support.ts`](examples/customer_support.ts) | Routing + Augmented LLM |
| 多维度代码审查 | [`code_reviewer.ts`](examples/code_reviewer.ts) | Parallelization (Voting) |
| 深度调研 Agent | [`research_agent.ts`](examples/research_agent.ts) | Orchestrator-Workers + Evaluator-Optimizer |

### 运行示例

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY="your-api-key"

# 运行智能客服示例
npx tsx examples/customer_support.ts

# 运行代码审查示例
npx tsx examples/code_reviewer.ts

# 运行深度调研示例（可自定义主题）
npx tsx examples/research_agent.ts "量子计算对密码学的影响"
```

## 项目结构

```
agent-blueprint/
├── src/
│   └── cli.ts                     # CLI 工具（install / uninstall / list）
├── skills/
│   ├── agent-architect/SKILL.md   # 架构选型顾问
│   ├── tool-designer/SKILL.md     # ACI 工具设计助手
│   └── agent-patterns/SKILL.md    # 模式代码生成器
├── examples/
│   ├── customer_support.ts        # 智能客服（Routing）
│   ├── code_reviewer.ts           # 代码审查（Parallelization）
│   └── research_agent.ts          # 深度调研（Orchestrator + Evaluator）
├── package.json
├── tsconfig.json
└── LICENSE
```

## 设计理念

本项目遵循 Anthropic 提出的 Agent 开发三原则：

1. **简单性** — 从最简单的可行方案开始，按需升级
2. **透明性** — 显式展示架构决策的理由和权衡
3. **精心的 ACI** — 工具设计与 prompt 同等重要

以及一个核心判断标准：

> **只在复杂度能带来可衡量的改进时，才增加复杂度。**

## 适用人群

- 正在用 Claude API / Agent SDK 构建 Agent 系统的开发者
- 想要系统学习 Agent 架构模式的工程师
- 需要优化现有 Agent 工具设计的团队

## 参考资料

- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 官方研究博文（本项目的知识来源）
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) — Anthropic Agent SDK 文档
- [Anthropic Cookbook: Agent Patterns](https://platform.claude.com/cookbook/patterns-agents-basic-workflows) — 官方示例代码
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP 工具集成协议

## License

[MIT](LICENSE) — 自由使用、修改和分发。
