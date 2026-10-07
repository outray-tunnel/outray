-- Snapshot reconciliation only. Migration 0026 already creates these columns,
-- constraints, and index, and preserves existing monitor/incident behavior with
-- its backfills. Repeating its DDL here fails and rolls back both migrations.
-- Keep this journal entry and its schema snapshot for future generated diffs.
SELECT 1;
