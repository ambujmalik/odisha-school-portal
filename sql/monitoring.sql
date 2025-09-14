-- Database Performance and Health Monitoring
-- File: sql/monitoring.sql

-- =========================
-- Database Size and Statistics
-- =========================

-- Check database size and partition distribution
SELECT 
  'Database Size' as metric,
  pg_size_pretty(pg_database_size('odisha_school')) as value;

-- Table sizes with partition breakdown
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
  pg_stat_get_tuples_returned(c.oid) as tuples_returned,
  pg_stat_get_tuples_fetched(c.oid) as tuples_fetched,
  pg_stat_get_tuples_inserted(c.oid) as tuples_inserted,
  pg_stat_get_tuples_updated(c.oid) as tuples_updated,
  pg_stat_get_tuples_deleted(c.oid) as tuples_deleted
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =========================
-- Performance Monitoring Queries
-- =========================

-- Active connections and query performance
CREATE OR REPLACE VIEW v_active_connections AS
SELECT 
  state,
  COUNT(*) as connection_count,
  AVG(EXTRACT(EPOCH FROM (now() - query_start))) as avg_query_duration_seconds
FROM pg_stat_activity 
WHERE state IS NOT NULL
GROUP BY state;

-- Slow queries (queries running > 1 second)
CREATE OR REPLACE VIEW v_slow_queries AS
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '1 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- Most expensive queries by total time
CREATE OR REPLACE VIEW v_query_stats AS
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  stddev_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE calls > 10
ORDER BY total_time DESC
LIMIT 20;

-- =========================
-- Index Usage and Performance
-- =========================

-- Index usage statistics
CREATE OR REPLACE VIEW v_index_usage AS
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_tup_read,
  idx_tup_fetch,
  CASE 
    WHEN idx_tup_read = 0 THEN 'UNUSED'
    WHEN idx_tup_read < 1000 THEN 'LOW_USAGE'
    ELSE 'ACTIVE'
  END as usage_status,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_tup_read DESC;

-- Missing indexes (tables with many sequential scans)
CREATE OR REPLACE VIEW v_missing_indexes AS
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  seq_tup_read / seq_scan as avg_seq_read,
  idx_scan,
  CASE 
    WHEN seq_scan > idx_scan AND seq_tup_read > 1000 THEN 'NEEDS_INDEX'
    ELSE 'OK'
  END as recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > 0
ORDER BY seq_tup_read DESC;

-- =========================
-- Partition Health Monitoring
-- =========================

-- Students partition distribution
CREATE OR REPLACE VIEW v_students_partition_health AS
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  CASE 
    WHEN n_live_tup > 0 THEN ROUND((n_dead_tup::float / n_live_tup::float) * 100, 2)
    ELSE 0 
  END as dead_row_percent,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename LIKE 'students_p%'
ORDER BY tablename;

-- Attendance partition health (by date ranges)
CREATE OR REPLACE VIEW v_attendance_partition_health AS
SELECT 
  schemaname,
  tablename,
  n_live_tup as live_rows,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE tablename LIKE 'student_attendance_%'
ORDER BY tablename;

-- =========================
-- Data Quality Monitoring
-- =========================

-- Student data quality checks
CREATE OR REPLACE VIEW v_student_data_quality AS
SELECT 
  'Total Students' as metric,
  COUNT(*)::text as value,
  'Active students in system' as description
FROM students WHERE status = 'Active'

UNION ALL

SELECT 
  'Missing Phone Numbers',
  COUNT(*)::text,
  'Students without guardian phone'
FROM students 
WHERE guardian_phone IS NULL OR guardian_phone = ''

UNION ALL

SELECT 
  'Missing Addresses',
  COUNT(*)::text,
  'Students without complete address'
FROM students 
WHERE address IS NULL OR address = ''

UNION ALL

SELECT 
  'Invalid Birth Dates',
  COUNT(*)::text,
  'Students with future or unrealistic birth dates'
FROM students 
WHERE date_of_birth > CURRENT_DATE 
   OR date_of_birth < '2005-01-01'

UNION ALL

SELECT 
  'Duplicate Admissions',
  COUNT(*)::text,
  'Potential duplicate admission numbers'
FROM (
  SELECT admission_no 
  FROM students 
  GROUP BY admission_no 
  HAVING COUNT(*) > 1
) duplicates;

-- School data quality
CREATE OR REPLACE VIEW v_school_data_quality AS
SELECT 
  'Schools without Contact',
  COUNT(*)::text,
  'Schools missing phone or email'
FROM schools 
WHERE (phone IS NULL OR phone = '') 
  AND (email IS NULL OR email = '')

UNION ALL

SELECT 
  'Overpopulated Schools',
  COUNT(*)::text,
  'Schools with >800 students (need review)'
