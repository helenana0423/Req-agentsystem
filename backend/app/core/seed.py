# ReqBoard - 首次启动种子数据
# 当数据库为空时，自动写入 12 条 mock 需求（与 src/data/mockData.js 对齐）
import json
from datetime import datetime, timedelta, date as date_cls
from sqlmodel import select
from app.models.models import (
    Requirement, RequirementChange, ProgressNote, Blocker, RequirementDependency,
)

# 基准日期（与前端 mockData 一致，2026-04-23）
TODAY = datetime(2026, 4, 23)


def d(offset: int) -> date_cls:
    """返回 date 对象（用于 planned_start/planned_end 等 date 字段）"""
    return (TODAY + timedelta(days=offset)).date()


def t(offset: int, h: int = 10) -> datetime:
    return (TODAY + timedelta(days=offset)).replace(hour=h, minute=0, second=0, microsecond=0)


def _tags(arr: list) -> str:
    return json.dumps(arr, ensure_ascii=False)


REQUIREMENTS_SEED = [
    dict(id="req-001", code="REQ-2026-0042", title="PUBG Mobile - 海外合规改造（跨境数据传输）",
         business_line="PUBG Mobile", owner="Helena", dev_owner="李明",
         status="开发中", priority="P0",
         description="根据欧盟GDPR与东南亚多国数据合规新规，对玩家行为数据采集与传输链路进行全面改造。\n\n核心改动：\n- 玩家数据传输前做本地脱敏\n- 跨境传输链路加密升级\n- 合规审计日志接入",
         scope="范围：玩家行为采集SDK、网关层脱敏、审计日志落盘。\n已确认排除：海外白名单功能（见 2026-04-20 决议）",
         source="2026-04-08 周会", tags=_tags(["合规", "海外", "GDPR"]),
         planned_start=d(-18), planned_end=d(7), expected_release=d(7), actual_start=d(-15),
         progress=60, estimated_days=18, created_at=t(-22), updated_at=t(-1)),
    dict(id="req-002", code="REQ-2026-0043", title="PUBG Mobile - 推送服务海外节点接入",
         business_line="PUBG Mobile", owner="Helena", dev_owner="赵磊",
         status="待评审", priority="P1",
         description="依赖 REQ-0042 的脱敏改造完成后，推送服务对接新加坡/法兰克福CDN节点。",
         scope="范围：新加坡、法兰克福节点；IM 放 v1.1。",
         source="2026-04-15 需求评审", tags=_tags(["海外", "性能"]),
         planned_start=d(3), planned_end=d(21), expected_release=d(21),
         progress=0, estimated_days=12, created_at=t(-8), updated_at=t(-3)),
    dict(id="req-003", code="REQ-2026-0044", title="Honor of Kings - 运营后台批量活动配置",
         business_line="Honor of Kings", owner="陈思远", dev_owner="孙浩",
         status="测试中", priority="P1",
         description="王者荣耀版本/节日活动需要批量配置多区服活动模板。",
         scope="范围：活动模板CRUD、多区服批量复制、审计日志。",
         source="2026-04-02 Kickoff", tags=_tags(["工具", "运营", "效率"]),
         planned_start=d(-25), planned_end=d(2), expected_release=d(2), actual_start=d(-24),
         progress=80, estimated_days=20, created_at=t(-30), updated_at=t(-2)),
    dict(id="req-004", code="REQ-2026-0045", title="PUBG Mobile - 夏日节活动投放联调",
         business_line="PUBG Mobile", owner="Helena", dev_owner="周杰",
         status="待评审", priority="P1",
         description="依赖 REQ-0044 + REQ-0043，完成 PUBG Mobile 首次东南亚夏日节活动投放联调。",
         scope="范围：活动投放全链路验证，不含礼包埋点优化。",
         source="2026-04-18 业务同步会", tags=_tags(["海外", "活动", "联调"]),
         planned_start=d(22), planned_end=d(35), expected_release=d(35),
         progress=0, estimated_days=10, created_at=t(-5), updated_at=t(-5)),
    dict(id="req-005", code="REQ-2026-0046", title="彩虹六号 - 赛季排位系统改版",
         business_line="彩虹六号", owner="陈思远", dev_owner="吴芳",
         status="已上线", priority="P2",
         description="新赛季排位系统升级：段位分层细化、匹配算法优化、段位保护机制引入。",
         scope="范围：排位一期（段位 + 匹配），赛季限定外观放 v1.1。",
         source="2026-03-12 赛季规划", tags=_tags(["赛季", "PVP"]),
         planned_start=d(-40), planned_end=d(-6), actual_start=d(-38), actual_release=d(-5),
         progress=100, estimated_days=25, created_at=t(-45), updated_at=t(-5)),
    dict(id="req-006", code="REQ-2026-0047", title="Honor of Kings - 未成年人防沉迷升级",
         business_line="Honor of Kings", owner="张涵", dev_owner="郑鹏",
         status="开发中", priority="P0",
         description="对接公安部新版实名认证接口，覆盖未成年人防沉迷升级规则。",
         scope="范围：认证服务、客户端实名弹窗、防沉迷规则引擎。",
         source="2026-04-05 合规通知", tags=_tags(["合规", "实名", "防沉迷"]),
         planned_start=d(-14), planned_end=d(12), actual_start=d(-13),
         progress=55, estimated_days=22, created_at=t(-20), updated_at=t(0)),
    # Nikke 业务线的需求由 backend/scripts/import_nikke_pool.py 从真实 Excel 导入，
    # seed 不再写入假 Nikke 数据，避免清库重启后覆盖真实数据。
    dict(id="req-008", code="REQ-2026-0049", title="Honor of Kings - 充值异常补单优化",
         business_line="Honor of Kings", owner="张涵", dev_owner="林芸",
         status="开发中", priority="P1",
         description="充值回调失败场景下，补单服务与对账机制优化，降低客诉率。",
         scope="范围：补单服务、每日对账任务、客服查询面板。",
         source="2026-04-01 充值事故复盘", tags=_tags(["支付", "客诉"]),
         planned_start=d(-10), planned_end=d(10), actual_start=d(-10),
         progress=45, estimated_days=15, created_at=t(-14), updated_at=t(-1)),
    dict(id="req-010", code="REQ-2026-0051", title="GunStar - 全球本地化翻译管理平台",
         business_line="GunStar", owner="Helena", dev_owner="李明",
         status="待评审", priority="P2",
         description="GunStar 12 语种文本统一管理，支持翻译工单、审阅、发布流程。",
         scope="范围：翻译后台一期，AI 辅助翻译放 v1.2。",
         source="2026-04-20 海外线周会", tags=_tags(["海外", "本地化", "L10N"]),
         planned_start=d(15), planned_end=d(45), expected_release=d(45),
         progress=0, estimated_days=22, created_at=t(-3), updated_at=t(-3)),
    dict(id="req-011", code="REQ-2026-0052", title="GunStar - AI NPC 多轮对话优化",
         business_line="GunStar", owner="陈思远", dev_owner="周杰",
         status="已搁置", priority="P3",
         description="GunStar 剧情 NPC 多轮对话丢失上下文，引入会话记忆机制。",
         scope="原计划：会话记忆 + 意图纠偏。因 LLM 成本冲突搁置至 Q3。",
         source="2026-03-28 玩家反馈", tags=_tags(["AI", "NPC"]),
         planned_start=d(20), planned_end=d(50),
         progress=5, estimated_days=18, created_at=t(-26), updated_at=t(-10)),
    dict(id="req-012", code="REQ-2026-0053", title="彩虹六号 - P0 Bug 预警推送",
         business_line="彩虹六号", owner="陈思远", dev_owner="孙浩",
         status="测试中", priority="P1",
         description="彩虹六号 P0 Bug 第一时间推送给制作人与 QA。",
         scope="推送通道：企微机器人 + 邮件。",
         source="2026-03-25 管理例会", tags=_tags(["数据", "告警"]),
         planned_start=d(-20), planned_end=d(1), actual_start=d(-18),
         progress=85, estimated_days=12, created_at=t(-25), updated_at=t(0)),
]

