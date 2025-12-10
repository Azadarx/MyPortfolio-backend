// server/db.js - Updated with all new tables (PostgreSQL)
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'portfolio_db',
  port: process.env.DB_PORT || 5432,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database');
    client.release();
    return true;
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error.message, error.code, error.stack);
    throw error;
  }
};

// Helper function to execute queries
const executeQuery = async (sql, params = []) => {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error.message, error.code, error.stack);
    throw error;
  }
};

// Initialize the database tables
const initDatabase = async () => {
  try {
    console.log('Starting database initialization...');

    // Create a temporary connection for database creation
    const tempPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: 'postgres',
      port: process.env.DB_PORT || 5432,
    });

    // Create database if it doesn't exist
    console.log('Ensuring database exists...');
    const dbName = process.env.DB_NAME || 'portfolio_db';
    
    try {
      await tempPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database ${dbName} created`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`Database ${dbName} already exists`);
      } else {
        throw error;
      }
    }

    // Close temporary connection
    await tempPool.end();

    // Now use the pool for table creation
    if (!(await testConnection())) {
      throw new Error('Database connection failed');
    }

    // Create users table
    console.log('Creating users table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create skills table
    console.log('Creating skills table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        level VARCHAR(50) NOT NULL CHECK (level IN ('Beginner', 'Intermediate', 'Expert')),
        category VARCHAR(100) NOT NULL,
        iconUrl VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for skills updatedAt
    await executeQuery(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updatedAt = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await executeQuery(`
      DROP TRIGGER IF EXISTS update_skills_updated_at ON skills
    `);

    await executeQuery(`
      CREATE TRIGGER update_skills_updated_at
      BEFORE UPDATE ON skills
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    // Create projects table
    console.log('Creating projects table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        technologies TEXT NOT NULL,
        repoLink VARCHAR(255),
        liveLink VARCHAR(255),
        imageUrl VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for projects updatedAt
    await executeQuery(`
      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects
    `);

    await executeQuery(`
      CREATE TRIGGER update_projects_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    // Create contact_messages table
    console.log('Creating contact_messages table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create github_stats table
    console.log('Creating github_stats table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS github_stats (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        public_repos INT DEFAULT 0,
        followers INT DEFAULT 0,
        following INT DEFAULT 0,
        total_commits INT DEFAULT 0,
        total_stars INT DEFAULT 0,
        total_forks INT DEFAULT 0,
        languages JSONB,
        repositories JSONB,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for github_stats last_updated
    await executeQuery(`
      CREATE OR REPLACE FUNCTION update_last_updated_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.last_updated = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await executeQuery(`
      DROP TRIGGER IF EXISTS update_github_stats_last_updated ON github_stats
    `);

    await executeQuery(`
      CREATE TRIGGER update_github_stats_last_updated
      BEFORE UPDATE ON github_stats
      FOR EACH ROW
      EXECUTE FUNCTION update_last_updated_column()
    `);

    // Create visitor_analytics table
    console.log('Creating visitor_analytics table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS visitor_analytics (
        id SERIAL PRIMARY KEY,
        ip_address VARCHAR(45),
        user_agent TEXT,
        page_url VARCHAR(500),
        referrer VARCHAR(500),
        device_type VARCHAR(50),
        browser VARCHAR(100),
        os VARCHAR(100),
        country VARCHAR(100),
        city VARCHAR(100),
        session_id VARCHAR(255),
        visit_duration INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create daily_analytics table
    console.log('Creating daily_analytics table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS daily_analytics (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        total_visitors INT DEFAULT 0,
        unique_visitors INT DEFAULT 0,
        page_views INT DEFAULT 0,
        bounce_rate DECIMAL(5,2) DEFAULT 0,
        avg_session_duration INT DEFAULT 0,
        top_pages JSONB,
        top_referrers JSONB,
        device_breakdown JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create blog_posts table
    console.log('Creating blog_posts table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        content TEXT NOT NULL,
        excerpt TEXT,
        featured_image VARCHAR(255),
        tags JSONB,
        status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        author_id INT,
        views INT DEFAULT 0,
        likes INT DEFAULT 0,
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create trigger for blog_posts updated_at
    await executeQuery(`
      DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts
    `);

    await executeQuery(`
      CREATE TRIGGER update_blog_posts_updated_at
      BEFORE UPDATE ON blog_posts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    // Create blog_comments table
    console.log('Creating blog_comments table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS blog_comments (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        comment TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
      )
    `);

    // Create chat_conversations table
    console.log('Creating chat_conversations table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_message TEXT NOT NULL,
        bot_response TEXT NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create chat_stats table
    console.log('Creating chat_stats table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS chat_stats (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        total_messages INT DEFAULT 0,
        unique_sessions INT DEFAULT 0,
        popular_categories JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message, error.stack);
    throw error;
  }
};

// Function to create or reset an admin user
const createInitialAdmin = async () => {
  try {
    console.log('Creating/resetting initial admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Check if admin exists, and update or create
    const existingAdmin = await executeQuery('SELECT * FROM users WHERE email = $1', ['syedazadarhussayn@gmail.com']);

    if (existingAdmin.length === 0) {
      // Create new admin
      await executeQuery('INSERT INTO users (email, password, role) VALUES ($1, $2, $3)', [
        'syedazadarhussayn@gmail.com',
        hashedPassword,
        'admin',
      ]);
      console.log('Initial admin user created with email: syedazadarhussayn@gmail.com');
    } else {
      // Update existing admin's password
      await executeQuery('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, 'syedazadarhussayn@gmail.com']);
      console.log('Admin user password reset');
    }
  } catch (error) {
    console.error('Error creating/resetting initial admin:', error.message, error.stack);
  }
};

export { pool, executeQuery, initDatabase, createInitialAdmin };