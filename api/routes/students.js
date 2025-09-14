const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// GET /api/students - List students with pagination and filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      school_id,
      class_number,
      section,
      status = 'Active',
      search
    } = req.query;

    const offset = (page - 1) * limit;
    
    let query = `
      SELECT s.student_id, s.admission_no, s.roll_no, s.first_name, s.last_name,
             s.gender, s.date_of_birth, s.class_number, s.section, s.category,
             s.guardian_name, s.guardian_phone, s.status,
             sc.name as school_name, d.name as district_name
      FROM students s
      JOIN schools sc ON sc.school_id = s.school_id
      JOIN blocks b ON b.block_id = sc.block_id
      JOIN districts d ON d.district_id = b.district_id
      WHERE s.status = $1
    `;
    
    const params = [status];
    let paramCount = 1;

    if (school_id) {
      query += ` AND s.school_id = $${++paramCount}`;
      params.push(school_id);
    }

    if (class_number) {
      query += ` AND s.class_number = $${++paramCount}`;
      params.push(class_number);
    }

    if (section) {
      query += ` AND s.section = $${++paramCount}`;
      params.push(section);
    }

    if (search) {
      query += ` AND (s.first_name || ' ' || s.last_name ILIKE $${++paramCount} OR s.admission_no ILIKE $${++paramCount})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count total
    const countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY s.last_name, s.first_name LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Students API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch students' 
    });
  }
});

// GET /api/students/:id - Get single student
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT s.*, sc.name as school_name, d.name as district_name,
             EXTRACT(YEAR FROM AGE(s.date_of_birth)) as age
      FROM students s
      JOIN schools sc ON sc.school_id = s.school_id  
      JOIN blocks b ON b.block_id = sc.block_id
      JOIN districts d ON d.district_id = b.district_id
      WHERE s.student_id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }
    
    // Get recent attendance
    const attendanceQuery = `
      SELECT attendance_date, status 
      FROM student_attendance 
      WHERE student_id = $1 
      ORDER BY attendance_date DESC 
      LIMIT 10
    `;
    const attendanceResult = await pool.query(attendanceQuery, [id]);
    
    res.json({
      success: true,
      data: {
        ...result.rows[0],
        recent_attendance: attendanceResult.rows
      }
    });
  } catch (error) {
    console.error('Student detail error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch student details' 
    });
  }
});

module.exports = router;
