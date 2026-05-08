/**
 * 深度调研 Agent — Orchestrator-Workers + Evaluator-Optimizer
 *
 * 架构：
 *   调研主题
 *     → [Orchestrator] 拆解为调研子问题
 *     → [Worker 1..N] 并行调研各子问题
 *     → [Orchestrator] 汇总初稿
 *     → [Evaluator] 评估覆盖度和深度
 *     → 不够 → 补充调研 → 重新汇总
 *     → 够了 → 输出最终报告
 *
 * 运行方法：
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY="your-key"
 *   npx tsx examples/research_agent.ts "量子计算对密码学的影响"
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface Subtopic {
  id: string;
  question: string;
  focus: string;
}

interface Finding {
  id: string;
  question: string;
  findings: string;
}

interface Evaluation {
  score: number;
  passed: boolean;
  gaps: string[];
  feedback: string;
}

interface ResearchResult {
  report: string;
  score: number;
  iterations: number;
  note?: string;
}

// ── Step 1: Orchestrator 拆解调研主题 ─────────────────────

async function decomposeTopic(topic: string): Promise<Subtopic[]> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system:
      "你是一个调研规划专家。将调研主题拆解为 3-5 个可独立调研的子问题。" +
      "以 JSON 数组格式返回，每项包含 id(字符串)、question(子问题)、focus(调研重点)。" +
      "只返回 JSON，不要其他内容。",
    messages: [
      { role: "user", content: `请拆解以下调研主题：\n${topic}` },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "[]";
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]") + 1;
  return JSON.parse(text.slice(start, end));
}

// ── Step 2: Worker 并行调研 ──────────────────────────────

async function researchSubtopic(subtopic: Subtopic): Promise<Finding> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system:
      "你是一名专业研究员。针对给定的子问题进行深入分析。" +
      "包含：背景概述、关键发现（2-3 个）、数据/案例支撑、存在的争议或不确定性。" +
      "输出结构化的研究笔记，不超过 800 字。",
    messages: [
      {
        role: "user",
        content: `子问题：${subtopic.question}\n调研重点：${subtopic.focus}`,
      },
    ],
  });

  return {
    id: subtopic.id,
    question: subtopic.question,
    findings:
      response.content[0].type === "text" ? response.content[0].text : "",
  };
}

async function parallelResearch(subtopics: Subtopic[]): Promise<Finding[]> {
  return Promise.all(subtopics.map(researchSubtopic));
}

// ── Step 3: Orchestrator 汇总报告 ────────────────────────

async function synthesizeReport(
  topic: string,
  findings: Finding[]
): Promise<string> {
  const findingsText = findings
    .map((f) => `### ${f.question}\n${f.findings}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system:
      "你是一个高级研究分析师。将多个子问题的调研结果综合为一份连贯、深入的调研报告。" +
      "报告结构：摘要(3句话) → 核心发现(分主题) → 关键洞察 → 局限性与未来方向。",
    messages: [
      {
        role: "user",
        content: `调研主题：${topic}\n\n各子问题调研结果：\n\n${findingsText}`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ── Step 4: Evaluator 评估报告质量 ───────────────────────

async function evaluateReport(
  topic: string,
  report: string
): Promise<Evaluation> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "你是一个严格的研究质量审查员。评估调研报告是否充分覆盖了主题。" +
      "以 JSON 格式返回，包含：\n" +
      '  "score": 1-10 的评分,\n' +
      '  "passed": true/false（8分及以上为通过）,\n' +
      '  "gaps": ["缺失的主题或角度"],\n' +
      '  "feedback": "具体改进建议"\n' +
      "只返回 JSON。",
    messages: [
      {
        role: "user",
        content: `调研主题：${topic}\n\n报告内容：\n${report}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  return JSON.parse(text.slice(start, end));
}

// ── 主循环：Orchestrator + Evaluator-Optimizer ───────────

async function research(
  topic: string,
  maxIterations = 2,
  targetScore = 8
): Promise<ResearchResult> {
  console.log("[1/4] 拆解调研主题...");
  const subtopics = await decomposeTopic(topic);
  console.log(`  → 拆解为 ${subtopics.length} 个子问题:`);
  for (const st of subtopics) {
    console.log(`    - ${st.question}`);
  }

  console.log("\n[2/4] 并行调研中...");
  const allFindings = await parallelResearch(subtopics);
  console.log(`  → ${allFindings.length} 个子问题调研完成`);

  let report = "";
  let evaluation: Evaluation = { score: 0, passed: false, gaps: [], feedback: "" };

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(
      `\n[3/4] 汇总报告... (迭代 ${iteration + 1}/${maxIterations})`
    );
    report = await synthesizeReport(topic, allFindings);

    console.log("[4/4] 评估报告质量...");
    evaluation = await evaluateReport(topic, report);
    console.log(
      `  → 评分: ${evaluation.score}/10  ${evaluation.passed ? "PASS" : "NEEDS IMPROVEMENT"}`
    );

    if (evaluation.passed && evaluation.score >= targetScore) {
      return { report, score: evaluation.score, iterations: iteration + 1 };
    }

    if (evaluation.gaps.length > 0 && iteration < maxIterations - 1) {
      console.log(`  → 发现 ${evaluation.gaps.length} 个缺口，补充调研:`);
      for (const gap of evaluation.gaps) {
        console.log(`    - ${gap}`);
      }
      const gapTopics: Subtopic[] = evaluation.gaps.map((gap, i) => ({
        id: `gap_${i}`,
        question: gap,
        focus: "补充调研",
      }));
      const extraFindings = await parallelResearch(gapTopics);
      allFindings.push(...extraFindings);
    }
  }

  return {
    report,
    score: evaluation.score,
    iterations: maxIterations,
    note: "达到最大迭代次数",
  };
}

// ── 主入口 ────────────────────────────────────────────────

const topic =
  process.argv[2] ?? "大语言模型在医疗诊断中的应用前景与风险";

console.log("=".repeat(60));
console.log(`  深度调研 Agent`);
console.log(`  主题: ${topic}`);
console.log("=".repeat(60) + "\n");

const result = await research(topic);

console.log("\n" + "=".repeat(60));
console.log(
  `  调研完成 | 评分: ${result.score}/10 | 迭代: ${result.iterations} 轮`
);
console.log("=".repeat(60) + "\n");
console.log(result.report);
