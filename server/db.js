// server/db.js - COMPLETE FIXED VERSION with Journey Table
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const isRenderEnvironment = !!process.env.RENDER || !!process.env.DATABASE_URL;
console.log('=== DATABASE CONNECTION INFO ===');
console.log('Environment:', isRenderEnvironment ? 'RENDER (Production)' : 'LOCAL (Development)');
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);

let pool;

if (isRenderEnvironment && process.env.DATABASE_URL) {
  console.log('Using Render DATABASE_URL');
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
} else {
  console.log('Using local PostgreSQL configuration');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'portfolio_db',
    port: process.env.DB_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

console.log('Connection pool created successfully');
console.log('================================');

const testConnection = async (retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('✔ Successfully connected to PostgreSQL database');
      
      const result = await client.query('SELECT NOW()');
      console.log('✔ Database query test successful:', result.rows[0].now);
      
      client.release();
      return true;
    } catch (error) {
      console.error(`✗ Connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (i < retries - 1) {
        console.log(`Retrying in ${(i + 1) * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
      } else {
        console.error('✗ All connection attempts failed');
        throw error;
      }
    }
  }
};

const executeQuery = async (sql, params = []) => {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

const initDatabase = async () => {
  try {
    console.log('Starting database initialization...');
    console.log('Testing database connection...');
    await testConnection();

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

    // Create trigger function for updatedAt
    console.log('Creating trigger functions...');
    await executeQuery(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updatedAt = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await executeQuery(`DROP TRIGGER IF EXISTS update_skills_updated_at ON skills`);
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
    imageUrl VARCHAR(500),
    cloudinary_public_id VARCHAR(255),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

    await executeQuery(`DROP TRIGGER IF EXISTS update_projects_updated_at ON projects`);
    await executeQuery(`
      CREATE TRIGGER update_projects_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    // Create journey_items table (NEW)
    console.log('Creating journey_items table...');
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS journey_items (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        company VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE,
        type VARCHAR(50) NOT NULL CHECK (type IN ('education', 'work', 'project', 'achievement')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executeQuery(`DROP TRIGGER IF EXISTS update_journey_items_updated_at ON journey_items`);
    await executeQuery(`
      CREATE TRIGGER update_journey_items_updated_at
      BEFORE UPDATE ON journey_items
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
        username VARCHAR(255) NOT NULL UNIQUE,
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

    await executeQuery(`
      CREATE OR REPLACE FUNCTION update_last_updated_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.last_updated = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await executeQuery(`DROP TRIGGER IF EXISTS update_github_stats_last_updated ON github_stats`);
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
        category VARCHAR(100),
        featured_image VARCHAR(255),
        tags JSONB,
        status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        author_id INT,
        views INT DEFAULT 0,
        likes INT DEFAULT 0,
        reading_time INT DEFAULT 5,
        featured BOOLEAN DEFAULT FALSE,
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await executeQuery(`DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts`);
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

    console.log('✔ Database initialized successfully with all tables including journey_items');
  } catch (error) {
    console.error('✗ Error initializing database:', error.message, error.stack);
    throw error;
  }
};

const createInitialAdmin = async () => {
  try {
    console.log('Creating/resetting initial admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const existingAdmin = await executeQuery(
      'SELECT * FROM users WHERE email = $1',
      ['syedazadarhussayn@gmail.com']
    );

    if (existingAdmin.length === 0) {
      await executeQuery(
        'INSERT INTO users (email, password, role) VALUES ($1, $2, $3)',
        ['syedazadarhussayn@gmail.com', hashedPassword, 'admin']
      );
      console.log('✔ Initial admin user created with email: syedazadarhussayn@gmail.com');
    } else {
      await executeQuery(
        'UPDATE users SET password = $1 WHERE email = $2',
        [hashedPassword, 'syedazadarhussayn@gmail.com']
      );
      console.log('✔ Admin user password reset');
    }
  } catch (error) {
    console.error('✗ Error creating/resetting initial admin:', error.message);
  }
};

export { pool, executeQuery, initDatabase, createInitialAdmin };