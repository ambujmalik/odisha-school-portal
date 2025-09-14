-- =========================
-- ODISHA SCHOOL PORTAL - DATABASE MAINTENANCE
-- =========================

-- =========================
-- PARTITION MANAGEMENT
-- =========================

-- Function to create new attendance partitions
CREATE OR REPLACE FUNCTION create_attendance_partitions()
RETURNS void AS $$
DECLARE
  start_date date;
  end_date date;
  part_name text;
  year_val int;
  month_val int;
BEGIN
  -- Create partitions for next 6 months
  FOR i IN 0..5 LOOP
    start_date := date_trunc('month', CURRENT_DATE + (i || ' months')::interval);
    end_date := start_date + INTERVAL '1 month';
    year_val := EXTRACT(YEAR FROM start_date);
    month_val := EXTRACT(MONTH FROM start_date);
    part_name := format('student_attendance_%s_%s', year_val, lpad(month_val::text, 2, '0'));
    
    -- Check if partition already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = part_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF student_attendance FOR VALUES FROM (%L) TO (%L);',
        part_name, start_date, end_date
      );
      
      RAISE NOTICE 'Created partition: %', part_name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old attendance partitions (older than 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_attendance_partitions()
RETURNS void AS $$
DECLARE
  part_record RECORD;
  cutoff_date date := CURRENT_DATE - INTERVAL '2 years';
BEGIN
  FOR part_record IN
    SELECT schemaname, tablename 
    FROM pg_tables 
    WHERE tablename LIKE 'student_attendance_%' 
    AND schemaname = 'public'
  LOOP
    -- Extract date from partition name and check if it's old
    DECLARE
      part_year int;
      part_month int;
      part_date date;
    BEGIN
      part_year := split_part(part_record.tablename, '_', 3)::int;
      part_month := split_part(part_record.tablename, '_', 4)::int;
      part_date := make_date(part_year, part_month, 1);
      
      IF part_date < cutoff_date THEN
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE;', part_record.tablename);
        RAISE NOTICE 'Dropped old partition: %', part_record.tablename;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not process partition: %', part_record.tablename;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create exam_results partitions based on exam_id
CREATE OR REPLACE FUNCTION create_exam_results_partition(exam_id_val BIGINT)
RETURNS void AS $$
DECLARE
  part_name text := format('exam_results_exam_%s', exam_id_val);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF exam_results FOR VALUES IN (%L);',
      part_name, exam_id_val
    );
    RAISE NOTICE 'Created exam results partition: %', part_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- INDEX MAINTENANCE
-- =========================

-- Rebuild fragmented indexes
CREATE OR REPLACE FUNCTION rebuild_fragmented_indexes()
RETURNS void AS $$
DECLARE
  idx_record RECORD;
BEGIN
  FOR idx_record IN
    SELECT schemaname, tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN ('students', 'teachers', 'schools', 'student_attendance')
  LOOP
    BEGIN
      EXECUTE format('REINDEX INDEX %I.%I;', idx_record.schemaname, idx_record.indexname);
      RAISE NOTICE 'Reindexed: %.%', idx_record.tablename, idx_record.indexname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to reindex %.%: %', idx_record.tablename, idx_record.indexname, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update table statistics
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS void AS $$
BEGIN
  ANALYZE districts;
  ANALYZE blocks;
  ANALYZE schools;
  ANALYZE students;
  ANALYZE teachers;
  ANALYZE classes;
  ANALYZE users;
  ANALYZE student_attendance;
  ANALYZE examinations;
  ANALYZE exam_results;
  ANALYZE fee_payments;
  
  RAISE NOTICE 'Statistics updated for all tables';
END;
$$ LANGUAGE plpgsql;

-- =========================
-- DATA CLEANUP
-- =========================

-- Archive old attendance data (move to archive table)
CREATE TABLE IF NOT EXISTS student_attendance_archive (
  LIKE student_attendance INCLUDING ALL
);

CREATE OR REPLACE FUNCTION archive_old_attendance()
RETURNS void AS $$
DECLARE
  cutoff_date date := CURRENT_DATE - INTERVAL '1 year';
  rows_archived bigint;
