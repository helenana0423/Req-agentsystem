# ReqBoard - 核心配置
import os
from pathlib import Path
from typing import Optional, List
from pydantic_settings import BaseSettings
from functools import lru_cache

# 项目根目录（backend/app/core/config.py -> backend/app -> backend -> 项目根）
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
BACKUP_DIR = DATA_DIR / "backups"

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)
BACKUP_DIR.mkdir(exist_ok=True)


class Settings(BaseSettings):
    """应用配置，优先从项目根 .env 读取"""

    app_name: str = "ReqBoard"
    app_version: str = "0.1.0"
    debug: bool = True

    database_url: str = f"sqlite+aiosqlite:///{DATA_DIR / 'reqboard.db'}"

    # LLM 配置
    # llm_provider 支持: openai / deepseek / moonshot / anthropic
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str = ""
    llm_base_url: Optional[str] = None
    llm_extract_model: Optional[str] = None
    llm_embed_model: str = "text-embedding-3-small"

    # 业务配置
    business_lines: List[str] = [
        "PUBG Mobile",
        "Honor of Kings",
        "彩虹六号",
        "Nikke",
        "GunStar",
    ]
    priorities: List[str] = ["P0", "P1", "P2", "P3"]
    statuses: List[str] = [
        "待评审", "已立项", "开发中", "测试中", "已上线", "已搁置"
    ]
    progress_mode: str = "manual"
    blocker_auto_gantt_push: bool = False
    dep_auto_blocker: bool = False

    class Config:
        # .env 放在项目根（需求管理看板/.env）
        env_file = PROJECT_ROOT / ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
