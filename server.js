import express from "express";
import cors from "cors";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initDatabase, createInitialAdmin } from "./server/db.js";
import errorHandler from "./middleware/errorHandler.js";

// Import routes
import authRouter from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import skillsRoutes from "./routes/skills.js";
import contactRoutes from "./routes/contact.js";
import statsRoutes from "./routes/stats.js";
import analyticsRoutes from "./routes/analytics.js";
import blogRoutes from "./routes/blog.js";
import chatbotRoutes from "./routes/chatbot.js";
import journeyRoutes from "./routes/journey.js";

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://syedazadarhussayn.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

console.log('🔧 Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('🌐 Allowed CORS Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, Render health checks)
    if (!origin) {
      console.log('✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    // Check exact match
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Allowed origin:', origin);
      return callback(null, true);
    }
    
    // Allow all Vercel preview deployments
    if (origin.endsWith('.vercel.app')) {
      console.log('✅ Allowed Vercel preview:', origin);
      return callback(null, true);
    }
    // In development, allow all localhost variations
    if (isDevelopment && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      console.log('✅ Allowed development origin:', origin);
      return callback(null, true);
    }
    console.log("⚠️ Origin not in allowlist (but allowing anyway for Render):", origin);
    // IMPORTANT: For Render free tier, we'll allow the request but log it
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware FIRST
app.use(cors(corsOptions));

// Handle preflight for all routes
app.options("*", cors(corsOptions));

// Add additional CORS headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  next();
});

// ========================================
// Middleware
// ========================================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ========================================
// Health Check Route (before other routes)
// ========================================
app.get("/", (req, res) => {
  res.json({ 
    message: "Portfolio Backend API",
    status: "Running",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    database: "PostgreSQL",
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========================================
// Mount API Routes
// ========================================
app.use("/api/auth", authRouter);
app.use("/api/projects", projectRoutes);
app.use("/api/skills", skillsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/journey", journeyRoutes);

// ========================================
// Static Files - CROSS-ORIGIN ENABLED
// ========================================
app.use(
  "/Uploads",
  express.static(path.join(__dirname, "Uploads"), {
    fallthrough: true,
    setHeaders: (res, filePath) => {
      // Allow cross-origin access to uploaded files
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      
      // Set correct content type
      if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader("Content-Type", "image/jpeg");
      } else if (filePath.endsWith('.png')) {
        res.setHeader("Content-Type", "image/png");
      } else if (filePath.endsWith('.gif')) {
        res.setHeader("Content-Type", "image/gif");
      } else if (filePath.endsWith('.webp')) {
        res.setHeader("Content-Type", "image/webp");
      }
    },
  })
);

// Fallback for missing uploads
app.use("/Uploads/*", (req, res) => {
  console.log("⚠️ File not found:", req.path);
  res.status(404).json({ 
    message: "File not found",
    path: req.path 
  });
});

// ========================================
// Error Handlers
// ========================================
app.use("/api/*", (req, res) => {
  console.log("⚠️ API endpoint not found:", req.path);
  res.status(404).json({ 
    message: "API endpoint not found",
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use(errorHandler);

// ========================================
// Initialize & Start Server
// ========================================
const PORT = process.env.PORT || 5000;

const initializeServer = async () => {
  try {
    console.log('🔄 Initializing database...');
    await initDatabase();
    console.log("✅ Database initialized successfully");
    
    console.log('🔄 Setting up admin user...');
    await createInitialAdmin();
    console.log("✅ Admin user ready");
    
    return true;
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    console.error("Stack trace:", error.stack);
    throw error;
  }
};

initializeServer()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════╗
║     🚀 Server Running on Port ${PORT}        ║
╠═══════════════════════════════════════════╣
║  Database: PostgreSQL ✅                  ║
║  CORS: Enabled for Vercel ✅              ║
║  Static Files: /Uploads ✅                ║
║  Health Check: /api/health ✅             ║
╚═══════════════════════════════════════════╝
      `);
      
      console.log('\n📋 Available Routes:');
      console.log('  GET  /api/health');
      console.log('  POST /api/auth/login');
      console.log('  GET  /api/skills');
      console.log('  GET  /api/projects');
      console.log('  GET  /api/journey');
      console.log('  GET  /api/stats/github');
      console.log('  POST /api/contact');
      console.log('\n🌐 Accepting connections from:');
      allowedOrigins.forEach(origin => console.log(`  - ${origin}`));
      console.log('  - *.vercel.app (all Vercel deployments)\n');
    });
  })
  .catch((error) => {
    console.error("❌ Server initialization failed:", error.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔴 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔴 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;