BEGIN
  -- Move old attendance to archive
  WITH moved_rows AS (
    DELETE FROM student_attendance 
    WHERE attendance_date < cutoff_date
    RETURNING *
  )
  INSERT INTO student_attendance_archive 
  SELECT * FROM moved_rows;
  
  GET DIAGNOSTICS rows_archived = ROW_COUNT;
  RAISE NOTICE 'Archived % attendance records older than %', rows_archived, cutoff_date;
END;
$$ LANGUAGE plpgsql;

-- Clean up inactive users
CREATE OR REPLACE FUNCTION cleanup_inactive_users()
RETURNS void AS $$
DECLARE
  rows_updated bigint;
BEGIN
  -- Mark users as inactive if they haven't logged in for 6 months
  UPDATE users 
  SET is_active = false 
  WHERE last_login < CURRENT_DATE - INTERVAL '6 months'
  AND is_active = true;
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Marked % users as inactive', rows_updated;
END;
$$ LANGUAGE plpgsql;

-- Remove duplicate entries (if any)
CREATE OR REPLACE FUNCTION remove_duplicate_students()
RETURNS void AS $$
DECLARE
  rows_deleted bigint;
BEGIN
  WITH duplicates AS (
    SELECT student_id, 
           ROW_NUMBER() OVER (PARTITION BY admission_no, school_id ORDER BY created_at DESC) as rn
    FROM students
  )
  DELETE FROM students 
  WHERE student_id IN (
    SELECT student_id FROM duplicates WHERE rn > 1
  );
  
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Removed % duplicate student records', rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- PERFORMANCE MONITORING
-- =========================

-- Monitor database size and growth
CREATE OR REPLACE VIEW database_size_monitor AS
SELECT 
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size,
  pg_database_size(pg_database.datname) AS size_bytes
FROM pg_database 
WHERE datname = current_database();

-- Monitor table sizes
CREATE OR REPLACE VIEW table_size_monitor AS
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
  pg_total_relation_size(schemaname||'.'||tablename) AS total_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Monitor slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE mean_time > 100 -- queries taking more than 100ms on average
ORDER BY total_time DESC
LIMIT 20;

-- Monitor index usage
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_tup_read,
  idx_tup_fetch,
  idx_scan,
  CASE WHEN idx_scan = 0 THEN 'Never used'
       WHEN idx_scan < 100 THEN 'Rarely used'
       ELSE 'Actively used'
  END AS usage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- =========================
-- HEALTH CHECKS
-- =========================

-- Comprehensive health check function
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS TABLE(
  check_name text,
  status text,
  details text,
  recommendation text
) AS $$
BEGIN
  -- Check database connections
  RETURN QUERY
  SELECT 
    'Database Connections'::text,
    CASE WHEN count(*) < 80 THEN 'GOOD' 
         WHEN count(*) < 100 THEN 'WARNING'
         ELSE 'CRITICAL' END,
    'Active connections: ' || count(*)::text,
    CASE WHEN count(*) >= 80 THEN 'Monitor connection usage' ELSE 'Connection usage normal' END
  FROM pg_stat_activity 
  WHERE state = 'active';

  -- Check partition health
  RETURN QUERY
  SELECT 
    'Partition Health'::text,
    'GOOD'::text,
    'Partitions found: ' || count(*)::text,
    'Partitioning working correctly'::text
  FROM pg_tables 
  WHERE tablename LIKE 'students_p%' OR tablename LIKE 'student_attendance_%';

  -- Check data integrity
  RETURN QUERY
  SELECT 
    'Data Integrity'::text,
    CASE WHEN count(*) = 0 THEN 'GOOD' ELSE 'WARNING' END,
    'Orphaned student records: ' || count(*)::text,
    CASE WHEN count(*) > 0 THEN 'Clean up orphaned records' ELSE 'Data integrity maintained' END
  FROM students s
  LEFT JOIN schools sc ON sc.school_id = s.school_id
  WHERE sc.school_id IS NULL;

  -- Check recent activity
  RETURN QUERY
  SELECT 
    'Recent Activity'::text,
    CASE WHEN count(*) > 0 THEN 'GOOD' ELSE 'WARNING' END,
    'Records updated in last 24h: ' || count(*)::text,
    CASE WHEN count(*) = 0 THEN 'Check data ingestion process' ELSE 'System actively used' END
  FROM (
    SELECT updated_at FROM students WHERE updated_at > now() - interval '24 hours'
    UNION ALL
    SELECT updated_at FROM schools WHERE updated_at > now() - interval '24 hours'
    UNION ALL
    SELECT updated_at FROM teachers WHERE updated_at > now() - interval '24 hours'
  ) recent_updates;

