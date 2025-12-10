// middleware/middleware.js
import jwt from 'jsonwebtoken';
import { executeQuery } from '../server/db.js';

// Authentication middleware
export const isAuthenticated = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Make sure token exists
    if (!token) {
      console.log('No token provided in request');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded successfully for user:', decoded.email);
      
      // Get user from database - FIXED: PostgreSQL uses $1 instead of ?
      const users = await executeQuery('SELECT * FROM users WHERE id = $1', [decoded.id]);
      
      if (!users || users.length === 0) {
        console.log('User not found in database for id:', decoded.id);
        return res.status(401).json({ message: 'Invalid token. User not found.' });
      }

      req.user = users[0];
      console.log('User authenticated:', req.user.email);
      next();
    } catch (error) {
      console.error('Token verification error:', error.message);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired. Please login again.' });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token. Please login again.' });
      }
      return res.status(401).json({ message: 'Authentication failed.' });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

// Admin authorization middleware
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      console.log('No user found in request object');
      return res.status(401).json({ message: 'Access denied. Not authenticated.' });
    }

    // Check if user is admin by role or email
    const isAdminByRole = req.user.role === 'admin';
    const isAdminByEmail = req.user.email === process.env.ADMIN_EMAIL;

    console.log('Admin check:', {
      email: req.user.email,
      role: req.user.role,
      adminEmail: process.env.ADMIN_EMAIL,
      isAdminByRole,
      isAdminByEmail
    });

    if (!isAdminByRole && !isAdminByEmail) {
      console.log('User is not admin:', req.user.email);
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    console.log('Admin authorization granted for:', req.user.email);
    next();
  } catch (error) {
    console.error('Authorization middleware error:', error);
    res.status(500).json({ message: 'Server error during authorization' });
  }
};