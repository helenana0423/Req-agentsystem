# ReqBoard - 数据库
from sqlmodel import SQLModel
from app.core.config import get_settings


def get_engine():
    from sqlalchemy.ext.asyncio import create_async_engine
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    return engine


async def init_db():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    from sqlmodel.ext.asyncio.session import AsyncSession as SQLModelAsyncSession
    engine = get_engine()
    async with SQLModelAsyncSession(engine) as session:
        yield session


def async_session_maker():
    """返回一个 async context manager，用于非 FastAPI 依赖注入场景（如启动 seed）"""
    from sqlmodel.ext.asyncio.session import AsyncSession as SQLModelAsyncSession
    engine = get_engine()
    return SQLModelAsyncSession(engine)