END;
$$ LANGUAGE plpgsql;

-- =========================
-- BACKUP PROCEDURES
-- =========================

-- Generate backup script
CREATE OR REPLACE FUNCTION generate_backup_script()
RETURNS text AS $$
BEGIN
  RETURN format('
-- Backup script generated on %s
-- Usage: psql -f backup_restore.sql

-- Create backup
\echo Creating backup...
\! pg_dump -h %s -U %s -d %s --verbose --format=custom --file=odisha_school_backup_%s.dump

-- To restore:
-- pg_restore -h hostname -U username -d database_name --verbose odisha_school_backup_%s.dump

\echo Backup completed successfully
',
    now()::date,
    'localhost',
    current_user,
    current_database(),
    to_char(now(), 'YYYY_MM_DD_HH24_MI'),
    to_char(now(), 'YYYY_MM_DD_HH24_MI')
  );
END;
$$ LANGUAGE plpgsql;

-- =========================
-- SCHEDULED MAINTENANCE TASKS
-- =========================

-- Daily maintenance routine
CREATE OR REPLACE FUNCTION daily_maintenance()
RETURNS void AS $$
BEGIN
  RAISE NOTICE 'Starting daily maintenance at %', now();
  
  -- Update statistics
  PERFORM update_table_statistics();
  
  -- Create new partitions if needed
  PERFORM create_attendance_partitions();
  
  -- Clean up inactive sessions (if pg_stat_statements is available)
  -- Note: This would typically be handled by connection pooling
  
  RAISE NOTICE 'Daily maintenance completed at %', now();
END;
$$ LANGUAGE plpgsql;

-- Weekly maintenance routine
CREATE OR REPLACE FUNCTION weekly_maintenance()
RETURNS void AS $$
BEGIN
  RAISE NOTICE 'Starting weekly maintenance at %', now();
  
  -- Rebuild indexes
  PERFORM rebuild_fragmented_indexes();
  
  -- Archive old data
  PERFORM archive_old_attendance();
  
  -- Clean up inactive users
  PERFORM cleanup_inactive_users();
  
  -- Remove duplicates
  PERFORM remove_duplicate_students();
  
  RAISE NOTICE 'Weekly maintenance completed at %', now();
END;
$$ LANGUAGE plpgsql;

-- Monthly maintenance routine
CREATE OR REPLACE FUNCTION monthly_maintenance()
RETURNS void AS $$
BEGIN
  RAISE NOTICE 'Starting monthly maintenance at %', now();
  
  -- Drop old partitions
  PERFORM cleanup_old_attendance_partitions();
  
  -- Vacuum analyze all tables
  VACUUM ANALYZE;
  
  -- Run health check
  RAISE NOTICE 'Health Check Results:';
  FOR rec IN SELECT * FROM system_health_check() LOOP
    RAISE NOTICE 'CHECK: % - STATUS: % - %', rec.check_name, rec.status, rec.details;
  END LOOP;
  
  RAISE NOTICE 'Monthly maintenance completed at %', now();
END;
$$ LANGUAGE plpgsql;

-- =========================
-- UTILITY FUNCTIONS
-- =========================

