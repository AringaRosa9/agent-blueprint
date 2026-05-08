"""
智能客服系统 — Routing + Augmented LLM

架构：
  用户输入 → [分类器(Haiku)] → 一般咨询 → [Haiku + 知识库搜索]
                              → 订单查询 → [Sonnet + 订单工具]
                              → 退款处理 → [Sonnet + 退款工具]

使用方法：
  pip install anthropic
  export ANTHROPIC_API_KEY="your-key"
  python customer_support.py
"""

import anthropic
import json

client = anthropic.Anthropic()

# ── 工具定义 ──────────────────────────────────────────────

KNOWLEDGE_SEARCH_TOOL = {
    "name": "search_knowledge_base",
    "description": "搜索产品知识库，获取产品功能、使用方法、常见问题的答案。仅用于回答一般性产品咨询，不用于查询具体订单。",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "自然语言搜索查询",
            }
        },
        "required": ["query"],
    },
}

ORDER_LOOKUP_TOOL = {
    "name": "lookup_order",
    "description": "根据订单号查询订单详情，包括状态、物流、金额。订单号格式为 ORD-开头的字符串。",
    "input_schema": {
        "type": "object",
        "properties": {
            "order_id": {
                "type": "string",
                "description": "订单号，格式如 ORD-20240101-001",
            }
        },
        "required": ["order_id"],
    },
}

REFUND_TOOL = {
    "name": "process_refund",
    "description": "为指定订单发起退款。仅在确认用户身份和退款原因后使用。退款会在 3-5 个工作日到账。",
    "input_schema": {
        "type": "object",
        "properties": {
            "order_id": {
                "type": "string",
                "description": "要退款的订单号",
            },
            "reason": {
                "type": "string",
                "enum": ["product_defect", "wrong_item", "not_received", "changed_mind"],
                "description": "退款原因",
            },
        },
        "required": ["order_id", "reason"],
    },
}

# ── 工具执行（模拟） ─────────────────────────────────────

def execute_tool(name: str, input_data: dict) -> str:
    if name == "search_knowledge_base":
        return json.dumps({
            "results": [
                {"title": "产品使用指南", "content": f"关于「{input_data['query']}」的解答：..."},
            ]
        })
    elif name == "lookup_order":
        return json.dumps({
            "order_id": input_data["order_id"],
            "status": "已发货",
            "tracking": "SF1234567890",
            "amount": 299.00,
            "created_at": "2026-05-01",
        })
    elif name == "process_refund":
        return json.dumps({
            "success": True,
            "refund_id": "REF-20260508-001",
            "message": f"订单 {input_data['order_id']} 退款已发起，预计 3-5 个工作日到账",
        })
    return json.dumps({"error": f"未知工具: {name}"})


# ── Step 1: 路由分类器 ───────────────────────────────────

def classify(user_input: str) -> str:
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=50,
        messages=[{
            "role": "user",
            "content": (
                "将以下客服消息分类为一个类别。仅返回类别名称。\n\n"
                "类别：\n"
                "- general_inquiry（一般咨询：产品功能、使用方法、常见问题）\n"
                "- order_query（订单查询：查物流、查状态、查金额）\n"
                "- refund_request（退款请求：要求退货退款）\n\n"
                f"消息：{user_input}"
            ),
        }],
    )
    return response.content[0].text.strip()


# ── Step 2: 各分支 Handler ───────────────────────────────

def handle_with_tools(user_input: str, system: str, tools: list, model: str) -> str:
    messages = [{"role": "user", "content": user_input}]

    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=system,
        tools=tools,
        messages=messages,
    )

    while response.stop_reason == "tool_use":
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=system,
            tools=tools,
            messages=messages,
        )

    return response.content[0].text


HANDLERS = {
    "general_inquiry": lambda q: handle_with_tools(
        q,
        system="你是一个友好的客服助手。使用知识库搜索来回答用户的问题。语气亲切专业。",
        tools=[KNOWLEDGE_SEARCH_TOOL],
        model="claude-haiku-4-5-20251001",
    ),
    "order_query": lambda q: handle_with_tools(
        q,
        system="你是订单查询专员。帮助用户查询订单状态和物流信息。如果用户没有提供订单号，请先询问。",
        tools=[ORDER_LOOKUP_TOOL],
        model="claude-sonnet-4-6",
    ),
    "refund_request": lambda q: handle_with_tools(
        q,
        system="你是退款处理专员。在处理退款前，必须确认订单号和退款原因。退款政策：购买后 30 天内可退。",
        tools=[ORDER_LOOKUP_TOOL, REFUND_TOOL],
        model="claude-sonnet-4-6",
    ),
}


# ── 主入口 ────────────────────────────────────────────────

def customer_support(user_input: str) -> str:
    category = classify(user_input)
    print(f"  [路由] 分类结果: {category}")

    handler = HANDLERS.get(category, HANDLERS["general_inquiry"])
    return handler(user_input)


if __name__ == "__main__":
    test_queries = [
        "你们的产品支持蓝牙吗？",
        "帮我查一下订单 ORD-20260501-042 到哪了",
        "我收到的商品有质量问题，我要退款，订单号 ORD-20260428-015",
    ]

    for query in test_queries:
        print(f"\n{'='*60}")
        print(f"用户: {query}")
        print(f"{'='*60}")
        response = customer_support(query)
        print(f"\n客服: {response}")
