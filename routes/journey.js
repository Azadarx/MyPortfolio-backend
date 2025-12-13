import express from 'express';
import { executeQuery } from '../server/db.js';
import { isAuthenticated, isAdmin } from '../middleware/middleware.js';

const router = express.Router();

// Get all journey/experience items
router.get('/', async (req, res) => {
  try {
    const journey = await executeQuery(`
      SELECT * FROM journey_items 
      ORDER BY start_date DESC
    `);
    
    res.json(journey || []);
  } catch (error) {
    console.error('Journey fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch journey items', 
      error: error.message 
    });
  }
});

// Get single journey item
router.get('/:id', async (req, res) => {
  try {
    const items = await executeQuery(
      'SELECT * FROM journey_items WHERE id = $1',
      [req.params.id]
    );
    
    if (!items || items.length === 0) {
      return res.status(404).json({ message: 'Journey item not found' });
    }
    
    res.json(items[0]);
  } catch (error) {
    console.error('Journey item fetch error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch journey item', 
      error: error.message 
    });
  }
});

// Create journey item (Admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { 
      title, 
      company, 
      description, 
      start_date, 
      end_date, 
      type 
    } = req.body;
    
    if (!title || !company || !start_date || !type) {
      return res.status(400).json({ 
        message: 'Title, company, start_date, and type are required' 
      });
    }
    
    const result = await executeQuery(`
      INSERT INTO journey_items 
      (title, company, description, start_date, end_date, type, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING id
    `, [title, company, description, start_date, end_date || null, type]);
    
    const newItem = {
      id: result[0].id,
      title,
      company,
      description,
      start_date,
      end_date,
      type,
      created_at: new Date()
    };
    
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Journey creation error:', error);
    res.status(500).json({ 
      message: 'Failed to create journey item', 
      error: error.message 
    });
  }
});

// Update journey item (Admin only)
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      company, 
      description, 
      start_date, 
      end_date, 
      type 
    } = req.body;
    
    await executeQuery(`
      UPDATE journey_items 
      SET title = $1, company = $2, description = $3, 
          start_date = $4, end_date = $5, type = $6, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [title, company, description, start_date, end_date || null, type, id]);
    
    const updatedItem = {
      id,
      title,
      company,
      description,
      start_date,
      end_date,
      type,
      updated_at: new Date()
    };
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Journey update error:', error);
    res.status(500).json({ 
      message: 'Failed to update journey item', 
      error: error.message 
    });
  }
});

// Delete journey item (Admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await executeQuery('DELETE FROM journey_items WHERE id = $1', [id]);
    
    res.json({ message: 'Journey item deleted successfully', id });
  } catch (error) {
    console.error('Journey deletion error:', error);
    res.status(500).json({ 
      message: 'Failed to delete journey item', 
      error: error.message 
    });
  }
});

export default router;