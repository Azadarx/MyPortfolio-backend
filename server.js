// server.js - FIXED VERSION with proper route loading
import express from "express";
import cors from "cors";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initDatabase, createInitialAdmin } from "./server/db.js";
import errorHandler from "./middleware/errorHandler.js";

// Import routes at the top level (FIXED)
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
const server = http.createServer(app);

// ========================================
// CORS Configuration
// ========================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  allowedOrigins.push(
    'http://localhost:5173',
    'http://localhost:3000',
    'https://syedazadarhussayn.vercel.app',
    'https://syedazadarhussayn-habxy1n2p-quickjoins-projects.vercel.app'
  );
  console.warn('⚠️ No ALLOWED_ORIGINS configured, using defaults');
}

console.log('🌐 Allowed CORS Origins:', allowedOrigins);

// FIX: match Vercel subdomains + allow null origin (Socket polling)
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      console.log("🔵 No origin -> allowed");
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some(o =>
      origin === o || origin.startsWith(o.replace("https://", "").split(".")[0])
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log("❌ Blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


// ========================================
// Socket.IO Configuration
// ========================================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/socket.io/',
  transports: ["websocket"],  
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true
});

const clients = new Set();

io.on("connection", (socket) => {
  console.log("✅ Socket client connected:", socket.id);
  clients.add(socket);

  socket.join("analytics");
  socket.join("chatbot");

  socket.on("disconnect", (reason) => {
    console.log("🔌 Socket client disconnected:", socket.id, "-", reason);
    clients.delete(socket);
  });

  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
    clients.delete(socket);
  });
});

app.set("io", io);


// ========================================
// Middleware
// ========================================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// ========================================
// Mount Routes BEFORE initialization
// ========================================
console.log("🛣️ Mounting routes...");

try {
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectRoutes);
  app.use("/api/skills", skillsRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/blog", blogRoutes);
  app.use("/api/chatbot", chatbotRoutes);
  app.use("/api/journey", journeyRoutes);
  
  console.log("✅ All routes mounted successfully");
} catch (error) {
  console.error("❌ Route mounting error:", error);
  throw error;
}

// ========================================
// Static File Serving
// ========================================
app.use(
  "/Uploads",
  express.static(path.join(__dirname, "Uploads"), {
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  })
);

// ========================================
// Health Check & Root
// ========================================
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    database: "PostgreSQL",
    socketConnected: clients.size,
    timestamp: new Date().toISOString() 
  });
});

app.get("/", (req, res) => {
  res.json({ 
    message: "Portfolio Backend API",
    status: "Running",
    version: "1.0.0",
    database: "PostgreSQL",
    socketClients: clients.size,
    endpoints: [
      "/api/auth - Authentication",
      "/api/projects - Projects CRUD",
      "/api/skills - Skills management",
      "/api/contact - Contact form",
      "/api/stats - GitHub & system stats",
      "/api/analytics - Visitor analytics",
      "/api/blog - Blog management",
      "/api/chatbot - AI chatbot",
      "/api/journey - Journey/Experience"
    ]
  });
});

// ========================================
// Initialize Database
// ========================================
const initializeServer = async () => {
  console.log("🔧 Initializing PostgreSQL database...");
  
  try {
    await initDatabase();
    console.log("✅ Database initialized");
    
    await createInitialAdmin();
    console.log("✅ Admin user setup complete");

  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    console.error(error.stack);
    throw error;
  }
};

// ========================================
// Error Handlers (AFTER all routes)
// ========================================
app.use("/api/*", (req, res) => {
  console.log("❌ 404 - Route not found:", req.method, req.path);
  res.status(404).json({ 
    message: "API endpoint not found",
    path: req.path,
    method: req.method,
    availableEndpoints: [
      "/api/auth",
      "/api/projects",
      "/api/skills",
      "/api/contact",
      "/api/stats",
      "/api/analytics",
      "/api/blog",
      "/api/chatbot",
      "/api/journey"
    ]
  });
});

app.use(errorHandler);

// ========================================
// Start Server
// ========================================
const PORT = process.env.PORT || 5000;

initializeServer()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║     🚀 Portfolio Backend Server Ready      ║
╠═══════════════════════════════════════════════╣
║  Port: ${PORT}                              
║  Database: PostgreSQL                      
║  Socket Clients: ${clients.size}                        
║  CORS Origins: ${allowedOrigins.length}                      
╠═══════════════════════════════════════════════╣
║  API Endpoints:                            
║  • /api/auth       - Authentication        
║  • /api/projects   - Projects CRUD         
║  • /api/skills     - Skills management     
║  • /api/contact    - Contact form          
║  • /api/stats      - GitHub stats          
║  • /api/analytics  - Visitor analytics     
║  • /api/blog       - Blog management       
║  • /api/chatbot    - AI chatbot            
║  • /api/journey    - Journey/Experience    
╚═══════════════════════════════════════════════╝
      `);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to initialize server:", error.message);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  console.log('🔴 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;