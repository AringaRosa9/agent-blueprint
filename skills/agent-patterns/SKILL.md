---
name: agent-patterns
description: |
  Agent 模式速查与代码生成。当用户需要某种 Agent 架构模式的实现代码、代码模板、
  或想了解某个模式的具体实现细节时，使用此 Skill 生成基于 Claude API / Agent SDK 的代码骨架。
  触发场景：用户提到"给我一个 prompt chaining 模板"、"实现 orchestrator-workers"、
  "evaluator-optimizer 的代码"、"Agent 循环怎么写"、"用 Claude SDK 实现"等。
---

# Agent Patterns — Agent 模式速查与代码生成

基于 Anthropic《Building Effective Agents》的 6 种架构模式，提供可直接使用的代码实现模板。默认使用 Anthropic Python SDK（`anthropic`），也可按需生成 TypeScript 版本。

## 使用方式

用户指定模式名称和业务场景，生成对应的代码骨架。支持的模式：

| 模式 | 关键词 | 复杂度 |
|------|--------|--------|
| Augmented LLM | `augmented`, `基础`, `单次调用` | Level 0 |
| Prompt Chaining | `chaining`, `提示链`, `链式` | Level 1 |
| Routing | `routing`, `路由`, `分类` | Level 2 |
| Parallelization | `parallel`, `并行`, `投票` | Level 3 |
| Orchestrator-Workers | `orchestrator`, `编排`, `动态分派` | Level 4 |
| Evaluator-Optimizer | `evaluator`, `评估优化`, `迭代` | Level 5 |
| Autonomous Agent | `agent`, `自主`, `循环` | Level 6 |

---

## Pattern 0: Augmented LLM（增强型 LLM）

单次 LLM 调用 + 工具 + 检索。

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "search_knowledge_base",
        "description": "搜索知识库获取相关信息",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索查询"
                }
            },
            "required": ["query"]
        }
    }
]

def augmented_llm(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

    # 处理工具调用循环
    while response.stop_reason == "tool_use":
        tool_block = next(b for b in response.content if b.type == "tool_use")
        tool_result = execute_tool(tool_block.name, tool_block.input)

        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_block.id,
                "content": tool_result,
            }]
        })

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            tools=tools,
            messages=messages,
        )

    return response.content[0].text


def execute_tool(name: str, input_data: dict) -> str:
    """实际执行工具调用 — 根据业务需求实现"""
    if name == "search_knowledge_base":
        return do_search(input_data["query"])
    raise ValueError(f"Unknown tool: {name}")
```

---

## Pattern 1: Prompt Chaining（提示链）

顺序执行多个 LLM 步骤，每步输出作为下一步输入。

```python
import anthropic

client = anthropic.Anthropic()


def llm_call(prompt: str, system: str = "") -> str:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


def gate_check(output: str, criteria: str) -> bool:
    """程序化检查，确保中间输出符合要求"""
    result = llm_call(
        prompt=f"请判断以下输出是否满足标准。仅回答 YES 或 NO。\n\n标准：{criteria}\n\n输出：{output}",
    )
    return "YES" in result.upper()


def prompt_chain(user_input: str) -> str:
    # Step 1: 生成大纲
    outline = llm_call(
        prompt=f"请为以下主题生成详细大纲：\n{user_input}",
        system="你是一个专业的内容策划师。",
    )

    # Gate: 检查大纲质量
    if not gate_check(outline, "大纲包含至少 3 个主要章节，每个章节有 2-3 个子要点"):
        outline = llm_call(
            prompt=f"这个大纲不够详细，请扩充：\n{outline}",
            system="你是一个专业的内容策划师。",
        )

    # Step 2: 基于大纲写全文
    article = llm_call(
        prompt=f"请根据以下大纲撰写完整文章：\n{outline}",
        system="你是一个专业的技术作家。",
    )

    # Step 3: 润色和校对
    polished = llm_call(
        prompt=f"请润色以下文章，修正语法错误，提升可读性：\n{article}",
        system="你是一个资深编辑。",
    )

    return polished
```

---

## Pattern 2: Routing（路由）

分类输入，导向不同处理路径。

```python
import anthropic

client = anthropic.Anthropic()


def classify(user_input: str, categories: list[str]) -> str:
    category_list = "\n".join(f"- {c}" for c in categories)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{
            "role": "user",
            "content": f"将以下用户输入分类到一个类别中。仅返回类别名称，不要解释。\n\n类别：\n{category_list}\n\n用户输入：{user_input}"
        }],
    )
    return response.content[0].text.strip()


def handle_general_inquiry(query: str) -> str:
    return client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system="你是一个友好的客服助手，回答一般性问题。",
        messages=[{"role": "user", "content": query}],
    ).content[0].text


