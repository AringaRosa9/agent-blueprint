---
name: tool-designer
description: |
  ACI（Agent-Computer Interface）工具设计助手。当用户需要为 Agent 设计工具接口、
  优化现有工具定义、或排查 Agent 工具使用错误时，使用此 Skill。
  触发场景：用户提到"设计工具给 Agent 用"、"tool definition"、"Agent 老是用错工具"、
  "优化我的工具描述"、"function calling 的参数设计"、"MCP tool schema"等。
---

# Tool Designer — ACI 工具设计助手

基于 Anthropic《Building Effective Agents》附录2的 ACI（Agent-Computer Interface）最佳实践，帮助用户为 Agent 设计高质量的工具接口。

## 核心理念

> 在 HCI（人机交互）上投入多少精力，就应该在 ACI（Agent-计算机交互）上投入同样多的精力。
> — Anthropic, Building Effective Agents

工具设计的质量直接决定 Agent 的表现。糟糕的工具定义是 Agent 犯错的首要原因。

## 五条设计原则

### 原则 1: 站在模型的角度思考

设计工具时，问自己：**如果我是一个只能通过文字描述理解这个工具的开发者，我能用对吗？**

**检查清单：**
- [ ] 工具名称是否直观表达了用途？
- [ ] 描述是否包含了使用示例？
- [ ] 边界情况是否说明了？（什么时候用这个工具，什么时候不用）
- [ ] 与相似工具的区别是否明确？
- [ ] 参数格式要求是否清晰？（什么格式的输入是合法的）

**反面案例 → 正面改进：**

```json
// BAD: 名称模糊，描述不足
{
  "name": "process",
  "description": "Process the data",
  "parameters": {
    "input": { "type": "string" },
    "mode": { "type": "string" }
  }
}

// GOOD: 名称明确，描述完整
{
  "name": "extract_invoice_fields",
  "description": "从发票图片或 PDF 中提取结构化字段（发票号、日期、金额、供应商）。仅支持中文和英文发票。如果输入不是发票，返回错误而非猜测。",
  "parameters": {
    "file_path": {
      "type": "string",
      "description": "发票文件的绝对路径，支持 .pdf / .png / .jpg 格式"
    },
    "language": {
      "type": "string",
      "enum": ["zh", "en"],
      "description": "发票语言，用于选择 OCR 模型"
    }
  }
}
```

---

### 原则 2: 给模型足够的思考空间

避免让模型在写输出的过程中"把自己逼入死角"。

**问题格式：** 要求 LLM 在输出开头就确定后续内容的精确属性（如 diff 的行数、数组的长度）。

**友好格式：** 让 LLM 可以自然地生成内容，不需要提前计算。

```
// BAD: 要求模型先写 chunk header（需要提前知道变更行数）
@@ -10,3 +10,5 @@
 existing line
+new line 1
+new line 2

// GOOD: 让模型直接写完整文件或用 search-replace 格式
<<<< SEARCH
existing line
====
existing line
new line 1
new line 2
>>>> REPLACE
```

---

### 原则 3: 格式贴近自然文本

选择模型在训练数据中频繁见过的格式，而不是程序员觉得"正确"的格式。

| 场景 | 避免 | 推荐 |
|------|------|------|
| 代码输出 | JSON 内嵌代码（需转义换行和引号） | Markdown 代码块 |
| 结构化数据 | 自定义 DSL | JSON / YAML |
| 文件修改 | unified diff 格式 | search-replace / 完整重写 |
| 列表数据 | 带精确索引的数组 | 自然语言列表或简单 JSON 数组 |

---

### 原则 4: 消除格式开销

不要要求模型做这些事：
- 精确计算代码行数
- 手动转义字符串
- 维护精确的字符偏移量
- 生成二进制或编码数据

**规则：如果一个格式要求人类用计算器才能写对，模型也写不对。**

---

### 原则 5: 防呆设计（Poka-yoke）

修改工具参数设计，让模型**更难犯错**。

**经典案例（来自 Anthropic SWE-bench 实战）：**