DEPENDENCIES_SEED = [
    dict(id="dep-001", from_id="req-001", to_id="req-002", dep_type="FS", lag_days=0,
         note="推送服务依赖脱敏SDK就绪", created_by="Helena", created_at=t(-8)),
    dict(id="dep-002", from_id="req-003", to_id="req-004", dep_type="FS", lag_days=2,
         note="活动配置完成后再联调", created_by="Helena", created_at=t(-5)),
    dict(id="dep-003", from_id="req-002", to_id="req-004", dep_type="FS", lag_days=0,
         note="海外推送就绪后再投放", created_by="Helena", created_at=t(-5)),
    # dep-004 已移除（依赖被删除的 Nikke seed 数据 req-007/req-009）
]
]

BLOCKERS_SEED = [
    dict(id="blk-001", requirement_id="req-001", blocker_type="external_dep",
         description="法务对跨境数据传输的合规边界仍在确认，等法务确认后再定最终方案",
         blocking_person="法务·张三", blocking_team="法务合规部",
         expected_resolve_date=d(2), status="active", created_at=t(-2)),
    dict(id="blk-002", requirement_id="req-002", blocker_type="upstream_req",
         description="前置需求 REQ-2026-0042 未完成",
         linked_requirement_id="req-001", expected_resolve_date=d(7),
         status="active", created_at=t(-1)),
    dict(id="blk-003", requirement_id="req-008", blocker_type="technical",
         description="支付网关灰度环境稳定性问题，已反馈 SRE 团队排查",
         blocking_person="基础架构·李四", blocking_team="SRE",
         status="active", created_at=t(-4)),
]