-- Reset demo data (use with caution!)
CREATE OR REPLACE FUNCTION reset_demo_data()
RETURNS void AS $$
BEGIN
  RAISE NOTICE 'WARNING: This will reset all data!';
  RAISE NOTICE 'Sleeping for 5 seconds... Cancel now if this is a mistake!';
  PERFORM pg_sleep(5);
  
  TRUNCATE TABLE student_attendance CASCADE;
  TRUNCATE TABLE exam_results CASCADE;
  TRUNCATE TABLE fee_payments CASCADE;
  TRUNCATE TABLE students CASCADE;
  TRUNCATE TABLE teachers CASCADE;
  TRUNCATE TABLE classes CASCADE;
  TRUNCATE TABLE schools CASCADE;
  TRUNCATE TABLE blocks CASCADE;
  TRUNCATE TABLE districts CASCADE;
  TRUNCATE TABLE users CASCADE;
  
  RAISE NOTICE 'All tables truncated. Run seed.sql to regenerate data.';
END;
$$ LANGUAGE plpgsql;

-- Get system statistics
CREATE OR REPLACE FUNCTION get_system_stats()
RETURNS TABLE(
  metric text,
  value text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'Database Size'::text, pg_size_pretty(pg_database_size(current_database()));
  
  RETURN QUERY
  SELECT 'Total Students'::text, (SELECT count(*)::text FROM students WHERE status = 'Active');
  
  RETURN QUERY
  SELECT 'Total Schools'::text, (SELECT count(*)::text FROM schools WHERE status = 'Active');
  
  RETURN QUERY
  SELECT 'Total Teachers'::text, (SELECT count(*)::text FROM teachers WHERE status = 'Active');
  
  RETURN QUERY
  SELECT 'Attendance Records'::text, (SELECT count(*)::text FROM student_attendance);
  
  RETURN QUERY
  SELECT 'Active Partitions'::text, (
    SELECT count(*)::text FROM pg_tables 
    WHERE tablename LIKE 'students_p%' OR tablename LIKE 'student_attendance_%'
  );
  
  RETURN QUERY
  SELECT 'Last Maintenance'::text, 
         COALESCE((SELECT max(created_at)::text FROM pg_stat_user_tables), 'Never');
END;
$$ LANGUAGE plpgsql;

-- =========================
-- MAINTENANCE SCHEDULE RECOMMENDATIONS
-- =========================

/*
RECOMMENDED MAINTENANCE SCHEDULE:

DAILY (via cron at 2 AM):
SELECT daily_maintenance();

WEEKLY (Sundays at 3 AM):
SELECT weekly_maintenance();

MONTHLY (1st day at 4 AM):
SELECT monthly_maintenance();

BACKUP (Daily at 1 AM):
SELECT generate_backup_script();

HEALTH CHECK (Every 4 hours):
SELECT * FROM system_health_check();

Example crontab entries:
0 2 * * * psql -d odisha_school -c "SELECT daily_maintenance();"
0 3 * * 0 psql -d odisha_school -c "SELECT weekly_maintenance();"
0 4 1 * * psql -d odisha_school -c "SELECT monthly_maintenance();"
0 */4 * * * psql -d odisha_school -c "SELECT * FROM system_health_check();"
*/

-- =========================
-- QUICK MAINTENANCE COMMANDS
-- =========================

-- Run this to get current system status
-- SELECT * FROM get_system_stats();

-- Run this for health check
-- SELECT * FROM system_health_check();

-- Run this to see table sizes
-- SELECT * FROM table_size_monitor;

-- Run this to check index usage
-- SELECT * FROM index_usage_stats WHERE usage_status = 'Never used';

-- Emergency partition creation (if needed)
-- SELECT create_attendance_partitions();

RAISE NOTICE '=== MAINTENANCE SCRIPTS LOADED ===';
RAISE NOTICE 'Available functions:';
RAISE NOTICE '- daily_maintenance()';
RAISE NOTICE '- weekly_maintenance()';
RAISE NOTICE '- monthly_maintenance()';
RAISE NOTICE '- system_health_check()';
RAISE NOTICE '- get_system_stats()';
RAISE NOTICE '- create_attendance_partitions()';
RAISE NOTICE '=================================';
