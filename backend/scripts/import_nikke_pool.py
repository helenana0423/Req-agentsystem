"""
导入 NIKKE 总需求池.xlsx 到数据库
- 先级联删除所有 business_line='Nikke' 的旧需求
- 再写入 Excel 中的 36 条真实需求 + 对应进展说明 + 创建变更
用法：
    cd backend && python3 scripts/import_nikke_pool.py
"""
import asyncio
import json
import re
import sys
from datetime import date, datetime
from typing import Optional, List
from pathlib import Path

import pandas as pd
from sqlalchemy import select

# 让脚本能 import app.*
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core.database import async_session_maker, init_db  # noqa: E402
from app.models.models import (  # noqa: E402
    Requirement, RequirementChange, ProgressNote, Blocker,
    RequirementDependency,
)

EXCEL_PATH = "/Users/yixingo/Documents/nikke相关/双周报/NIKKE总需求池.xlsx"
BUSINESS_LINE = "Nikke"
DEFAULT_YEAR = 2026  # 表里日期没年份，按当前业务周期假定 2026


# ============ 字段映射 ============

# Excel 状态 → 系统枚举（5 种状态：待评审/已立项/开发中/测试中/已上线/已搁置）
STATUS_MAP = {
    "已交付": "已上线",
    "已排期": "已立项",
    "开发中": "开发中",
    "待排期": "待评审",
    "需求细化": "待评审",
    "已有功能支持": "已上线",
}

# 优先级 → 系统枚举（P0/P1/P2/P3）
PRIORITY_MAP = {"P0": "P0", "P1": "P1", "P2": "P2", "P3": "P3"}


def parse_cn_date(s):
    """解析 '1月13日' / '4月20日' → date(2026, 1, 13)"""
    if not s or not isinstance(s, str):
        return None
    m = re.search(r"(\d{1,2})月(\d{1,2})日?", s)
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    try:
        return date(DEFAULT_YEAR, month, day)
    except ValueError:
        return None


def calc_progress(status: str) -> int:
    """根据状态推算 progress%"""
    return {
        "已上线": 100,
        "测试中": 80,
        "开发中": 50,
        "已立项": 20,
        "待评审": 0,
        "已搁置": 0,
    }.get(status, 0)