PROGRESS_NOTES_SEED = [
    dict(id="pn-001", requirement_id="req-001", note_type="milestone",
         content="脱敏SDK 接口联调完成，进入灰度", author="李明", source="manual", created_at=t(-1, 14)),
    dict(id="pn-002", requirement_id="req-001", note_type="blocker",
         content="卡在法务跨境合规确认，张三在看", author="Helena", source="agent_extract",
         source_ref="2026-04-22 周会纪要：REQ-42 卡在法务...", created_at=t(-2, 10)),
    dict(id="pn-003", requirement_id="req-001", note_type="decision",
         content="评审结论：本期去掉海外白名单功能，移到 v1.1", author="Helena",
         source="agent_extract", source_ref="2026-04-20 会议纪要", created_at=t(-3, 15)),
    dict(id="pn-004", requirement_id="req-001", note_type="progress",
         content="前端 UI 完成 80%，剩余审计日志展示页", author="李明", source="manual", created_at=t(-5, 18)),
    dict(id="pn-005", requirement_id="req-001", note_type="risk",
         content="若法务确认延迟 > 5 天，下游 REQ-43/45 会被推迟", author="Helena",
         source="manual", created_at=t(-2, 16)),
    dict(id="pn-006", requirement_id="req-003", note_type="milestone",
         content="功能自测完成，进入测试阶段", author="孙浩", source="manual", created_at=t(-4, 11)),
    dict(id="pn-007", requirement_id="req-006", note_type="progress",
         content="认证服务上线预发，今日开始客户端联调", author="郑鹏", source="manual", created_at=t(0, 10)),
    dict(id="pn-008", requirement_id="req-008", note_type="blocker",
         content="支付网关灰度不稳定，等 SRE 排查", author="林芸", source="manual", created_at=t(-4, 14)),
    dict(id="pn-009", requirement_id="req-012", note_type="milestone",
         content="测试回归第二轮通过", author="孙浩", source="manual", created_at=t(0, 11)),
    dict(id="pn-010", requirement_id="req-005", note_type="milestone",
         content="新赛季上线至生产，观察一周稳定", author="吴芳", source="manual", created_at=t(-5, 10)),
]

CHANGES_SEED = [
    dict(id="chg-001", requirement_id="req-001", change_type="create",
         reason="初始创建", source="manual", operator="Helena", created_at=t(-22)),
    dict(id="chg-002", requirement_id="req-001", change_type="status_change",
         field="status", old_value="已立项", new_value="开发中",
         reason="Kickoff 后进入开发", source="manual", operator="李明", created_at=t(-15)),
    dict(id="chg-003", requirement_id="req-001", change_type="scope_adjust",
         field="scope", old_value="含海外白名单功能", new_value="去掉海外白名单功能",
         reason="2026-04-20 会议决议", source="agent_extract",
         source_ref="2026-04-20 会议纪要片段：... 决议本期去掉海外白名单功能，移到 v1.1 ...",
         operator="Helena", created_at=t(-3)),
    dict(id="chg-004", requirement_id="req-001", change_type="update",
         field="progress", old_value="40", new_value="60",
         reason="本周推进情况", source="manual", operator="李明", created_at=t(-1)),
    dict(id="chg-005", requirement_id="req-003", change_type="status_change",
         field="status", old_value="开发中", new_value="测试中",
         reason="开发自测完成", source="manual", operator="孙浩", created_at=t(-4)),
    dict(id="chg-006", requirement_id="req-005", change_type="status_change",
         field="status", old_value="测试中", new_value="已上线",
         reason="灰度通过，全量上线", source="manual", operator="吴芳", created_at=t(-5)),
    dict(id="chg-007", requirement_id="req-011", change_type="status_change",
         field="status", old_value="已立项", new_value="已搁置",
         reason="Q2 LLM 成本冲突，挪至 Q3", source="manual", operator="陈思远", created_at=t(-10)),
]


async def seed_if_empty(session) -> bool:
    """如果数据库为空，写入 seed 数据；否则什么也不做。返回是否执行了 seed。"""
    result = await session.execute(select(Requirement).limit(1))
    if result.first():
        return False  # 库非空，不 seed

    print("  → 数据库为空，写入 seed 数据（12 条需求 + 4 条依赖 + 3 个阻塞 + 10 条进展 + 7 条变更）")

    for r in REQUIREMENTS_SEED:
        session.add(Requirement(**r))
    for d_ in DEPENDENCIES_SEED:
        session.add(RequirementDependency(**d_))
    for b in BLOCKERS_SEED:
        session.add(Blocker(**b))
    for p in PROGRESS_NOTES_SEED:
        session.add(ProgressNote(**p))
    for c in CHANGES_SEED:
        session.add(RequirementChange(**c))

    await session.commit()
    return True
