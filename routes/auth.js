// routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { executeQuery } from '../server/db.js';
import { isAuthenticated, isAdmin } from '../middleware/middleware.js';

const router = express.Router();

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const users = await executeQuery('SELECT * FROM users WHERE email = $1', [email]);
    if (!users || users.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, email: user.email, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

// Verify token route
router.get('/verify', isAuthenticated, (req, res) => {
  res.json({
    email: req.user.email,
    role: req.user.role,
    isAdmin: req.user.email === process.env.ADMIN_EMAIL
  });
});

// Change password route (admin only)
router.post('/change-password', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new passwords are required' });

    const users = await executeQuery('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!users || users.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Current password is incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await executeQuery('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error during password change', error: error.message });
  }
});

export default router;
