"""
深度调研 Agent — Orchestrator-Workers + Evaluator-Optimizer

架构：
  调研主题
    → [Orchestrator] 拆解为调研子问题
    → [Worker 1..N] 并行调研各子问题
    → [Orchestrator] 汇总初稿
    → [Evaluator] 评估覆盖度和深度
    → 不够 → 补充调研 → 重新汇总
    → 够了 → 输出最终报告

使用方法：
  pip install anthropic
  export ANTHROPIC_API_KEY="your-key"
  python research_agent.py "量子计算对密码学的影响"
"""

import anthropic
import asyncio
import json
import sys

sync_client = anthropic.Anthropic()
async_client = anthropic.AsyncAnthropic()


# ── Step 1: Orchestrator 拆解调研主题 ─────────────────────

def decompose_topic(topic: str) -> list[dict]:
    response = sync_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=(
            "你是一个调研规划专家。将调研主题拆解为 3-5 个可独立调研的子问题。"
            "以 JSON 数组格式返回，每项包含 id(字符串)、question(子问题)、focus(调研重点)。"
            "只返回 JSON，不要其他内容。"
        ),
        messages=[{
            "role": "user",
            "content": f"请拆解以下调研主题：\n{topic}",
        }],
    )

    text = response.content[0].text
    start = text.find("[")
    end = text.rfind("]") + 1
    return json.loads(text[start:end])


# ── Step 2: Worker 并行调研 ──────────────────────────────

async def research_subtopic(subtopic: dict) -> dict:
    response = await async_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=(
            "你是一名专业研究员。针对给定的子问题进行深入分析。"
            "包含：背景概述、关键发现（2-3 个）、数据/案例支撑、存在的争议或不确定性。"
            "输出结构化的研究笔记，不超过 800 字。"
        ),
        messages=[{
            "role": "user",
            "content": f"子问题：{subtopic['question']}\n调研重点：{subtopic['focus']}",
        }],
    )

    return {
        "id": subtopic["id"],
        "question": subtopic["question"],
        "findings": response.content[0].text,
    }


async def parallel_research(subtopics: list[dict]) -> list[dict]:
    tasks = [research_subtopic(st) for st in subtopics]
    return await asyncio.gather(*tasks)


# ── Step 3: Orchestrator 汇总报告 ────────────────────────

def synthesize_report(topic: str, findings: list[dict]) -> str:
    findings_text = "\n\n".join(
        f"### {f['question']}\n{f['findings']}" for f in findings
    )

    response = sync_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=(
            "你是一个高级研究分析师。将多个子问题的调研结果综合为一份连贯、深入的调研报告。"
            "报告结构：摘要(3句话) → 核心发现(分主题) → 关键洞察 → 局限性与未来方向。"
        ),
        messages=[{
            "role": "user",
            "content": f"调研主题：{topic}\n\n各子问题调研结果：\n\n{findings_text}",
        }],
    )

    return response.content[0].text


# ── Step 4: Evaluator 评估报告质量 ───────────────────────

def evaluate_report(topic: str, report: str) -> dict:
    response = sync_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=(
            "你是一个严格的研究质量审查员。评估调研报告是否充分覆盖了主题。"
            "以 JSON 格式返回，包含：\n"
            '  "score": 1-10 的评分,\n'
            '  "passed": true/false（8分及以上为通过）,\n'
            '  "gaps": ["缺失的主题或角度"],\n'
            '  "feedback": "具体改进建议"\n'
            "只返回 JSON。"
        ),
        messages=[{
            "role": "user",
            "content": f"调研主题：{topic}\n\n报告内容：\n{report}",
        }],
    )

    text = response.content[0].text
    start = text.find("{")
    end = text.rfind("}") + 1
    return json.loads(text[start:end])


# ── Step 5: 补充调研（如果评估不通过）───────────────────

async def fill_gaps(gaps: list[str]) -> list[dict]:
    gap_topics = [{"id": f"gap_{i}", "question": gap, "focus": "补充调研"} for i, gap in enumerate(gaps)]
    return await parallel_research(gap_topics)


# ── 主循环：Orchestrator + Evaluator-Optimizer ───────────

def research(topic: str, max_iterations: int = 2, target_score: int = 8) -> dict:
    print(f"[1/4] 拆解调研主题...")
    subtopics = decompose_topic(topic)
    print(f"  → 拆解为 {len(subtopics)} 个子问题:")
    for st in subtopics:
        print(f"    - {st['question']}")

    print(f"\n[2/4] 并行调研中...")
    all_findings = asyncio.run(parallel_research(subtopics))
    print(f"  → {len(all_findings)} 个子问题调研完成")

    for iteration in range(max_iterations):
        print(f"\n[3/4] 汇总报告... (迭代 {iteration + 1}/{max_iterations})")
        report = synthesize_report(topic, all_findings)

        print(f"[4/4] 评估报告质量...")
        evaluation = evaluate_report(topic, report)
        score = evaluation.get("score", 0)
        passed = evaluation.get("passed", False)
        print(f"  → 评分: {score}/10  {'PASS' if passed else 'NEEDS IMPROVEMENT'}")

        if passed and score >= target_score:
            return {
                "report": report,
                "score": score,
                "iterations": iteration + 1,
            }

        gaps = evaluation.get("gaps", [])
        if gaps and iteration < max_iterations - 1:
            print(f"  → 发现 {len(gaps)} 个缺口，补充调研:")
            for gap in gaps:
                print(f"    - {gap}")
            extra_findings = asyncio.run(fill_gaps(gaps))
            all_findings.extend(extra_findings)

    return {
        "report": report,
        "score": score,
        "iterations": max_iterations,
        "note": "达到最大迭代次数",
    }


# ── 主入口 ────────────────────────────────────────────────

if __name__ == "__main__":
    topic = sys.argv[1] if len(sys.argv) > 1 else "大语言模型在医疗诊断中的应用前景与风险"

    print(f"{'='*60}")
    print(f"  深度调研 Agent")
    print(f"  主题: {topic}")
    print(f"{'='*60}\n")

    result = research(topic)

    print(f"\n{'='*60}")
    print(f"  调研完成 | 评分: {result['score']}/10 | 迭代: {result['iterations']} 轮")
    print(f"{'='*60}\n")
    print(result["report"])
