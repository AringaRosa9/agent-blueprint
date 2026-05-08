/**
 * 智能客服系统 — Routing + Augmented LLM
 *
 * 架构：
 *   用户输入 → [分类器(Haiku)] → 一般咨询 → [Haiku + 知识库搜索]
 *                               → 订单查询 → [Sonnet + 订单工具]
 *                               → 退款处理 → [Sonnet + 退款工具]
 *
 * 运行方法：
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY="your-key"
 *   npx tsx examples/customer_support.ts
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// ── 工具定义 ──────────────────────────────────────────────

const KNOWLEDGE_SEARCH_TOOL: Anthropic.Tool = {
  name: "search_knowledge_base",
  description:
    "搜索产品知识库，获取产品功能、使用方法、常见问题的答案。仅用于回答一般性产品咨询，不用于查询具体订单。",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "自然语言搜索查询" },
    },
    required: ["query"],
  },
};

const ORDER_LOOKUP_TOOL: Anthropic.Tool = {
  name: "lookup_order",
  description:
    "根据订单号查询订单详情，包括状态、物流、金额。订单号格式为 ORD-开头的字符串。",
  input_schema: {
    type: "object" as const,
    properties: {
      order_id: {
        type: "string",
        description: "订单号，格式如 ORD-20240101-001",
      },
    },
    required: ["order_id"],
  },
};

const REFUND_TOOL: Anthropic.Tool = {
  name: "process_refund",
  description:
    "为指定订单发起退款。仅在确认用户身份和退款原因后使用。退款会在 3-5 个工作日到账。",
  input_schema: {
    type: "object" as const,
    properties: {
      order_id: { type: "string", description: "要退款的订单号" },
      reason: {
        type: "string",
        enum: ["product_defect", "wrong_item", "not_received", "changed_mind"],
        description: "退款原因",
      },
    },
    required: ["order_id", "reason"],
  },
};

// ── 工具执行（模拟） ─────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "search_knowledge_base":
      return JSON.stringify({
        results: [
          { title: "产品使用指南", content: `关于「${input.query}」的解答：...` },
        ],
      });
    case "lookup_order":
      return JSON.stringify({
        order_id: input.order_id,
        status: "已发货",
        tracking: "SF1234567890",
        amount: 299.0,
        created_at: "2026-05-01",
      });
    case "process_refund":
      return JSON.stringify({
        success: true,
        refund_id: "REF-20260508-001",
        message: `订单 ${input.order_id} 退款已发起，预计 3-5 个工作日到账`,
      });
    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

// ── Step 1: 路由分类器 ───────────────────────────────────

async function classify(userInput: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content:
          "将以下客服消息分类为一个类别。仅返回类别名称。\n\n" +
          "类别：\n" +
          "- general_inquiry（一般咨询：产品功能、使用方法、常见问题）\n" +
          "- order_query（订单查询：查物流、查状态、查金额）\n" +
          "- refund_request（退款请求：要求退货退款）\n\n" +
          `消息：${userInput}`,
      },
    ],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text.trim() : "general_inquiry";
}

// ── Step 2: 带工具的对话处理 ─────────────────────────────

async function handleWithTools(
  userInput: string,
  system: string,
  tools: Anthropic.Tool[],
  model: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userInput },
  ];

  let response = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = executeTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model,
      max_tokens: 2048,
      system,
      tools,
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

// ── 路由 Handler 映射 ────────────────────────────────────

const HANDLERS: Record<string, (q: string) => Promise<string>> = {
  general_inquiry: (q) =>
    handleWithTools(
      q,
      "你是一个友好的客服助手。使用知识库搜索来回答用户的问题。语气亲切专业。",
      [KNOWLEDGE_SEARCH_TOOL],
      "claude-haiku-4-5-20251001"
    ),
  order_query: (q) =>
    handleWithTools(
      q,
      "你是订单查询专员。帮助用户查询订单状态和物流信息。如果用户没有提供订单号，请先询问。",
      [ORDER_LOOKUP_TOOL],
      "claude-sonnet-4-6"
    ),
  refund_request: (q) =>
    handleWithTools(
      q,
      "你是退款处理专员。在处理退款前，必须确认订单号和退款原因。退款政策：购买后 30 天内可退。",
      [ORDER_LOOKUP_TOOL, REFUND_TOOL],
      "claude-sonnet-4-6"
    ),
};

// ── 主入口 ────────────────────────────────────────────────

async function customerSupport(userInput: string): Promise<string> {
  const category = await classify(userInput);
  console.log(`  [路由] 分类结果: ${category}`);

  const handler = HANDLERS[category] ?? HANDLERS["general_inquiry"];
  return handler(userInput);
}

const testQueries = [
  "你们的产品支持蓝牙吗？",
  "帮我查一下订单 ORD-20260501-042 到哪了",
  "我收到的商品有质量问题，我要退款，订单号 ORD-20260428-015",
];

for (const query of testQueries) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`用户: ${query}`);
  console.log("=".repeat(60));
  const response = await customerSupport(query);
  console.log(`\n客服: ${response}`);
}
