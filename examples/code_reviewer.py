"""
多维度代码审查 — Parallelization (Voting)

架构：
  代码输入 → [安全审查] ──┐
           → [性能审查] ──┼→ 汇总投票 → 最终报告
           → [可维护性] ──┘

每个审查维度独立并行运行，最终汇总为综合报告。
如果任一维度发现严重问题，整体标记为需要修改。

使用方法：
  pip install anthropic
  export ANTHROPIC_API_KEY="your-key"
  python code_reviewer.py
"""

import anthropic
import asyncio
import json

client = anthropic.AsyncAnthropic()
sync_client = anthropic.Anthropic()

# ── 审查维度定义 ──────────────────────────────────────────

REVIEW_DIMENSIONS = [
    {
        "name": "security",
        "label": "安全性",
        "system": "你是一名安全审计专家。专注于发现代码中的安全漏洞。",
        "prompt": (
            "从安全角度审查以下代码。重点关注：\n"
            "- SQL 注入、XSS、命令注入\n"
            "- 认证和授权漏洞\n"
            "- 敏感数据泄露（硬编码密钥、日志中打印密码等）\n"
            "- 不安全的反序列化\n\n"
            "对每个发现的问题标注严重程度：CRITICAL / HIGH / MEDIUM / LOW\n"
            "如果没有发现问题，明确说明 PASS。"
        ),
    },
    {
        "name": "performance",
        "label": "性能",
        "system": "你是一名性能优化专家。专注于发现代码中的性能问题。",
        "prompt": (
            "从性能角度审查以下代码。重点关注：\n"
            "- N+1 查询问题\n"
            "- 不必要的内存分配或拷贝\n"
            "- 可以并行但串行执行的操作\n"
            "- 缺少缓存的重复计算\n"
            "- 算法复杂度问题\n\n"
            "对每个问题评估影响程度：HIGH / MEDIUM / LOW\n"
            "如果没有发现问题，明确说明 PASS。"
        ),
    },
    {
        "name": "maintainability",
        "label": "可维护性",
        "system": "你是一名代码质量专家。专注于代码的可读性和可维护性。",
        "prompt": (
            "从可维护性角度审查以下代码。重点关注：\n"
            "- 命名是否清晰表达意图\n"
            "- 函数是否过长或职责过多\n"
            "- 错误处理是否恰当\n"
            "- 是否有明显的代码异味（code smell）\n"
            "- 是否违反 SOLID 原则\n\n"
            "对每个问题标注优先级：HIGH / MEDIUM / LOW\n"
            "如果没有发现问题，明确说明 PASS。"
        ),
    },
]


# ── 单维度审查 ────────────────────────────────────────────

async def review_dimension(code: str, dimension: dict) -> dict:
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=dimension["system"],
        messages=[{
            "role": "user",
            "content": f"{dimension['prompt']}\n\n```\n{code}\n```",
        }],
    )

    text = response.content[0].text
    has_critical = "CRITICAL" in text.upper()
    has_high = "HIGH" in text.upper()
    passed = "PASS" in text.upper() and not has_critical and not has_high

    return {
        "dimension": dimension["name"],
        "label": dimension["label"],
        "analysis": text,
        "passed": passed,
        "has_critical": has_critical,
        "has_high": has_high,
    }


# ── 并行审查 + 汇总 ──────────────────────────────────────

async def parallel_review(code: str) -> str:
    tasks = [review_dimension(code, dim) for dim in REVIEW_DIMENSIONS]
    results = await asyncio.gather(*tasks)

    all_passed = all(r["passed"] for r in results)
    any_critical = any(r["has_critical"] for r in results)

    summary_parts = []
    for r in results:
        status = "PASS" if r["passed"] else ("CRITICAL" if r["has_critical"] else "NEEDS REVIEW")
        summary_parts.append(f"### {r['label']} [{status}]\n\n{r['analysis']}")

    detail = "\n\n---\n\n".join(summary_parts)

    if any_critical:
        verdict = "REJECT — 发现严重安全问题，必须修复后再提交"
    elif all_passed:
        verdict = "APPROVE — 所有维度审查通过"
    else:
        verdict = "REQUEST CHANGES — 部分维度需要修改"

    final = sync_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": (
                f"请基于以下多维度代码审查结果，写一段简洁的总结（3-5 句话），"
                f"指出最需要关注的问题和优先修复顺序。\n\n"
                f"审查结论：{verdict}\n\n{detail}"
            ),
        }],
    )

    return f"## 审查结论: {verdict}\n\n{final.content[0].text}\n\n---\n\n## 详细报告\n\n{detail}"


# ── 主入口 ────────────────────────────────────────────────

SAMPLE_CODE = '''
from flask import Flask, request
import sqlite3
import os

app = Flask(__name__)
DB_PASSWORD = "admin123"

@app.route("/user")
def get_user():
    user_id = request.args.get("id")
    conn = sqlite3.connect("app.db")
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    user = cursor.fetchone()
    conn.close()
    return {"user": user, "db_password": DB_PASSWORD}

@app.route("/search")
def search():
    query = request.args.get("q")
    conn = sqlite3.connect("app.db")
    results = []
    for table in ["users", "orders", "products", "logs", "sessions"]:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} WHERE data LIKE '%{query}%'")
        results.extend(cursor.fetchall())
    conn.close()
    return {"results": results, "html": f"<h1>Results for {query}</h1>"}
'''

if __name__ == "__main__":
    print("Reviewing code across 3 dimensions in parallel...\n")
    report = asyncio.run(parallel_review(SAMPLE_CODE))
    print(report)