def handle_refund_request(query: str) -> str:
    return client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system="你是退款处理专员。核实订单信息，按政策处理退款请求。",
        messages=[{"role": "user", "content": query}],
    ).content[0].text


def handle_technical_support(query: str) -> str:
    return client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system="你是技术支持工程师。提供详细的技术解决方案。",
        messages=[{"role": "user", "content": query}],
    ).content[0].text


HANDLERS = {
    "一般咨询": handle_general_inquiry,
    "退款请求": handle_refund_request,
    "技术支持": handle_technical_support,
}


def route(user_input: str) -> str:
    category = classify(user_input, list(HANDLERS.keys()))
    handler = HANDLERS.get(category, handle_general_inquiry)
    return handler(user_input)
```

---

## Pattern 3: Parallelization（并行化）

### 3A: Sectioning（分段并行）

```python
import anthropic
import asyncio

client = anthropic.AsyncAnthropic()


async def analyze_dimension(text: str, dimension: str, criteria: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=f"你是{dimension}方面的专家评审。",
        messages=[{
            "role": "user",
            "content": f"请从{dimension}的角度评估以下内容。\n评估标准：{criteria}\n\n内容：\n{text}"
        }],
    )
    return {"dimension": dimension, "analysis": response.content[0].text}


async def parallel_analysis(text: str) -> list[dict]:
    dimensions = [
        ("技术准确性", "事实是否正确，技术细节是否准确"),
        ("代码质量", "代码示例是否可运行，是否遵循最佳实践"),
        ("可读性", "表达是否清晰，结构是否合理"),
    ]

    tasks = [analyze_dimension(text, dim, criteria) for dim, criteria in dimensions]
    results = await asyncio.gather(*tasks)
    return results


async def sectioning_workflow(text: str) -> str:
    results = await parallel_analysis(text)

    summary_input = "\n\n".join(
        f"### {r['dimension']}\n{r['analysis']}" for r in results
    )

    sync_client = anthropic.Anthropic()
    summary = sync_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": f"请综合以下多维度评估结果，给出总体评价和改进建议：\n\n{summary_input}"
        }],
    )
    return summary.content[0].text
```

### 3B: Voting（投票表决）

```python
import anthropic
import asyncio
from collections import Counter

client = anthropic.AsyncAnthropic()

REVIEW_PROMPTS = [
    "从安全角度审查这段代码，关注注入攻击、认证绕过等漏洞。",
    "从数据泄露角度审查这段代码，关注敏感信息暴露、日志泄露等问题。",
    "从权限控制角度审查这段代码，关注越权访问、IDOR 等问题。",
]


async def single_vote(code: str, prompt: str) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": f"{prompt}\n\n如果发现问题回答 VULNERABLE 并说明原因，否则回答 SAFE。\n\n```\n{code}\n```"
        }],
    )
    text = response.content[0].text
    verdict = "VULNERABLE" if "VULNERABLE" in text.upper() else "SAFE"
    return {"verdict": verdict, "detail": text}


async def voting_review(code: str, threshold: int = 2) -> dict:
    tasks = [single_vote(code, prompt) for prompt in REVIEW_PROMPTS]
    votes = await asyncio.gather(*tasks)

    verdicts = [v["verdict"] for v in votes]
    vuln_count = verdicts.count("VULNERABLE")

    return {
        "final_verdict": "VULNERABLE" if vuln_count >= threshold else "SAFE",
        "vote_count": dict(Counter(verdicts)),
        "details": votes,
    }
```

---

## Pattern 4: Orchestrator-Workers（编排器-工作者）

```python
import anthropic
import json

client = anthropic.Anthropic()


def orchestrate(task_description: str) -> str:
    # Step 1: Orchestrator 分析任务并生成子任务
    plan_response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system="你是一个任务编排器。分析用户的任务，将其拆解为可独立执行的子任务。以 JSON 数组格式返回，每个子任务包含 id、description、dependencies（依赖的子任务 id 列表）。",
        messages=[{
            "role": "user",
            "content": f"请拆解以下任务：\n{task_description}"
        }],
    )

    subtasks = json.loads(plan_response.content[0].text)

    # Step 2: 按依赖顺序执行子任务
    results = {}
    for subtask in subtasks:
        dep_context = "\n".join(
            f"[{dep_id}的结果]: {results[dep_id]}"
            for dep_id in subtask.get("dependencies", [])
            if dep_id in results
        )

        worker_prompt = subtask["description"]
        if dep_context:
            worker_prompt += f"\n\n依赖任务的结果：\n{dep_context}"

        worker_response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system="你是一个专注的执行者。完成分配给你的具体任务，输出清晰的结果。",
            messages=[{"role": "user", "content": worker_prompt}],
        )
        results[subtask["id"]] = worker_response.content[0].text

    # Step 3: Orchestrator 汇总所有结果
    all_results = "\n\n".join(
        f"### 子任务 {tid}\n{result}" for tid, result in results.items()
    )

    final = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system="你是一个任务编排器。综合所有子任务的结果，生成最终的完整输出。",
        messages=[{
            "role": "user",
            "content": f"原始任务：{task_description}\n\n各子任务结果：\n{all_results}\n\n请综合以上结果，生成最终输出。"
        }],
    )
    return final.content[0].text
