# ReqBoard - 进展动态 & 阻塞项 API
from datetime import datetime
from typing import Optional
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import APIRouter, HTTPException, Depends, Query

from app.models.models import ProgressNote, Blocker, Requirement
from app.core.database import get_session

router = APIRouter(tags=["progress"])


@router.get("/api/requirements/{requirement_id}/progress")
async def list_progress_notes(
    requirement_id: str,
    note_type: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    statement = (
        select(ProgressNote)
        .where(ProgressNote.requirement_id == requirement_id)
        .order_by(ProgressNote.created_at.desc())
    )
    if note_type:
        statement = statement.where(ProgressNote.note_type == note_type)

    results = (await session.execute(statement)).scalars().all()
    return {"items": [n.model_dump(mode="json") for n in results]}


@router.post("/api/requirements/{requirement_id}/progress")
async def add_progress_note(
    requirement_id: str,
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """添加进展动态"""
    note = ProgressNote(
        requirement_id=requirement_id,
        note_type=data.get("note_type", "comment"),
        content=data.get("content", ""),
        author=data.get("author", "system"),
        source=data.get("source", "manual"),
        source_ref=data.get("source_ref"),
    )
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return note.model_dump(mode="json")


@router.delete("/api/progress/{note_id}")
async def delete_progress_note(
    note_id: str,
    session: AsyncSession = Depends(get_session),
):
    note = await session.get(ProgressNote, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="进展不存在")
    await session.delete(note)
    await session.commit()
    return {"ok": True}


@router.get("/api/blockers")
async def list_blockers(
    requirement_id: Optional[str] = None,
    blocker_type: Optional[str] = None,
    status: Optional[str] = None,
    business_line: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """获取阻塞项列表"""
    statement = select(Blocker).order_by(Blocker.created_at.desc())

    if requirement_id:
        statement = statement.where(Blocker.requirement_id == requirement_id)
    if blocker_type:
        statement = statement.where(Blocker.blocker_type == blocker_type)
    if status:
        statement = statement.where(Blocker.status == status)
    if business_line:
        statement = statement.join(
            Requirement, Blocker.requirement_id == Requirement.id
        ).where(Requirement.business_line == business_line)

    results = (await session.execute(statement)).scalars().all()

    items = []
    for b in results:
        b_dict = b.model_dump(mode="json")
        if b.status == "active":
            b_dict["active_days"] = (datetime.now() - b.created_at).days
        elif b.resolved_at:
            b_dict["active_days"] = (b.resolved_at - b.created_at).days
        else:
            b_dict["active_days"] = 0
        items.append(b_dict)

    return {"items": items}


@router.post("/api/blockers")
async def create_blocker(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """创建阻塞项 + 自动写入 blocker 类型进展"""
    blocker = Blocker(
        requirement_id=data["requirement_id"],
        blocker_type=data.get("blocker_type", "other"),
        description=data.get("description", ""),
        blocking_person=data.get("blocking_person"),
        blocking_team=data.get("blocking_team"),
        linked_requirement_id=data.get("linked_requirement_id"),
        expected_resolve_date=data.get("expected_resolve_date"),
    )
    session.add(blocker)

    note = ProgressNote(
        requirement_id=data["requirement_id"],
        note_type="blocker",
        content=f"【{data.get('blocker_type', 'other')}】{data.get('description', '')}",
        author=data.get("author", "system"),
        source=data.get("source", "manual"),
    )
    session.add(note)

    await session.commit()
    await session.refresh(blocker)
    return blocker.model_dump(mode="json")


@router.patch("/api/blockers/{blocker_id}/resolve")
async def resolve_blocker(
    blocker_id: str,
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    blocker = await session.get(Blocker, blocker_id)
    if not blocker:
        raise HTTPException(status_code=404, detail="阻塞项不存在")

    blocker.status = "resolved"
    blocker.resolved_at = datetime.now()
    blocker.resolved_note = data.get("resolved_note", "")

    note = ProgressNote(
        requirement_id=blocker.requirement_id,
        note_type="unblock",
        content=f"阻塞已解除：{blocker.description}" + (f" - {data.get('resolved_note')}" if data.get("resolved_note") else ""),
        author=data.get("author", "system"),
        source="manual",
    )
    session.add(note)

    await session.commit()
    await session.refresh(blocker)
    return blocker.model_dump(mode="json")