def safe(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def build_title(req_name, desc) -> str:
    """需求名称 + 详细描述 → 标题（截断 60 字符）"""
    parts = [p for p in [req_name, desc] if p]
    if not parts:
        return "未命名需求"
    if len(parts) == 1:
        title = parts[0]
    else:
        # 名称 + 描述前 50 字
        desc_short = parts[1][:50] + ("…" if len(parts[1]) > 50 else "")
        title = f"{parts[0]} - {desc_short}"
    return title[:200]


def build_tags(req_type, category):
    tags = []
    for s in [req_type, category]:
        if not s:
            continue
        for t in re.split(r"[、,，/]", s):
            t = t.strip()
            if t and t not in tags:
                tags.append(t)
    return tags


async def main():
    df = pd.read_excel(EXCEL_PATH, sheet_name="总需求池", header=0)
    print(f"📖 读取 Excel：{len(df)} 行")

    await init_db()  # 确保表存在

    async with async_session_maker() as session:
        # ---------- 1. 清掉旧的 Nikke 需求（级联） ----------
        old = (await session.execute(
            select(Requirement).where(Requirement.business_line == BUSINESS_LINE)
        )).scalars().all()
        print(f"🗑  清理旧 Nikke 需求 {len(old)} 条")

        for req in old:
            for cls in [RequirementChange, ProgressNote, Blocker]:
                items = (await session.execute(
                    select(cls).where(cls.requirement_id == req.id)
                )).scalars().all()
                for it in items:
                    await session.delete(it)

            deps = (await session.execute(
                select(RequirementDependency).where(
                    (RequirementDependency.from_id == req.id)
                    | (RequirementDependency.to_id == req.id)
                )
            )).scalars().all()
            for d in deps:
                await session.delete(d)

            await session.delete(req)

        await session.commit()

        # ---------- 2. 导入新的 36 条 ----------
        imported = 0
        for idx, row in df.iterrows():
            seq = imported + 1
            code = f"NIKKE-{DEFAULT_YEAR}-{seq:04d}"

            req_name = safe(row.get("需求名称"))
            desc = safe(row.get("功能说明/详细描述"))
            category = safe(row.get("需求分类"))
            req_type = safe(row.get("需求类型"))
            requester = safe(row.get("需求人")) or "未指定"
            priority = PRIORITY_MAP.get(safe(row.get("优先级")), "P2")
            raw_status = safe(row.get("需求状态"))
            status = STATUS_MAP.get(raw_status, "待评审")
            owner = safe(row.get("负责人")) or "sophiaxwxu(许欣雯)"
            dev = safe(row.get("研发"))
            start = parse_cn_date(safe(row.get("开始时间")))
            end = parse_cn_date(safe(row.get("预计交付时间")))
            attach = safe(row.get("附件/补充文档"))
            note_remark = safe(row.get("备注"))
            progress_0327 = safe(row.get("【03.23-03.27】进展说明"))
            progress_0410 = safe(row.get("【04.06-04.10】进展说明"))
            source = safe(row.get("需求来源")) or "NIKKE AI专项汇总"

            tags = build_tags(req_type, category)
            title = build_title(req_name, desc)

            req = Requirement(
                code=code,
                title=title,
                business_line=BUSINESS_LINE,
                owner=owner,
                dev_owner=dev,
                status=status,
                priority=priority,
                description=desc,
                scope=req_name,  # 把"需求名称"放到 scope 当大类
                source=source,
                tags=json.dumps(tags, ensure_ascii=False) if tags else None,
                planned_start=start,
                planned_end=end,
                expected_release=end,
                progress=calc_progress(status),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            session.add(req)

            # 创建变更
            session.add(RequirementChange(
                requirement_id=req.id,
                change_type="create",
                reason=f"从 NIKKE 总需求池.xlsx 导入（需求人：{requester}）",
                source="import",
                source_ref="NIKKE总需求池.xlsx#总需求池",
                operator="import-script",
            ))

            # 创建说明 note
            init_note_lines = [f"📋 需求来源：{source}"]
            if requester: init_note_lines.append(f"👤 需求人：{requester}")
            if raw_status: init_note_lines.append(f"📌 原始状态：{raw_status}")
            if dev: init_note_lines.append(f"💻 研发：{dev}")
            if attach: init_note_lines.append(f"📎 附件：{attach}")
            if note_remark: init_note_lines.append(f"📝 备注：{note_remark}")

            session.add(ProgressNote(
                requirement_id=req.id,
                note_type="comment",
                content="\n".join(init_note_lines),
                author="import-script",
                source="import",
                created_at=datetime.now(),
            ))

            # 双周进展
            if progress_0327:
                session.add(ProgressNote(
                    requirement_id=req.id,
                    note_type="progress",
                    content=f"【03.23-03.27】{progress_0327}",
                    author=owner,
                    source="import",
                    created_at=datetime(2026, 3, 27, 18, 0),
                ))
            if progress_0410:
                session.add(ProgressNote(
                    requirement_id=req.id,
                    note_type="progress",
                    content=f"【04.06-04.10】{progress_0410}",
                    author=owner,
                    source="import",
                    created_at=datetime(2026, 4, 10, 18, 0),
                ))

            # 状态判断 blocker：进展里出现"待排期/pending"且状态非已上线
            blocker_text = []
            for txt in [progress_0327, progress_0410, note_remark]:
                if not txt: continue
                if "pending" in txt.lower() or "待排期" in txt or "待跟进" in txt:
                    blocker_text.append(txt[:200])
            if blocker_text and status not in ("已上线",) and raw_status == "待排期":
                session.add(Blocker(
                    requirement_id=req.id,
                    blocker_type="pending_decision",
                    description=f"待排期/待确认：{blocker_text[0]}",
                    blocking_team="待评审",
                    status="active",
                    created_at=datetime.now(),
                ))

            imported += 1
            print(f"  ✅ {code} | {priority} | {status:6} | {title[:40]}")

        await session.commit()
        print(f"\n🎉 导入完成：{imported} 条 NIKKE 需求")


if __name__ == "__main__":
    asyncio.run(main())
