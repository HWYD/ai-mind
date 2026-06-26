-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('running', 'paused', 'resuming', 'completed', 'rejected', 'failed', 'cancelled', 'version_mismatch');

-- CreateEnum
CREATE TYPE "AgentRunResultStatus" AS ENUM ('final', 'final_with_manual_review_items', 'blocked', 'rejected');

-- CreateEnum
CREATE TYPE "AgentInterruptStatus" AS ENUM ('pending', 'decided', 'rejected', 'invalidated');

-- CreateEnum
CREATE TYPE "AgentInterruptKind" AS ENUM ('strategy_review', 'tasklist_revision_review');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "assistant_message_id" TEXT NOT NULL,
    "owner_session_hash" VARCHAR(64) NOT NULL,
    "agent_type" TEXT NOT NULL,
    "agent_version" TEXT NOT NULL,
    "graph_version" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL,
    "result_status" "AgentRunResultStatus",
    "user_goal_summary" VARCHAR(500) NOT NULL,
    "version_plan_uri" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "reasoning_enabled" BOOLEAN NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ(6),
    "resumed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "failure_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_interrupts" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "thread_id" TEXT NOT NULL,
    "langgraph_interrupt_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "node_name" TEXT NOT NULL,
    "interrupt_kind" "AgentInterruptKind" NOT NULL,
    "status" "AgentInterruptStatus" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "allowed_decisions_json" JSONB NOT NULL,
    "decision_json" JSONB,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_interrupts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_thread_id_key" ON "agent_runs"("thread_id");

-- CreateIndex
CREATE INDEX "agent_runs_conversation_id_idx" ON "agent_runs"("conversation_id");

-- CreateIndex
CREATE INDEX "agent_runs_assistant_message_id_idx" ON "agent_runs"("assistant_message_id");

-- CreateIndex
CREATE INDEX "agent_runs_owner_session_hash_idx" ON "agent_runs"("owner_session_hash");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE INDEX "agent_interrupts_run_id_status_idx" ON "agent_interrupts"("run_id", "status");

-- CreateIndex
CREATE INDEX "agent_interrupts_thread_id_idx" ON "agent_interrupts"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_interrupts_run_id_langgraph_interrupt_id_key" ON "agent_interrupts"("run_id", "langgraph_interrupt_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_interrupts_run_id_sequence_key" ON "agent_interrupts"("run_id", "sequence");

-- PostgreSQL partial unique index: one run can have at most one pending interrupt.
CREATE UNIQUE INDEX "agent_interrupts_one_pending_per_run_key"
ON "agent_interrupts"("run_id")
WHERE "status" = 'pending';

-- AddForeignKey
ALTER TABLE "agent_interrupts" ADD CONSTRAINT "agent_interrupts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