```
// BAD: 允许相对路径 — Agent 在子目录时经常出错
{
  "name": "read_file",
  "parameters": {
    "path": {
      "type": "string",
      "description": "文件路径"
    }
  }
}

// GOOD: 强制绝对路径 — 消除歧义
{
  "name": "read_file",
  "parameters": {
    "path": {
      "type": "string",
      "description": "文件的绝对路径（必须以 / 开头）"
    }
  }
}
```

**更多防呆策略：**

| 策略 | 做法 | 效果 |
|------|------|------|
| 使用 enum 约束 | `"type": {"enum": ["json","csv","xml"]}` | 消除拼写错误和无效值 |
| 合并易混淆参数 | 将 `start_line` + `end_line` 改为 `line_range: "10-20"` | 减少参数顺序错误 |
| 设置合理默认值 | `"timeout": {"default": 30}` | 减少遗漏必要参数 |
| 自动补全输入 | 工具内部将相对路径转为绝对路径 | 容错而非报错 |
| 返回有用的错误信息 | 返回"文件不存在，你是否想找 /src/utils.ts？" | 引导模型自我修正 |

---

## 工具审查流程

当用户提交现有工具定义请求审查时，按以下维度逐一评估：

```
## 工具审查报告

### 基本信息
- 工具名称：
- 当前用途：

### 评估结果

| 维度 | 评分 | 问题 | 建议 |
|------|------|------|------|
| 命名清晰度 | ⚠️/✅/❌ | ... | ... |
| 描述完整度 | ⚠️/✅/❌ | ... | ... |
| 参数设计 | ⚠️/✅/❌ | ... | ... |
| 格式友好度 | ⚠️/✅/❌ | ... | ... |
| 防呆程度 | ⚠️/✅/❌ | ... | ... |
| 边界说明 | ⚠️/✅/❌ | ... | ... |

### 改进后的工具定义
[给出完整的改进版 JSON schema]

### 测试建议
[列出 3-5 个应该测试的边界场景]
```

## 常见工具类型的设计模板

### 文件操作类

```json
{
  "name": "write_file",
  "description": "将内容写入指定文件。如果文件已存在则覆盖。如果父目录不存在则自动创建。不支持二进制文件。",
  "parameters": {
    "file_path": {
      "type": "string",
      "description": "目标文件的绝对路径（必须以 / 开头）"
    },
    "content": {
      "type": "string",
      "description": "要写入的文本内容"
    },
    "encoding": {
      "type": "string",
      "enum": ["utf-8", "ascii", "latin-1"],
      "default": "utf-8",
      "description": "文件编码，默认 utf-8"
    }
  }
}
```

### API 调用类

```json
{
  "name": "query_database",
  "description": "对业务数据库执行只读 SQL 查询。仅支持 SELECT 语句，最多返回 100 行。如果需要更多数据，请使用 LIMIT 和 OFFSET 分页。禁止 INSERT/UPDATE/DELETE。",
  "parameters": {
    "sql": {
      "type": "string",
      "description": "SQL SELECT 语句。必须包含 LIMIT 子句（最大 100）"
    },
    "database": {
      "type": "string",
      "enum": ["users", "orders", "products"],
      "description": "目标数据库名称"
    }
  }
}
```

### 搜索类

```json
{
  "name": "search_docs",
  "description": "在知识库中搜索相关文档。返回最相关的 top-K 结果，每个结果包含标题、摘要和来源链接。如果没有找到相关结果，返回空数组而非猜测答案。",
  "parameters": {
    "query": {
      "type": "string",
      "description": "自然语言搜索查询，描述要查找的信息"
    },
    "top_k": {
      "type": "integer",
      "default": 5,
      "minimum": 1,
      "maximum": 20,
      "description": "返回结果数量，默认 5"
    },
    "category": {
      "type": "string",
      "enum": ["all", "api-docs", "tutorials", "faq"],
      "default": "all",
      "description": "限制搜索范围到特定分类"
    }
  }
}
```

## 注意事项

- 工具设计是迭代过程：先设计 → 让模型试用 → 观察错误模式 → 改进设计
- Anthropic 在 SWE-bench 上花在优化工具的时间比优化 prompt 还多
- 工具数量不宜过多：10 个以内为佳，超过 20 个模型选择准确率会下降
- 相似工具必须在描述中明确区分使用场景
- 工具返回值同样重要：返回清晰、结构化、包含足够上下文的结果
