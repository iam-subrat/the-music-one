# Store (Unit of Work) Design

**Date:** 2026-05-23  
**Status:** Approved

## Goal

Replace per-service manual repo wiring in `dependencies.py` with a single `Store` object that owns all repos, shares one `AsyncSession`, and exposes explicit `commit`/`rollback`.

## Architecture

### New file: `app/store.py`

```python
class Store:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.profiles = ProfileRepository(db)
        self.sessions = SessionRepository(db)
        self.queue = QueueRepository(db)
        self.skip_votes = SkipVoteRepository(db)

    async def commit(self) -> None: await self.db.commit()
    async def rollback(self) -> None: await self.db.rollback()
```

All four repos share one `AsyncSession` — same transaction boundary, no accidental two-session bugs.

## Service Changes

| Service | Before | After |
|---|---|---|
| `ProfileService` | `__init__(repo: ProfileRepository)` | `__init__(store: Store)` → `store.profiles` |
| `SessionService` | `__init__(session_repo, profile_repo)` | `__init__(store: Store)` → `store.sessions`; drop unused `profile_repo` |
| `QueueService` | `__init__(queue_repo, skip_vote_repo, song_svc)` | `__init__(store: Store, song_svc: SongService)` → `store.queue`, `store.skip_votes` |

`AuthService`, `PlaylistService`, `SongService` — no DB dependency, unchanged.

### Raw SQL in SessionService → move to SessionRepository

`set_repeat_mode` and `pass_dj` in `SessionService` currently call `self.repo.db.execute(...)` directly. These move to `SessionRepository` as named methods:

- `SessionRepository.set_repeat_mode(session_id, mode, user_id)`
- `SessionRepository.pass_dj(session_id, new_dj_id, user_id)`

`SessionService` calls `await self.store.sessions.set_repeat_mode(...)` — no raw session access needed.

## Dependency Wiring

```python
# app/dependencies.py

def get_store(db: AsyncSession = Depends(get_db)) -> Store:
    from app.store import Store
    return Store(db)

def get_profile_service(store: Store = Depends(get_store)) -> ProfileService:
    from app.services.profile_service import ProfileService
    return ProfileService(store)

def get_session_service(store: Store = Depends(get_store)) -> SessionService:
    from app.services.session_service import SessionService
    return SessionService(store)

def get_queue_service(store: Store = Depends(get_store)) -> QueueService:
    from app.services.queue_service import QueueService
    from app.services.song_service import SongService
    return QueueService(store, SongService())
```

Remove all individual `get_*_repo` functions — they are no longer needed.

## Test Changes

`test_queue_service.py::_make_svc` passes 3 args today. After change:

```python
def _make_svc(queue_repo=None, vote_repo=None, song_svc=None):
    store = MagicMock()
    store.queue = queue_repo or AsyncMock()
    store.skip_votes = vote_repo or AsyncMock()
    return QueueService(store, song_svc or AsyncMock())
```

All other tests (`test_profiles.py`, `test_sessions.py`) test repos directly — unaffected.

## Files Changed

| File | Action |
|---|---|
| `app/store.py` | **Create** |
| `app/dependencies.py` | Modify — add `get_store`, simplify service factories, remove repo factories |
| `app/services/profile_service.py` | Modify — accept `Store` |
| `app/services/session_service.py` | Modify — accept `Store`, remove raw DB access |
| `app/services/queue_service.py` | Modify — accept `Store` |
| `app/repositories/session_repo.py` | Modify — add `set_repeat_mode`, `pass_dj` methods |
| `tests/test_queue_service.py` | Modify — update `_make_svc` helper |

## What Does Not Change

- `app/database.py` — engine/session factory unchanged
- All routers — consume same `get_*_service` dependency names
- All other repos — interface unchanged
- `AbstractRepository` base — unchanged
