-- Reproducible query-plan demonstration on a TEMP table (50,000 rows).
-- The first plan performs a sequential scan for ILIKE. The second can use a GIN index.
BEGIN;
CREATE TEMP TABLE demo_search_corpus AS
SELECT n AS doc_id,
       CASE WHEN n = 49999 THEN 'forensic log rarebeacon indicator'
            ELSE 'routine forensic workstation event log' END AS body
FROM generate_series(1, 50000) AS n;
ANALYZE demo_search_corpus;

-- Full table scan: leading-wildcard ILIKE is not served by a normal B-tree index.
EXPLAIN (ANALYZE, BUFFERS)
SELECT doc_id FROM demo_search_corpus WHERE body ILIKE '%rarebeacon%';

-- Build a GIN full-text index and run the equivalent token search.
CREATE INDEX idx_demo_search_gin ON demo_search_corpus
USING GIN (to_tsvector('simple', body));
ANALYZE demo_search_corpus;
EXPLAIN (ANALYZE, BUFFERS)
SELECT doc_id FROM demo_search_corpus
WHERE to_tsvector('simple', body) @@ plainto_tsquery('simple', 'rarebeacon');

ROLLBACK; -- temporary table/index and demo rows are discarded
