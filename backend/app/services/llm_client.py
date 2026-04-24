# ReqBoard - LLM Client（薄封装）
"""统一的 LLM 调用接口，支持 OpenAI / DeepSeek / Anthropic 三家切换。"""
import json
from typing import AsyncGenerator, Optional
from app.core.config import get_settings


EXTRACT_SYSTEM_PROMPT = """你是 ReqBoard 的需求管理助手，负责从会议纪要/群聊片段中抽取需求相关的"动作"。

规则：
1. 只抽取明确达成共识的动作，"讨论中未决议"的不要抽。
2. 输出严格 JSON。
3. 需求匹配：按编号或标题语义匹配"已有需求列表"，有就 update/add_progress/add_blocker，无就 create。
4. 每个动作带 sourceText（原文引用，≤ 200 字）。
5. 不要编造字段值；不确定留空。

动作类型：
- create: 新增需求
- update: 字段更新
- status_change: 状态变更
- scope_adjust: 边界调整
- add_progress: 普通进展
- add_milestone: 里程碑
- add_decision: 决议
- add_risk: 风险
- add_blocker: 新增阻塞
- resolve_blocker: 解除阻塞

Blocker 类型: external_dep/technical/cross_team/pending_decision/upstream_req/other

输出 JSON schema：
{
  "actions": [
    {
      "action": "create|update|...",
      "reqCode": "REQ-2026-0042",
      "summary": "摘要",
      "payload": {"title":"","status":"","progress":60,"content":"","blocker_type":"","description":"","blocking_person":""},
      "diff": {"field":"status","old":"开发中","new":"测试中"},
      "sourceText": "原文片段",
      "confidence": 0.8
    }
  ]
}

只输出 JSON。"""


ASK_SYSTEM_PROMPT = """你是 ReqBoard 需求管理助手，基于需求库上下文回答问题。

要求：
1. 简洁直接，有数据支撑
2. Markdown 格式（**加粗**、列表）
3. 引用具体需求用 REQ-XXXX 编号
4. 不确定时明确说"信息不足"
"""


class LLMClient:
    def __init__(self):
        self.settings = get_settings()
        self.provider = self.settings.llm_provider
        self._client = None

    def enabled(self) -> bool:
        return bool(self.settings.llm_api_key)

    def _is_openai_compatible(self) -> bool:
        """判断是否使用 OpenAI 兼容协议（openai / deepseek / moonshot/kimi）"""
        return self.provider in ("openai", "deepseek", "moonshot", "kimi")

    def _get_client(self):
        if self._client is not None:
            return self._client

        if self._is_openai_compatible():
            from openai import AsyncOpenAI
            base_url = self.settings.llm_base_url
            # 各家默认 base_url
            if not base_url:
                if self.provider == "deepseek":
                    base_url = "https://api.deepseek.com/v1"
                elif self.provider in ("moonshot", "kimi"):
                    base_url = "https://api.moonshot.cn/v1"
            self._client = AsyncOpenAI(
                api_key=self.settings.llm_api_key,
                base_url=base_url,
            )
        elif self.provider == "anthropic":
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self.settings.llm_api_key)
        else:
            raise ValueError(f"不支持的 LLM provider: {self.provider}")

        return self._client

    async def extract_actions(self, text: str, existing_requirements: list[dict]) -> dict:
        model = self.settings.llm_extract_model or self.settings.llm_model
        client = self._get_client()

        user_prompt = f"""已有需求列表：
{json.dumps(existing_requirements, ensure_ascii=False, indent=2)}

请从以下文本抽取动作：
---
{text}
---"""

        if self._is_openai_compatible():
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
        elif self.provider == "anthropic":
            response = await client.messages.create(
                model=model,
                max_tokens=4096,
                system=EXTRACT_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            content = response.content[0].text

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return {"actions": [], "parse_error": True, "raw": content}

    async def ask_stream(self, question: str, context: dict) -> AsyncGenerator[str, None]:
        model = self.settings.llm_model
        client = self._get_client()

        user_prompt = f"""需求库上下文：
{json.dumps(context, ensure_ascii=False, indent=2)[:8000]}

用户问题：{question}"""

        if self._is_openai_compatible():
            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": ASK_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        elif self.provider == "anthropic":
            async with client.messages.stream(
                model=model,
                max_tokens=2048,
                system=ASK_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
