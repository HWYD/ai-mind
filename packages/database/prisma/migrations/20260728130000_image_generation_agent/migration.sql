ALTER TYPE "StreamRunKind" ADD VALUE 'image_generation';

CREATE TYPE "ImageGenerationRunStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');
CREATE TYPE "ImageGenerationStage" AS ENUM ('received', 'briefing', 'prompting', 'generating', 'preparing_result', 'completed', 'failed', 'cancelled');
CREATE TYPE "ImageProviderResultStatus" AS ENUM ('none', 'ready', 'expired', 'discarded');

CREATE TABLE "image_generation_runs" (
    "id" UUID NOT NULL,
    "stream_run_id" UUID NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "assistant_message_id" TEXT NOT NULL,
    "owner_session_hash" VARCHAR(64) NOT NULL,
    "active_owner_session_hash" VARCHAR(64),
    "active_lease_expires_at" TIMESTAMPTZ(6),
    "status" "ImageGenerationRunStatus" NOT NULL,
    "stage" "ImageGenerationStage" NOT NULL,
    "prompt_revision_count" INTEGER NOT NULL DEFAULT 0,
    "image_generation_count" INTEGER NOT NULL DEFAULT 0,
    "public_brief_summary_json" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'doubao',
    "provider_model" TEXT NOT NULL DEFAULT 'doubao-seedream-5.0-lite',
    "provider_request_id" TEXT,
    "provider_result_url" TEXT,
    "provider_result_status" "ImageProviderResultStatus" NOT NULL DEFAULT 'none',
    "provider_result_mime_type" TEXT,
    "provider_result_width" INTEGER,
    "provider_result_height" INTEGER,
    "provider_result_byte_length" INTEGER,
    "provider_result_expires_at" TIMESTAMPTZ(6),
    "failure_code" VARCHAR(128),
    "public_failure_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    CONSTRAINT "image_generation_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "image_generation_runs_prompt_revision_count_check" CHECK ("prompt_revision_count" BETWEEN 0 AND 1),
    CONSTRAINT "image_generation_runs_image_generation_count_check" CHECK ("image_generation_count" BETWEEN 0 AND 1)
);

CREATE UNIQUE INDEX "image_generation_runs_stream_run_id_key" ON "image_generation_runs"("stream_run_id");
CREATE UNIQUE INDEX "image_generation_runs_active_owner_session_hash_key" ON "image_generation_runs"("active_owner_session_hash");
CREATE INDEX "image_generation_runs_conversation_id_idx" ON "image_generation_runs"("conversation_id");
CREATE INDEX "image_generation_runs_owner_session_hash_idx" ON "image_generation_runs"("owner_session_hash");
CREATE INDEX "image_generation_runs_status_idx" ON "image_generation_runs"("status");
CREATE INDEX "image_generation_runs_provider_result_expires_at_idx" ON "image_generation_runs"("provider_result_expires_at");

ALTER TABLE "image_generation_runs"
    ADD CONSTRAINT "image_generation_runs_stream_run_id_fkey"
    FOREIGN KEY ("stream_run_id") REFERENCES "stream_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
