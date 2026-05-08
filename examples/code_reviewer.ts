/**
 * 多维度代码审查 — Parallelization (Voting)
 *
 * 架构：
 *   代码输入 → [安全审查] ──┐
 *            → [性能审查] ──┼→ 汇总投票 → 最终报告
 *            → [可维护性] ──┘
 *
 * 每个审查维度独立并行运行，最终汇总为综合报告。
 *
 * 运行方法：
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY="your-key"
 *   npx tsx examples/code_reviewer.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// ── 审查维度定义 ──────────────────────────────────────────

interface ReviewDimension {
  name: string;
  label: string;
  system: string;
  prompt: string;
}

interface ReviewResult {
  dimension: string;
  label: string;
  analysis: string;
  passed: boolean;
  hasCritical: boolean;
  hasHigh: boolean;
}

const REVIEW_DIMENSIONS: ReviewDimension[] = [
  {
    name: "security",
    label: "安全性",
    system: "你是一名安全审计专家。专注于发现代码中的安全漏洞。",
    prompt: [
      "从安全角度审查以下代码。重点关注：",
      "- SQL 注入、XSS、命令注入",
      "- 认证和授权漏洞",
      "- 敏感数据泄露（硬编码密钥、日志中打印密码等）",
      "- 不安全的反序列化",
      "",
      "对每个发现的问题标注严重程度：CRITICAL / HIGH / MEDIUM / LOW",
      "如果没有发现问题，明确说明 PASS。",
    ].join("\n"),
  },
  {
    name: "performance",
    label: "性能",
    system: "你是一名性能优化专家。专注于发现代码中的性能问题。",
    prompt: [
      "从性能角度审查以下代码。重点关注：",
      "- N+1 查询问题",
      "- 不必要的内存分配或拷贝",
      "- 可以并行但串行执行的操作",
      "- 缺少缓存的重复计算",
      "- 算法复杂度问题",
      "",
      "对每个问题评估影响程度：HIGH / MEDIUM / LOW",
      "如果没有发现问题，明确说明 PASS。",
    ].join("\n"),
  },
  {
    name: "maintainability",
    label: "可维护性",
    system: "你是一名代码质量专家。专注于代码的可读性和可维护性。",
    prompt: [
      "从可维护性角度审查以下代码。重点关注：",
      "- 命名是否清晰表达意图",
      "- 函数是否过长或职责过多",
      "- 错误处理是否恰当",
      "- 是否有明显的代码异味（code smell）",
      "- 是否违反 SOLID 原则",
      "",
      "对每个问题标注优先级：HIGH / MEDIUM / LOW",
      "如果没有发现问题，明确说明 PASS。",
    ].join("\n"),
  },
];

// ── 单维度审查 ────────────────────────────────────────────

async function reviewDimension(
  code: string,
  dimension: ReviewDimension
): Promise<ReviewResult> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: dimension.system,
    messages: [
      {
        role: "user",
        content: `${dimension.prompt}\n\n\`\`\`\n${code}\n\`\`\``,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const upper = text.toUpperCase();
  const hasCritical = upper.includes("CRITICAL");
  const hasHigh = upper.includes("HIGH");
  const passed = upper.includes("PASS") && !hasCritical && !hasHigh;

  return {
    dimension: dimension.name,
    label: dimension.label,
    analysis: text,
    passed,
    hasCritical,
    hasHigh,
  };
}

// ── 并行审查 + 汇总 ─────────────────────────────────────

async function parallelReview(code: string): Promise<string> {
  console.log("Reviewing code across 3 dimensions in parallel...\n");

  const results = await Promise.all(
    REVIEW_DIMENSIONS.map((dim) => reviewDimension(code, dim))
  );

  const allPassed = results.every((r) => r.passed);
  const anyCritical = results.some((r) => r.hasCritical);

  const detail = results
    .map((r) => {
      const status = r.passed
        ? "PASS"
        : r.hasCritical
          ? "CRITICAL"
          : "NEEDS REVIEW";
      return `### ${r.label} [${status}]\n\n${r.analysis}`;
    })
    .join("\n\n---\n\n");

  let verdict: string;
  if (anyCritical) {
    verdict = "REJECT — 发现严重安全问题，必须修复后再提交";
  } else if (allPassed) {
    verdict = "APPROVE — 所有维度审查通过";
  } else {
    verdict = "REQUEST CHANGES — 部分维度需要修改";
  }

  const summary = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `请基于以下多维度代码审查结果，写一段简洁的总结（3-5 句话），` +
          `指出最需要关注的问题和优先修复顺序。\n\n` +
          `审查结论：${verdict}\n\n${detail}`,
      },
    ],
  });

  const summaryText =
    summary.content[0].type === "text" ? summary.content[0].text : "";

  return `## 审查结论: ${verdict}\n\n${summaryText}\n\n---\n\n## 详细报告\n\n${detail}`;
}

// ── 主入口 ────────────────────────────────────────────────

const SAMPLE_CODE = `
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
`;

const report = await parallelReview(SAMPLE_CODE);
console.log(report);
