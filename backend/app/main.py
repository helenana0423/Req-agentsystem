# ReqBoard - FastAPI 主入口
import traceback
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.database import init_db
from app.api.requirements import router as requirements_router
from app.api.progress import router as progress_router
from app.api.dependencies import router as dependencies_router
from app.api.agent import router as agent_router

settings = get_settings()

# 项目根目录（backend/ 的上一级），用于 serve 前端静态文件
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_INDEX = PROJECT_ROOT / "index.html"
FRONTEND_SRC = PROJECT_ROOT / "src"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # 首次启动自动 seed 12 条 mock 需求
    from app.core.database import async_session_maker
    from app.core.seed import seed_if_empty
    async with async_session_maker() as session:
        seeded = await seed_if_empty(session)
    if seeded:
        print("✅ 已完成首次 seed")

    print(f"🚀 {settings.app_name} v{settings.app_version} 启动成功")
    print(f"   数据库: {settings.database_url}")
    print(f"   LLM: {settings.llm_provider} / {settings.llm_model} " +
          ("(已配置 Key)" if settings.llm_api_key else "(未配置 Key → 前端使用本地规则引擎)"))
    print(f"   访问: http://localhost:8000")
    print(f"   API 文档: http://localhost:8000/docs")
    yield
    print(f"👋 {settings.app_name} 已关闭")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ============================================================
# API 路由（先注册，优先级最高）
# ============================================================
app.include_router(requirements_router)
app.include_router(progress_router)
app.include_router(dependencies_router)
app.include_router(agent_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": settings.app_version,
        "llm_enabled": bool(settings.llm_api_key),
    }


@app.get("/api/config")
async def get_config():
    return {
        "business_lines": settings.business_lines,
        "priorities": settings.priorities,
        "statuses": settings.statuses,
        "progress_mode": settings.progress_mode,
        "llm_enabled": bool(settings.llm_api_key),
        "llm_provider": settings.llm_provider if settings.llm_api_key else None,
    }


# ============================================================
# 前端静态文件托管（API 之后注册，兜底匹配）
# 开发期禁用缓存，避免浏览器用旧 JS 出奇怪 bug
# ============================================================
NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

# 1. /src/* 走 StaticFiles（处理 ES Modules 相对路径）
if FRONTEND_SRC.exists():
    app.mount("/src", StaticFiles(directory=str(FRONTEND_SRC)), name="src")


# 2. 根路由返回 index.html
@app.get("/")
async def serve_index():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX, headers=NO_CACHE_HEADERS)
    return JSONResponse(
        status_code=404,
        content={"detail": "前端入口 index.html 未找到，请确认项目根目录有 index.html"},
    )


# 3. 其他静态资源兜底（favicon / 图片等）
@app.get("/{path:path}")
async def serve_static_fallback(path: str):
    # API 请求已被上面的路由拦截，到这里都是前端资源
    target = PROJECT_ROOT / path
    if target.exists() and target.is_file():
        return FileResponse(target, headers=NO_CACHE_HEADERS)
    # 兜底回 index.html（MVP 是单页应用）
    return FileResponse(FRONTEND_INDEX, headers=NO_CACHE_HEADERS)


# 4. 给 /src/ 下的模块也加上 no-cache 中间件（StaticFiles 默认会缓存）
@app.middleware("http")
async def add_no_cache_for_src(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/src/") or request.url.path.endswith((".js", ".html", ".css")):
        for k, v in NO_CACHE_HEADERS.items():
            response.headers[k] = v
    return response
