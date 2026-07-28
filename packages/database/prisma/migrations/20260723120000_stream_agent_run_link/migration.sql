-- Validate existing nullable links before adding the durable relation.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "stream_runs" sr
        LEFT JOIN "agent_runs" ar ON ar."id" = sr."agent_run_id"
        WHERE sr."agent_run_id" IS NOT NULL AND ar."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot add StreamRun.agentRunId foreign key: orphan links exist';
    END IF;
END $$;

CREATE UNIQUE INDEX "stream_runs_agent_run_id_key"
    ON "stream_runs"("agent_run_id");

ALTER TABLE "stream_runs"
    ADD CONSTRAINT "stream_runs_agent_run_id_fkey"
    FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
