-- CreateEnum
CREATE TYPE "StreamRunKind" AS ENUM ('chat', 'tasklist_agent', 'delivery_chain');

-- CreateEnum
CREATE TYPE "StreamRunStatus" AS ENUM ('running', 'paused', 'completed', 'failed', 'cancelled', 'rejected', 'version_mismatch');

-- CreateEnum
CREATE TYPE "StreamEventKind" AS ENUM ('chunk', 'lifecycle', 'terminal');

-- CreateTable
CREATE TABLE "stream_runs" (
    "id" UUID NOT NULL,
    "kind" "StreamRunKind" NOT NULL,
    "owner_session_hash" VARCHAR(64) NOT NULL,
    "agent_run_id" UUID,
    "status" "StreamRunStatus" NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "terminal_sequence" INTEGER,
    "retention_until" TIMESTAMPTZ(6) NOT NULL,
    "execution_owner_id" VARCHAR(128),
    "cancel_requested_at" TIMESTAMPTZ(6),
    "max_retained_events" INTEGER NOT NULL DEFAULT 20000,
    "max_event_payload_bytes" INTEGER NOT NULL DEFAULT 262144,
    "failure_code" VARCHAR(128),
    "public_failure_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "stream_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stream_runs_sequence_bounds_check" CHECK ("last_sequence" >= 0 AND ("terminal_sequence" IS NULL OR "terminal_sequence" >= 1)),
    CONSTRAINT "stream_runs_event_bounds_check" CHECK ("max_retained_events" > 0 AND "max_event_payload_bytes" > 0)
);

-- CreateTable
CREATE TABLE "stream_requests" (
    "id" UUID NOT NULL,
    "owner_session_hash" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_fingerprint" VARCHAR(128) NOT NULL,
    "run_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stream_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_events" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_kind" "StreamEventKind" NOT NULL,
    "protocol_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_byte_length" INTEGER NOT NULL,
    "run_status" "StreamRunStatus",
    "terminal_state" "StreamRunStatus",
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stream_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stream_events_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "stream_events_payload_boundary_check" CHECK ("payload_byte_length" >= 0),
    CONSTRAINT "stream_events_terminal_consistency_check" CHECK (
        ("terminal" = true AND "terminal_state" IS NOT NULL)
        OR ("terminal" = false AND "terminal_state" IS NULL)
    ),
    CONSTRAINT "stream_events_terminal_state_check" CHECK (
        "terminal_state" IS NULL
        OR "terminal_state"::text IN ('completed', 'failed', 'cancelled', 'rejected', 'version_mismatch')
    )
);

-- CreateIndex
CREATE INDEX "stream_runs_owner_session_hash_idx" ON "stream_runs"("owner_session_hash");

-- CreateIndex
CREATE INDEX "stream_runs_kind_status_idx" ON "stream_runs"("kind", "status");

-- CreateIndex
CREATE INDEX "stream_runs_status_retention_until_idx" ON "stream_runs"("status", "retention_until");

-- CreateIndex
CREATE INDEX "stream_runs_retention_until_idx" ON "stream_runs"("retention_until");

-- CreateIndex
CREATE INDEX "stream_runs_agent_run_id_idx" ON "stream_runs"("agent_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "stream_requests_run_id_key" ON "stream_requests"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "stream_requests_owner_session_hash_idempotency_key_key" ON "stream_requests"("owner_session_hash", "idempotency_key");

-- CreateIndex
CREATE INDEX "stream_requests_owner_session_hash_expires_at_idx" ON "stream_requests"("owner_session_hash", "expires_at");

-- CreateIndex
CREATE INDEX "stream_requests_expires_at_idx" ON "stream_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stream_events_run_id_sequence_key" ON "stream_events"("run_id", "sequence");

-- CreateIndex
CREATE INDEX "stream_events_run_id_sequence_idx" ON "stream_events"("run_id", "sequence");

-- CreateIndex
CREATE INDEX "stream_events_run_id_terminal_idx" ON "stream_events"("run_id", "terminal");

-- CreateIndex
CREATE INDEX "stream_events_expires_at_idx" ON "stream_events"("expires_at");

-- AddForeignKey
ALTER TABLE "stream_requests" ADD CONSTRAINT "stream_requests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stream_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_events" ADD CONSTRAINT "stream_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "stream_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
