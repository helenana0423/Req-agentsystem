# ReqBoard - 依赖关系 & 甘特图计算 API
from datetime import datetime, date, timedelta
from typing import Optional
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from fastapi import APIRouter, HTTPException, Depends

from app.models.models import Requirement, RequirementDependency, Blocker, ProgressNote
from app.core.database import get_session

router = APIRouter(tags=["dependencies"])


@router.get("/api/dependencies")
async def list_all_dependencies(
    session: AsyncSession = Depends(get_session),
):
    """获取所有依赖关系"""
    stmt = select(RequirementDependency)
    deps = (await session.execute(stmt)).scalars().all()
    return {"items": [d.model_dump(mode="json") for d in deps]}


@router.get("/api/requirements/{requirement_id}/dependencies")
async def list_dependencies(
    requirement_id: str,
    direction: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """获取某需求的依赖（upstream/downstream）"""
    upstream_stmt = select(RequirementDependency).where(
        RequirementDependency.to_id == requirement_id
    )
    downstream_stmt = select(RequirementDependency).where(
        RequirementDependency.from_id == requirement_id
    )

    if direction == "upstream":
        deps = (await session.execute(upstream_stmt)).scalars().all()
    elif direction == "downstream":
        deps = (await session.execute(downstream_stmt)).scalars().all()
    else:
        up = (await session.execute(upstream_stmt)).scalars().all()
        down = (await session.execute(downstream_stmt)).scalars().all()
        deps = list(up) + list(down)

    items = []
    for dep in deps:
        d = dep.model_dump(mode="json")
        if dep.from_id:
            from_req = await session.get(Requirement, dep.from_id)
            if from_req:
                d["from_code"] = from_req.code
                d["from_title"] = from_req.title
                d["from_status"] = from_req.status
        if dep.to_id:
            to_req = await session.get(Requirement, dep.to_id)
            if to_req:
                d["to_code"] = to_req.code
                d["to_title"] = to_req.title
                d["to_status"] = to_req.status
        items.append(d)

    return {"items": items}


@router.post("/api/dependencies")
async def add_dependency(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """添加依赖关系（含环检测）"""
    from_id = data.get("from_id")
    to_id = data.get("to_id")

    if not from_id or not to_id:
        raise HTTPException(status_code=400, detail="缺少 from_id 或 to_id")
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="不能自依赖")

    # 查重
    existing_stmt = select(RequirementDependency).where(
        RequirementDependency.from_id == from_id,
        RequirementDependency.to_id == to_id,
    )
    existing = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="依赖已存在")

    # 环检测
    cycle = await _detect_cycle(from_id, to_id, session)
    if cycle:
        raise HTTPException(
            status_code=400,
            detail=f"检测到环：{' → '.join(cycle)}",
        )

    dep = RequirementDependency(
        from_id=from_id,
        to_id=to_id,
        dep_type=data.get("dep_type", "FS"),
        lag_days=data.get("lag_days", 0),
        note=data.get("note"),
        created_by=data.get("created_by", "system"),
    )
    session.add(dep)
    await session.commit()
    await session.refresh(dep)
    return dep.model_dump(mode="json")


@router.delete("/api/dependencies/{dep_id}")
async def delete_dependency(
    dep_id: str,
    session: AsyncSession = Depends(get_session),
):
    dep = await session.get(RequirementDependency, dep_id)
    if not dep:
        raise HTTPException(status_code=404, detail="依赖不存在")
    await session.delete(dep)
    await session.commit()
    return {"ok": True}


@router.post("/api/gantt/propagate-delay")
async def propagate_delay(
    data: dict,
    session: AsyncSession = Depends(get_session),
):
    """延期传导计算（dry-run，不修改数据）"""
    req_id = data["requirement_id"]
    new_end_str = data["new_end_date"]
    new_end = date.fromisoformat(new_end_str) if isinstance(new_end_str, str) else new_end_str

    req = await session.get(Requirement, req_id)
    if not req or not req.planned_end:
        return {"affected": [], "total_affected": 0}

    delta = (new_end - req.planned_end).days
    if delta <= 0:
        return {"affected": [], "total_affected": 0}

    # BFS 传导
    affected = []
    pushed = {req_id: delta}
    queue = [(req_id, delta)]

    while queue:
        cur_id, push_days = queue.pop(0)

        stmt = select(RequirementDependency).where(
            RequirementDependency.from_id == cur_id
        )
        deps = (await session.execute(stmt)).scalars().all()

        for dep in deps:
            downstream = await session.get(Requirement, dep.to_id)
            if not downstream or not downstream.planned_end:
                continue

            existing = pushed.get(dep.to_id, 0)
            if push_days > existing:
                pushed[dep.to_id] = push_days
                new_down_end = downstream.planned_end + timedelta(days=push_days)
                affected.append({
                    "requirementId": dep.to_id,
                    "code": downstream.code,
                    "title": downstream.title,
                    "oldEnd": downstream.planned_end.isoformat(),
                    "newEnd": new_down_end.isoformat(),
                    "pushDays": push_days,
                })
                queue.append((dep.to_id, push_days))

    return {"affected": affected, "total_affected": len(affected)}


