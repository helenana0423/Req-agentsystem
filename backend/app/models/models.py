# ReqBoard - 数据模型（6 张表）
import uuid
from datetime import datetime, date
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, Text
from typing import Optional, List


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Requirement(SQLModel, table=True):
    __tablename__ = "requirement"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    code: str = Field(unique=True, index=True)
    title: str = Field(max_length=200)
    business_line: str = Field(max_length=50)
    owner: str = Field(max_length=50)
    dev_owner: Optional[str] = Field(default=None, max_length=50)
    status: str = Field(default="待评审", max_length=20)
    priority: str = Field(default="P2", max_length=10)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    scope: Optional[str] = Field(default=None, sa_column=Column(Text))
    source: Optional[str] = Field(default=None, max_length=200)
    tags: Optional[str] = Field(default=None)  # JSON array string

    planned_start: Optional[date] = Field(default=None)
    planned_end: Optional[date] = Field(default=None)
    expected_release: Optional[date] = Field(default=None)
    actual_start: Optional[date] = Field(default=None)
    actual_release: Optional[date] = Field(default=None)
    progress: Optional[int] = Field(default=0, ge=0, le=100)
    estimated_days: Optional[float] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    tapd_story_id: Optional[str] = Field(default=None, max_length=50)

    changes: List["RequirementChange"] = Relationship(back_populates="requirement")
    progress_notes: List["ProgressNote"] = Relationship(back_populates="requirement")
    blockers: List["Blocker"] = Relationship(
        back_populates="requirement",
        sa_relationship_kwargs={"foreign_keys": "[Blocker.requirement_id]"},
    )
    dependencies_from: List["RequirementDependency"] = Relationship(
        back_populates="from_req",
        sa_relationship_kwargs={"foreign_keys": "[RequirementDependency.from_id]"},
    )
    dependencies_to: List["RequirementDependency"] = Relationship(
        back_populates="to_req",
        sa_relationship_kwargs={"foreign_keys": "[RequirementDependency.to_id]"},
    )


class RequirementChange(SQLModel, table=True):
    __tablename__ = "requirement_change"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    requirement_id: str = Field(foreign_key="requirement.id", index=True)
    change_type: str = Field(max_length=20)  # create/update/status_change/scope_adjust/comment
    field: Optional[str] = Field(default=None, max_length=50)
    old_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    new_value: Optional[str] = Field(default=None, sa_column=Column(Text))
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    source: str = Field(default="manual", max_length=20)  # manual/agent_extract/import/tapd_sync
    source_ref: Optional[str] = Field(default=None, sa_column=Column(Text))
    operator: Optional[str] = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=datetime.now)

    requirement: Optional[Requirement] = Relationship(back_populates="changes")


class ProgressNote(SQLModel, table=True):
    __tablename__ = "progress_note"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    requirement_id: str = Field(foreign_key="requirement.id", index=True)
    note_type: str = Field(max_length=20)
    # milestone/progress/blocker/unblock/decision/risk/comment
    content: str = Field(sa_column=Column(Text))
    author: Optional[str] = Field(default=None, max_length=50)
    source: str = Field(default="manual", max_length=20)
    source_ref: Optional[str] = Field(default=None, sa_column=Column(Text))
    linked_requirement_ids: Optional[str] = Field(default=None)  # JSON array
    linked_users: Optional[str] = Field(default=None)  # JSON array
    created_at: datetime = Field(default_factory=datetime.now)

    requirement: Optional[Requirement] = Relationship(back_populates="progress_notes")


class Blocker(SQLModel, table=True):
    __tablename__ = "blocker"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    requirement_id: str = Field(foreign_key="requirement.id", index=True)
    blocker_type: str = Field(max_length=20)
    # external_dep/technical/cross_team/pending_decision/upstream_req/other
    description: str = Field(sa_column=Column(Text))
    blocking_person: Optional[str] = Field(default=None, max_length=100)
    blocking_team: Optional[str] = Field(default=None, max_length=100)
    linked_requirement_id: Optional[str] = Field(default=None, foreign_key="requirement.id")
    expected_resolve_date: Optional[date] = Field(default=None)
    status: str = Field(default="active", max_length=20)
    created_at: datetime = Field(default_factory=datetime.now)
    resolved_at: Optional[datetime] = Field(default=None)
    resolved_note: Optional[str] = Field(default=None, sa_column=Column(Text))

    requirement: Optional[Requirement] = Relationship(
        back_populates="blockers",
        sa_relationship_kwargs={"foreign_keys": "[Blocker.requirement_id]"},
    )


class RequirementDependency(SQLModel, table=True):
    __tablename__ = "requirement_dependency"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    from_id: str = Field(foreign_key="requirement.id", index=True)
    to_id: str = Field(foreign_key="requirement.id", index=True)
    dep_type: str = Field(default="FS", max_length=5)  # FS/SS/FF/SF
    lag_days: int = Field(default=0)
    note: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by: Optional[str] = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=datetime.now)

    from_req: Optional[Requirement] = Relationship(
        back_populates="dependencies_from",
        sa_relationship_kwargs={"foreign_keys": "[RequirementDependency.from_id]"},
    )
    to_req: Optional[Requirement] = Relationship(
        back_populates="dependencies_to",
        sa_relationship_kwargs={"foreign_keys": "[RequirementDependency.to_id]"},
    )


class Attachment(SQLModel, table=True):
    __tablename__ = "attachment"

    id: str = Field(default_factory=generate_uuid, primary_key=True)
    requirement_id: str = Field(foreign_key="requirement.id", index=True)
    filename: str = Field(max_length=255)
    filepath: str = Field(max_length=500)
    uploaded_by: Optional[str] = Field(default=None, max_length=50)
    uploaded_at: datetime = Field(default_factory=datetime.now)