```

---

## Pattern 5: Evaluator-Optimizer（评估器-优化器）

```python
import anthropic

client = anthropic.Anthropic()


def generate(prompt: str, feedback: str = "") -> str:
    full_prompt = prompt
    if feedback:
        full_prompt += f"\n\n请根据以下反馈改进你的输出：\n{feedback}"

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system="你是一个专业的内容创作者。",
        messages=[{"role": "user", "content": full_prompt}],
    )
    return response.content[0].text


def evaluate(output: str, criteria: list[str]) -> dict:
    criteria_text = "\n".join(f"- {c}" for c in criteria)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system="你是一个严格的质量评审员。",
        messages=[{
            "role": "user",
            "content": f"请评估以下内容是否满足所有标准。\n\n标准：\n{criteria_text}\n\n内容：\n{output}\n\n以 JSON 格式返回：{{\"passed\": true/false, \"score\": 1-10, \"feedback\": \"具体改进建议\"}}"
        }],
    )

    import json
    return json.loads(response.content[0].text)


def eval_optimize_loop(
    prompt: str,
    criteria: list[str],
    max_iterations: int = 3,
    target_score: int = 8,
) -> dict:
    feedback = ""
    for i in range(max_iterations):
        output = generate(prompt, feedback)
        evaluation = evaluate(output, criteria)

        if evaluation["passed"] and evaluation["score"] >= target_score:
            return {
                "output": output,
                "iterations": i + 1,
                "final_score": evaluation["score"],
            }

        feedback = evaluation["feedback"]

    return {
        "output": output,
        "iterations": max_iterations,
        "final_score": evaluation["score"],
        "note": "达到最大迭代次数，未完全满足所有标准",
    }
```

---

## Pattern 6: Autonomous Agent（自主智能体）

```python
import anthropic
import json

client = anthropic.Anthropic()


def run_agent(
    task: str,
    tools: list[dict],
    max_iterations: int = 10,
    system_prompt: str = "你是一个自主工作的 AI Agent。分析任务，制定计划，使用工具逐步完成。每一步都要评估进度，决定下一步行动。当任务完成时，使用 task_complete 工具报告结果。",
) -> dict:
    internal_tools = tools + [{
        "name": "task_complete",
        "description": "当任务完成时调用此工具，报告最终结果",
        "input_schema": {
            "type": "object",
            "properties": {
                "result": {"type": "string", "description": "任务完成的最终结果"},
                "summary": {"type": "string", "description": "执行过程摘要"},
            },
            "required": ["result", "summary"],
        },
    }]

    messages = [{"role": "user", "content": task}]
    iterations = 0

    while iterations < max_iterations:
        iterations += 1

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system_prompt,
            tools=internal_tools,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            return {"status": "completed_without_tool", "output": response.content[0].text, "iterations": iterations}

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            if block.name == "task_complete":
                return {
                    "status": "completed",
                    "result": block.input["result"],
                    "summary": block.input["summary"],
                    "iterations": iterations,
                }

            result = execute_tool(block.name, block.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})

    return {"status": "max_iterations_reached", "iterations": iterations}


def execute_tool(name: str, input_data: dict) -> str:
    """根据业务需求实现具体的工具执行逻辑"""
    raise NotImplementedError(f"请实现工具 '{name}' 的执行逻辑")
```

---

## 代码生成指引

当用户请求特定模式的代码时，按以下步骤：

1. **确认模式** — 用户想要哪种模式？如果不确定，根据描述推荐
2. **确认语言** — 默认 Python，可选 TypeScript
3. **确认场景** — 将模板中的占位逻辑替换为用户的实际业务逻辑
4. **补充依赖** — 列出需要安装的包（`pip install anthropic` 等）
5. **添加提示** — 标注需要用户自行实现的部分（如工具执行逻辑、数据库查询等）

## 注意事项

- 所有代码默认使用最新的 Claude 模型（claude-sonnet-4-6）
- 简单任务（分类、判断）可用 claude-haiku-4-5-20251001 降低成本
- 复杂推理任务考虑用 claude-opus-4-6
- 生产环境需要添加：错误重试、速率限制、日志记录、成本监控
- 异步模式使用 `anthropic.AsyncAnthropic()` 客户端