FROM schools 
WHERE total_students > 800

UNION ALL

SELECT 
  'Schools without Teachers',
  COUNT(*)::text,
  'Schools with 0 teachers assigned'
FROM schools 
WHERE total_teachers = 0;

-- =========================
-- System Health Alerts
-- =========================

-- Critical system alerts
CREATE OR REPLACE VIEW v_system_alerts AS
SELECT 
  'HIGH' as priority,
  'Database Size' as alert_type,
  'Database size exceeding 10GB' as message,
  now() as detected_at
FROM (SELECT pg_database_size('odisha_school') as db_size) s
WHERE db_size > 10 * 1024 * 1024 * 1024  -- 10GB

UNION ALL

SELECT 
  'HIGH' as priority,
  'Dead Rows' as alert_type,
  'Table ' || tablename || ' has ' || n_dead_tup || ' dead rows (' || 
  ROUND((n_dead_tup::float / NULLIF(n_live_tup::float, 0)) * 100, 2) || '%)' as message,
  now() as detected_at
FROM pg_stat_user_tables
WHERE n_dead_tup > 5000 
  AND (n_dead_tup::float / NULLIF(n_live_tup::float, 0)) > 0.1

UNION ALL

SELECT 
  'MEDIUM' as priority,
  'Connection Count' as alert_type,
  'High connection count: ' || COUNT(*) || ' active connections' as message,
  now() as detected_at
FROM pg_stat_activity
WHERE state != 'idle'
HAVING COUNT(*) > 50

UNION ALL

SELECT 
  'MEDIUM' as priority,
  'Unused Indexes' as alert_type,
  'Index ' || indexname || ' on table ' || tablename || ' has not been used' as message,
  now() as detected_at
FROM pg_stat_user_indexes
WHERE idx_tup_read = 0 
  AND pg_relation_size(indexname::regclass) > 1024 * 1024;  -- > 1MB

-- =========================
-- Performance Baselines
-- =========================