@router.get("/api/gantt/critical-path")
async def get_critical_path(
    session: AsyncSession = Depends(get_session),
):
    """关键路径计算（CPM）"""
    # 获取参与计算的需求
    stmt = select(Requirement).where(
        Requirement.planned_start.is_not(None),
        Requirement.planned_end.is_not(None),
        Requirement.status != "已搁置",
    )
    reqs = (await session.execute(stmt)).scalars().all()
    req_map = {r.id: r for r in reqs}

    if not reqs:
        return {"critical_ids": [], "items": []}

    dep_stmt = select(RequirementDependency)
    all_deps = (await session.execute(dep_stmt)).scalars().all()

    # 构建邻接表
    adj = {r.id: [] for r in reqs}
    rev = {r.id: [] for r in reqs}
    for d in all_deps:
        if d.from_id in adj and d.to_id in adj:
            adj[d.from_id].append({"to": d.to_id, "lag": d.lag_days or 0})
            rev[d.to_id].append({"from": d.from_id, "lag": d.lag_days or 0})

    # EF（最早完成时间）
    ef = {r.id: r.planned_end for r in reqs}
    project_end = max(ef.values())

    # LF（最晚完成时间）- 逆拓扑
    in_deg = {r.id: len(rev[r.id]) for r in reqs}
    order = []
    q = [rid for rid, d in in_deg.items() if d == 0]
    while q:
        rid = q.pop(0)
        order.append(rid)
        for e in adj.get(rid, []):
            in_deg[e["to"]] -= 1
            if in_deg[e["to"]] == 0:
                q.append(e["to"])

    lf = {}
    for rid in reversed(order):
        r = req_map[rid]
        downs = adj.get(rid, [])
        if not downs:
            lf[rid] = r.planned_end
        else:
            min_ls_ts = None
            for e in downs:
                down = req_map.get(e["to"])
                if not down:
                    continue
                down_lf = lf.get(e["to"], down.planned_end)
                duration = (down.planned_end - down.planned_start).days
                down_ls = down_lf - timedelta(days=duration)
                candidate = down_ls - timedelta(days=e["lag"])
                if min_ls_ts is None or candidate < min_ls_ts:
                    min_ls_ts = candidate
            lf[rid] = min(min_ls_ts, project_end) if min_ls_ts else r.planned_end

    # slack = LF - EF，slack <= 0.5 天即关键路径
    critical_ids = []
    for r in reqs:
        slack = (lf[r.id] - ef[r.id]).days
        if slack <= 0:
            critical_ids.append(r.id)

    # 按 planned_end 排序
    critical_items = sorted(
        [req_map[rid] for rid in critical_ids],
        key=lambda r: r.planned_end,
    )

    return {
        "critical_ids": critical_ids,
        "items": [
            {
                "id": r.id,
                "code": r.code,
                "title": r.title,
                "status": r.status,
                "planned_end": r.planned_end.isoformat() if r.planned_end else None,
            }
            for r in critical_items
        ],
    }


async def _detect_cycle(from_id: str, to_id: str, session: AsyncSession):
    """DFS 环检测：若加入 from_id -> to_id 后是否成环"""
    visited = set()
    stack = [to_id]
    path = []

    while stack:
        cur = stack.pop()
        if cur == from_id:
            path.append(cur)
            # 反查关联需求的 code
            codes = []
            for pid in path:
                req = await session.get(Requirement, pid)
                codes.append(req.code if req else pid[:8])
            return codes
        if cur in visited:
            continue
        visited.add(cur)
        path.append(cur)

        stmt = select(RequirementDependency).where(RequirementDependency.from_id == cur)
        deps = (await session.execute(stmt)).scalars().all()
        for d in deps:
            stack.append(d.to_id)

    return None
