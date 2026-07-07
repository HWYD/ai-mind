# Contract: Setup And Runtime Config

## Runtime Config

### Environment Variable

```text
AI_MIND_USER_MEMORY_STORE=memory|postgres
```

Defaults:

```text
NODE_ENV=production -> postgres
otherwise           -> memory
```

Invalid values:

- implementation should choose a deterministic safe fallback and log a safe runtime warning, or fail fast during explicit setup.
- user-facing chat must still degrade safely if Store cannot be used.

### Database URL

```text
DATABASE_URL=<postgres connection string>
```

Required when:

- `AI_MIND_USER_MEMORY_STORE=postgres`
- running `db:user-memory:setup`

## Setup Script

### Webapp script

```text
pnpm --dir apps/webapp db:user-memory:setup
```

Expected behavior:

- loads setup env with the same pattern as existing LangGraph setup scripts.
- constructs `PostgresStore.fromConnString(DATABASE_URL, { schema: 'langgraph_user_memory' })`.
- calls `store.setup()`.
- calls `store.stop()` in `finally`.
- prints a safe success message.
- does not print raw DATABASE_URL.

### Root script

```text
pnpm db:user-memory:setup
```

Expected behavior:

- delegates to webapp script.
- is included in runtime setup guidance with checkpoint setup.

## Deployment Rule

Production deployment that enables UserMemory must run:

```text
pnpm db:user-memory:setup
```

This is separate from:

```text
pnpm db:checkpoint:setup
pnpm db:chat-memory:setup
pnpm db:migrate:deploy
```

## Failure Degradation

If setup has not been run and runtime store read/write fails:

- ordinary chat continues.
- retrieval returns 0 UserMemory entries.
- writes are skipped.
- no raw database/store/checkpoint error is exposed to users.
- safe runtime logs may include event name and sanitized error name only.

## Non-Goals

- Prisma migration for LangGraph Store tables.
- pgvector extension setup.
- embedding index setup.
- account-level memory migration.