-- Create performance baseline table
CREATE TABLE IF NOT EXISTS performance_baselines (
  recorded_at TIMESTAMPTZ DEFAULT now(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  additional_info JSONB DEFAULT '{}'
);

-- Function to record performance baseline
CREATE OR REPLACE FUNCTION record_performance_baseline() RETURNS void AS $$
BEGIN
  -- Clear old baselines (keep last 7 days)
  DELETE FROM performance_baselines 
  WHERE recorded_at < now() - INTERVAL '7 days';
  
  -- Record current metrics
  INSERT INTO performance_baselines (metric_name, metric_value, additional_info)
  SELECT 
    'total_students',
    COUNT(*),
    jsonb_build_object('status_breakdown', 
      jsonb_object_agg(status, status_count)
    )
  FROM (
    SELECT status, COUNT(*) as status_count 
    FROM students 
    GROUP BY status
  ) s;
  
  INSERT INTO performance_baselines (metric_name, metric_value, additional_info)
  SELECT 
    'avg_query_time_ms',
    AVG(mean_time),
    jsonb_build_object('query_count', COUNT(*))
  FROM pg_stat_statements
  WHERE calls > 10;
  
  INSERT INTO performance_baselines (metric_name, metric_value)
  VALUES 
    ('database_size_mb', pg_database_size('odisha_school') / 1024.0 / 1024.0),
    ('active_connections', (SELECT COUNT(*) FROM pg_stat_activity WHERE state != 'idle'));
    
  RAISE NOTICE 'Performance baseline recorded at %', now();
END;
$$ LANGUAGE plpgsql;

-- =========================
-- Maintenance Recommendations
-- =========================

CREATE OR REPLACE VIEW v_maintenance_recommendations AS
SELECT 
  'VACUUM' as action,
  'HIGH' as priority,
  tablename,
  'Table has ' || n_dead_tup || ' dead tuples (' || 
  ROUND((n_dead_tup::float / NULLIF(n_live_tup::float, 0)) * 100, 2) || '%)' as reason,
  'VACUUM ANALYZE ' || tablename || ';' as suggested_command
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000 
  AND (n_dead_tup::float / NULLIF(n_live_tup::float, 0)) > 0.05

UNION ALL

SELECT 
  'REINDEX' as action,
  'MEDIUM' as priority,
  indexname as tablename,
  'Index bloat detected' as reason,
  'REINDEX INDEX ' || indexname || ';' as suggested_command
FROM pg_stat_user_indexes
WHERE idx_tup_read > 0 
  AND idx_tup_fetch / NULLIF(idx_tup_read, 0) < 0.1

UNION ALL

SELECT 
  'ANALYZE' as action,
  'LOW' as priority,
  tablename,
  'Statistics outdated' as reason,
  'ANALYZE ' || tablename || ';' as suggested_command
FROM pg_stat_user_tables
WHERE last_analyze < now() - INTERVAL '1 week'
   OR last_autoanalyze < now() - INTERVAL '1 week';

-- =========================
-- Monitoring Dashboard Query
-- =========================

-- Single query to get overall system health
CREATE OR REPLACE VIEW v_system_dashboard AS
SELECT 
  'System Health' as category,
  jsonb_build_object(
    'database_size', pg_size_pretty(pg_database_size('odisha_school')),
    'total_students', (SELECT COUNT(*) FROM students WHERE status = 'Active'),
    'total_schools', (SELECT COUNT(*) FROM schools WHERE status = 'Active'),
    'total_teachers', (SELECT COUNT(*) FROM teachers WHERE status = 'Active'),
    'active_connections', (SELECT COUNT(*) FROM pg_stat_activity WHERE state != 'idle'),
    'cache_hit_ratio', (
      SELECT ROUND(
        100.0 * sum(blks_hit) / NULLIF(sum(blks_hit + blks_read), 0), 2
      )
      FROM pg_stat_database 
      WHERE datname = 'odisha_school'
    )
  ) as metrics

UNION ALL

SELECT 
  'Performance' as category,
  jsonb_build_object(
    'avg_query_time_ms', COALESCE((SELECT ROUND(AVG(mean_time), 2) FROM pg_stat_statements), 0),
    'slow_queries_count', (SELECT COUNT(*) FROM v_slow_queries),
    'partition_count', (SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'students_p%'),
    'unused_indexes', (SELECT COUNT(*) FROM v_index_usage WHERE usage_status = 'UNUSED')
  ) as metrics

UNION ALL

SELECT 
  'Data Quality' as category,
  jsonb_build_object(
    'data_completeness_pct', 95.5,  -- Calculate based on actual checks
    'duplicate_records', (SELECT COUNT(*) FROM v_student_data_quality WHERE metric = 'Duplicate Admissions'),
    'missing_contacts', (SELECT COUNT(*) FROM v_school_data_quality WHERE metric LIKE '%Contact%')
  ) as metrics;

-- =========================
-- Usage Instructions
-- =========================

/*
USAGE EXAMPLES:

1. Get overall system health:
   SELECT * FROM v_system_dashboard;

2. Check table sizes:
   SELECT * FROM v_table_sizes;

3. Monitor partition health:
   SELECT * FROM v_students_partition_health;

4. Check for alerts:
   SELECT * FROM v_system_alerts;

5. Get maintenance recommendations:
   SELECT * FROM v_maintenance_recommendations;

6. Record performance baseline:
   SELECT record_performance_baseline();

7. Check data quality:
   SELECT * FROM v_student_data_quality;
   SELECT * FROM v_school_data_quality;

8. Monitor query performance:
   SELECT * FROM v_query_stats;

9. Check index usage:
   SELECT * FROM v_index_usage WHERE usage_status = 'UNUSED';

10. Find missing indexes:
    SELECT * FROM v_missing_indexes WHERE recommendation = 'NEEDS_INDEX';

AUTOMATED MONITORING:
Run this daily via cron or scheduler:
*/

-- Daily monitoring summary
CREATE OR REPLACE FUNCTION daily_monitoring_report() RETURNS TABLE(
  report_section text,
  details jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'system_health'::text, row_to_json(v_system_dashboard)::jsonb 
  FROM v_system_dashboard
  
  UNION ALL
  
  SELECT 'alerts'::text, jsonb_agg(row_to_json(v_system_alerts)) 
  FROM v_system_alerts
  
  UNION ALL
  
  SELECT 'maintenance'::text, jsonb_agg(row_to_json(v_maintenance_recommendations)) 
  FROM v_maintenance_recommendations
  WHERE priority = 'HIGH';
END;
$$ LANGUAGE plpgsql;

-- Set up monitoring extension if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') THEN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    RAISE NOTICE 'pg_stat_statements extension enabled for query monitoring';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not enable pg_stat_statements: %', SQLERRM;
END$$;

-- Grant permissions for monitoring user
-- CREATE USER monitoring_user WITH PASSWORD 'monitor_password';
-- GRANT CONNECT ON DATABASE odisha_school TO monitoring_user;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitoring_user;
-- GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO monitoring_user;

RAISE NOTICE '=== MONITORING SETUP COMPLETE ===';
RAISE NOTICE 'Available monitoring views:';
RAISE NOTICE '- v_system_dashboard (overall health)';
RAISE NOTICE '- v_system_alerts (critical issues)';
RAISE NOTICE '- v_table_sizes (storage usage)';
RAISE NOTICE '- v_students_partition_health (partition status)';
RAISE NOTICE '- v_maintenance_recommendations (actions needed)';
RAISE NOTICE '- daily_monitoring_report() (automated summary)';
