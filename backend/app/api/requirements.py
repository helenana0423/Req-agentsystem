# ReqBoard - 需求 CRUD API
import json
from datetime import datetime
from typing import Optional
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import APIRouter, HTTPException, Depends, Query

from app.models.models import (
    Requirement, RequirementChange, ProgressNote,
    Blocker, RequirementDependency,
)
from app.core.database import get_session

router = APIRouter(prefix="/api/requirements", tags=["requirements"])


@router.get("")
async def list_requirements(
    business_line: Optional[str] = None,
    owner: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    has_blocker: Optional[bool] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    """获取需求列表，支持筛选"""
    statement = select(Requirement).order_by(Requirement.updated_at.desc())

    if business_line:
        statement = statement.where(Requirement.business_line == business_line)
    if owner:
        statement = statement.where(Requirement.owner == owner)
    if status:
        statement = statement.where(Requirement.status == status)
    if priority:
        statement = statement.where(Requirement.priority == priority)
    if search:
        statement = statement.where(
            (Requirement.title.contains(search))
            | (Requirement.description.contains(search))
            | (Requirement.code.contains(search))
        )
    if has_blocker is True:
        blocker_ids = select(Blocker.requirement_id).where(Blocker.status == "active")
        statement = statement.where(Requirement.id.in_(blocker_ids))

    count_stmt = select(func.count()).select_from(statement.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    statement = statement.offset(offset).limit(limit)
    results = (await session.execute(statement)).scalars().all()

    items = []
    for req in results:
        req_dict = req.model_dump(mode="json")

        blocker_stmt = select(func.count()).where(
            Blocker.requirement_id == req.id,
            Blocker.status == "active",
        )
        active_blockers = (await session.execute(blocker_stmt)).scalar() or 0
        req_dict["active_blocker_count"] = active_blockers

        note_stmt = (
            select(ProgressNote)
            .where(ProgressNote.requirement_id == req.id)
            .order_by(ProgressNote.created_at.desc())
            .limit(1)
        )
        latest_note = (await session.execute(note_stmt)).scalar_one_or_none()
        req_dict["latest_progress"] = latest_note.model_dump(mode="json") if latest_note else None

        items.append(req_dict)

    return {"total": total, "items": items, "offset": offset, "limit": limit}


@router.get("/{requirement_id}")
async def get_requirement(
    requirement_id: str,
    session: AsyncSession = Depends(get_session),
):
    req = await session.get(Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    return req.model_dump(mode="json")


@router.post("")
async def create_requirement(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """创建需求"""
    now = datetime.now()
    year = now.year
    count_stmt = select(func.count()).where(Requirement.code.like(f"REQ-{year}-%"))
    count = (await session.execute(count_stmt)).scalar() or 0
    code = data.get("code") or f"REQ-{year}-{count + 1:04d}"

    req = Requirement(
        code=code,
        title=data.get("title", ""),
        business_line=data.get("business_line", "其他"),
        owner=data.get("owner", ""),
        dev_owner=data.get("dev_owner"),
        status=data.get("status", "待评审"),
        priority=data.get("priority", "P2"),
        description=data.get("description"),
        scope=data.get("scope"),
        source=data.get("source"),
        tags=json.dumps(data.get("tags", []), ensure_ascii=False) if data.get("tags") else None,
        planned_start=data.get("planned_start"),
        planned_end=data.get("planned_end"),
        expected_release=data.get("expected_release"),
        progress=data.get("progress", 0),
        estimated_days=data.get("estimated_days"),
    )
    session.add(req)

    change = RequirementChange(
        requirement_id=req.id,
        change_type="create",
        reason=data.get("source", "手动创建"),
        source=data.get("_source", "manual"),
        source_ref=data.get("_source_ref"),
        operator=data.get("operator", "system"),
    )
    session.add(change)

    note = ProgressNote(
        requirement_id=req.id,
        note_type="comment",
        content=f"需求创建，来源：{data.get('source', '手动创建')}",
        author=data.get("operator", "system"),
        source=data.get("_source", "manual"),
    )
    session.add(note)

    await session.commit()
    await session.refresh(req)
    return req.model_dump(mode="json")


@router.put("/{requirement_id}")
async def update_requirement(
    requirement_id: str,
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """更新需求"""
    req = await session.get(Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")

    updatable_fields = [
        "title", "business_line", "owner", "dev_owner", "status",
        "priority", "description", "scope", "source", "tags",
        "planned_start", "planned_end", "expected_release",
        "actual_start", "actual_release", "progress", "estimated_days",
    ]

    for field in updatable_fields:
        if field in data and data[field] is not None:
            old_val = getattr(req, field)
            new_val = data[field]

            if field == "tags" and isinstance(new_val, list):
                new_val = json.dumps(new_val, ensure_ascii=False)

            if str(old_val) != str(new_val):
                change_type = "status_change" if field == "status" else (
                    "scope_adjust" if field == "scope" else "update"
                )
                change = RequirementChange(
                    requirement_id=req.id,
                    change_type=change_type,
                    field=field,
                    old_value=str(old_val) if old_val is not None else None,
                    new_value=str(new_val) if new_val is not None else None,
                    reason=data.get("_reason") or data.get("change_reason"),
                    source=data.get("_source") or data.get("change_source", "manual"),
                    source_ref=data.get("_source_ref") or data.get("source_ref"),
                    operator=data.get("operator", "system"),
                )
                session.add(change)
                setattr(req, field, new_val)

    # 状态变为"已上线"时自动解除相关 blocker
    if data.get("status") == "已上线":
        blocker_stmt = select(Blocker).where(
            Blocker.linked_requirement_id == requirement_id,
            Blocker.status == "active",
        )
        blockers = (await session.execute(blocker_stmt)).scalars().all()
        for b in blockers:
            b.status = "resolved"
            b.resolved_at = datetime.now()
            b.resolved_note = f"前置需求 {req.code} 已上线，自动解除"
            unblock_note = ProgressNote(
                requirement_id=b.requirement_id,
                note_type="unblock",
                content=f"前置需求 {req.code} 已完成，阻塞自动解除",
                author="system",
                source="manual",
            )
            session.add(unblock_note)

    req.updated_at = datetime.now()
    await session.commit()
    await session.refresh(req)
    return req.model_dump(mode="json")


@router.delete("/{requirement_id}")
async def delete_requirement(
    requirement_id: str,
    session: AsyncSession = Depends(get_session),
):
    """删除需求（级联）"""
    req = await session.get(Requirement, requirement_id)
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")

    for table_cls in [RequirementChange, ProgressNote, Blocker]:
        stmt = select(table_cls).where(
            getattr(table_cls, "requirement_id") == requirement_id
        )
        items = (await session.execute(stmt)).scalars().all()
        for item in items:
            await session.delete(item)

    dep_stmt = select(RequirementDependency).where(
        (RequirementDependency.from_id == requirement_id)
        | (RequirementDependency.to_id == requirement_id)
    )
    deps = (await session.execute(dep_stmt)).scalars().all()
    for dep in deps:
        await session.delete(dep)

    await session.delete(req)
    await session.commit()
    return {"ok": True}


@router.get("/{requirement_id}/changes")
async def list_changes(
    requirement_id: str,
    session: AsyncSession = Depends(get_session),
):
    """获取需求的变更历史"""
    stmt = (
        select(RequirementChange)
        .where(RequirementChange.requirement_id == requirement_id)
        .order_by(RequirementChange.created_at.desc())
    )
    items = (await session.execute(stmt)).scalars().all()
    return {"items": [c.model_dump(mode="json") for c in items]}
