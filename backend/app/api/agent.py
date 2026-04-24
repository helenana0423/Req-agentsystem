# ReqBoard - Agent API（抽取 + 问答）
import json
from datetime import datetime
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.models import (
    Requirement, RequirementChange, ProgressNote, Blocker,
)
from app.core.database import get_session

router = APIRouter(tags=["agent"])


@router.post("/api/agent/extract")
async def extract_from_text(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """
    从纪要文本抽取需求动作，返回拟执行清单
    前端展示后由用户确认再写库
    """
    text = data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="缺少 text")

    # 获取现有需求（供 Agent 匹配）
    stmt = select(Requirement)
    existing_reqs = (await session.execute(stmt)).scalars().all()
    existing_list = [
        {
            "id": r.id,
            "code": r.code,
            "title": r.title,
            "business_line": r.business_line,
            "status": r.status,
            "owner": r.owner,
            "scope": r.scope,
        }
        for r in existing_reqs
    ]

    from app.services.llm_client import LLMClient
    llm = LLMClient()

    if not llm.enabled():
        return {
            "enabled": False,
            "actions": [],
            "message": "后端 LLM 未启用，请在前端使用本地规则引擎",
        }

    try:
        result = await llm.extract_actions(text=text, existing_requirements=existing_list)
        result["enabled"] = True
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 抽取失败: {e}")


@router.post("/api/agent/extract/confirm")
async def confirm_extraction(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """
    批量应用抽取结果（若前端需要通过后端批量写入，可用此接口；
    也可不用，前端逐条调已有的 CRUD 接口）
    """
    actions = data.get("actions", [])
    operator = data.get("operator", "system")
    results = []

    for action in actions:
        act_type = action.get("action") or action.get("type")

        if act_type == "create":
            now = datetime.now()
            year = now.year
            count_stmt = select(func.count()).where(
                Requirement.code.like(f"REQ-{year}-%")
            )
            count = (await session.execute(count_stmt)).scalar() or 0
            code = f"REQ-{year}-{count + 1:04d}"

            fields = action.get("payload") or action.get("fields", {})
            req = Requirement(
                code=code,
                title=fields.get("title", ""),
                business_line=fields.get("business_line", "其他"),
                owner=fields.get("owner", ""),
                status=fields.get("status", "待评审"),
                priority=fields.get("priority", "P2"),
                description=fields.get("description"),
                scope=fields.get("scope"),
                source=action.get("sourceText", "")[:200],
            )
            session.add(req)

            change = RequirementChange(
                requirement_id=req.id,
                change_type="create",
                reason=f"Agent 抽取：{action.get('summary', '')}",
                source="agent_extract",
                source_ref=action.get("sourceText"),
                operator=operator,
            )
            session.add(change)
            results.append({"action": "create", "code": code, "status": "ok"})

        # 其他动作留给前端直接调原有 CRUD 接口更简单

    await session.commit()
    return {"results": results}


@router.post("/api/agent/ask")
async def ask_agent(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """Agent 问答（SSE 流式）"""
    question = data.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="缺少 question")

    from app.services.llm_client import LLMClient
    llm = LLMClient()

    if not llm.enabled():
        async def disabled_stream():
            yield {
                "event": "message",
                "data": json.dumps({
                    "content": "⚠️ 后端 LLM 未启用。\n\n若要启用真实 LLM 问答：在项目根目录创建 `.env`，配置 `LLM_API_KEY` 和 `LLM_ENABLED=true`。\n\n前端已使用本地规则引擎兜底回答。"
                }, ensure_ascii=False),
            }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        return EventSourceResponse(disabled_stream())

    # 拼接当前上下文
    reqs_stmt = select(Requirement).limit(100)
    reqs = (await session.execute(reqs_stmt)).scalars().all()
    blockers_stmt = select(Blocker).where(Blocker.status == "active")
    active_blockers = (await session.execute(blockers_stmt)).scalars().all()

    context = {
        "requirements": [
            {
                "code": r.code, "title": r.title, "status": r.status,
                "priority": r.priority, "owner": r.owner,
                "business_line": r.business_line, "progress": r.progress,
                "planned_end": r.planned_end.isoformat() if r.planned_end else None,
                "scope": (r.scope or "")[:200],
            }
            for r in reqs
        ],
        "active_blockers": [
            {
                "requirement_id": b.requirement_id, "type": b.blocker_type,
                "description": b.description, "blocking_person": b.blocking_person,
            }
            for b in active_blockers
        ],
    }

    async def event_stream():
        try:
            async for chunk in llm.ask_stream(question=question, context=context):
                yield {
                    "event": "message",
                    "data": json.dumps({"content": chunk}, ensure_ascii=False),
                }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}, ensure_ascii=False),
            }

    return EventSourceResponse(event_stream())
