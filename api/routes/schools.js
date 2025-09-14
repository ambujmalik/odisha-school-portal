const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// GET /api/schools - List schools with pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      district_id, 
      block_id, 
      status = 'Active',
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    
    let query = `
      SELECT s.school_id, s.school_code, s.name, s.address, s.phone, s.email,
             s.total_students, s.total_teachers, s.status, s.established_year,
             s.facilities, d.name as district_name, b.name as block_name
      FROM schools s
      JOIN blocks b ON b.block_id = s.block_id
      JOIN districts d ON d.district_id = b.district_id
      WHERE s.status = $1
    `;
    
    const params = [status];
    let paramCount = 1;

    if (district_id) {
      query += ` AND d.district_id = $${++paramCount}`;
      params.push(district_id);
    }

    if (block_id) {
      query += ` AND b.block_id = $${++paramCount}`;
      params.push(block_id);
    }

    if (search) {
      query += ` AND (s.name ILIKE $${++paramCount} OR s.school_code ILIKE $${++paramCount})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count total
    const countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination
    query += ` ORDER BY s.name LIMIT $${++paramCount} OFFSET $${++paramCount}`;
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
    console.error('Schools API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch schools' 
    });
  }
});

// GET /api/schools/:id - Get single school
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT s.*, d.name as district_name, b.name as block_name,
             (SELECT COUNT(*) FROM students WHERE school_id = s.school_id AND status = 'Active') as active_students,
             (SELECT COUNT(*) FROM teachers WHERE school_id = s.school_id AND status = 'Active') as active_teachers
      FROM schools s
      JOIN blocks b ON b.block_id = s.block_id
      JOIN districts d ON d.district_id = b.district_id
      WHERE s.school_id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'School not found' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('School detail error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch school details' 
    });
  }
});

module.exports = router;
