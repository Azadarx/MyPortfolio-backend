// server.js - COMPLETE FIXED VERSION
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
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
  console.warn('⚠️ No ALLOWED_ORIGINS configured, using defaults');
}

console.log('🌍 Allowed CORS Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
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
  transports: ["websocket", "polling"],
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
// Initialize Server
// ========================================
const initializeServer = async () => {
  console.log("🔧 Initializing PostgreSQL database...");
  
  try {
    await initDatabase();
    console.log("✅ Database initialized");
    
    await createInitialAdmin();
    console.log("✅ Admin user setup complete");

    console.log("🛣️ Mounting routes...");
    
    const authRouter = (await import("./routes/auth.js")).default;
    const projectRoutes = (await import("./routes/projects.js")).default;
    const skillsRoutes = (await import("./routes/skills.js")).default;
    const contactRoutes = (await import("./routes/contact.js")).default;
    const statsRoutes = (await import("./routes/stats.js")).default;
    const analyticsRoutes = (await import("./routes/analytics.js")).default;
    const blogRoutes = (await import("./routes/blog.js")).default;
    const chatbotRoutes = (await import("./routes/chatbot.js")).default;
    const journeyRoutes = (await import("./routes/journey.js")).default;

    // Mount all routes with /api prefix
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
    // Error Handlers
    // ========================================
    
    app.use("/api/*", (req, res) => {
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

  } catch (error) {
    console.error("❌ Server setup failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

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