const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// GET /api/dashboard/stats - Get system-wide statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await Promise.all([
      // Total counts
      pool.query('SELECT COUNT(*) as total_schools FROM schools WHERE status = $1', ['Active']),
      pool.query('SELECT COUNT(*) as total_students FROM students WHERE status = $1', ['Active']),
      pool.query('SELECT COUNT(*) as total_teachers FROM teachers WHERE status = $1', ['Active']),
      pool.query('SELECT COUNT(*) as total_districts FROM districts'),
      
      // Today's attendance
      pool.query(`
        SELECT 
          COUNT(*) as total_marked,
          COUNT(*) FILTER (WHERE status = 'Present') as present,
          COUNT(*) FILTER (WHERE status = 'Absent') as absent
        FROM student_attendance 
        WHERE attendance_date = CURRENT_DATE
      `),
      
      // Recent enrollments (last 30 days)
      pool.query(`
        SELECT COUNT(*) as recent_enrollments 
        FROM students 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `),
      
      // District-wise summary
      pool.query(`
        SELECT 
          d.name as district_name,
          COUNT(DISTINCT s.school_id) as schools,
          COUNT(DISTINCT st.student_id) as students
        FROM districts d
        LEFT JOIN blocks b ON b.district_id = d.district_id
        LEFT JOIN schools s ON s.block_id = b.block_id AND s.status = 'Active'
        LEFT JOIN students st ON st.school_id = s.school_id AND st.status = 'Active'
        GROUP BY d.district_id, d.name
        ORDER BY students DESC
      `)
    ]);

    const [
      schoolCount, studentCount, teacherCount, districtCount,
      attendanceStats, enrollmentStats, districtStats
    ] = stats;

    res.json({
      success: true,
      data: {
        totals: {
          schools: parseInt(schoolCount.rows[0].total_schools),
          students: parseInt(studentCount.rows[0].total_students),
          teachers: parseInt(teacherCount.rows[0].total_teachers),
          districts: parseInt(districtCount.rows[0].total_districts)
        },
        today_attendance: attendanceStats.rows[0] || {
          total_marked: 0, present: 0, absent: 0
        },
        recent_enrollments: parseInt(enrollmentStats.rows[0].recent_enrollments),
        district_breakdown: districtStats.rows,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard statistics' 
    });
  }
});

// GET /api/dashboard/kpis - Get real-time KPIs
router.get('/kpis', async (req, res) => {
  try {
    const kpis = await Promise.all([
      // Enrollment trend (last 6 months)
      pool.query(`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as enrollments
        FROM students 
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `),
      
      // Attendance rate (last 30 days)
      pool.query(`
        SELECT 
          ROUND(
            COUNT(*) FILTER (WHERE status = 'Present') * 100.0 / COUNT(*), 2
          ) as attendance_rate
        FROM student_attendance 
        WHERE attendance_date >= CURRENT_DATE - INTERVAL '30 days'
      `),
      
      // School performance metrics
      pool.query(`
        SELECT 
          AVG(total_students) as avg_students_per_school,
          AVG(total_teachers) as avg_teachers_per_school,
          COUNT(*) FILTER (WHERE total_students > 500) as large_schools
        FROM schools 
        WHERE status = 'Active'
      `)
    ]);

    const [enrollmentTrend, attendanceRate, schoolMetrics] = kpis;

    res.json({
      success: true,
      data: {
        enrollment_trend: enrollmentTrend.rows,
        attendance_rate: parseFloat(attendanceRate.rows[0]?.attendance_rate || 0),
        school_metrics: schoolMetrics.rows[0],
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('KPIs error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch KPIs' 
    });
  }
});

module.exports = router;
