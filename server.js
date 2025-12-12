// server.js - Socket.IO Configuration for Render Free Tier
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
    'https://syedazadarhussayn.vercel.app'
  );
}

console.log('🌐 Allowed CORS Origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    console.log("❌ Blocked origin:", origin);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ========================================
// Socket.IO - OPTIMIZED FOR RENDER FREE TIER
// ========================================
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      const isAllowed = allowedOrigins.some(allowedOrigin => 
        origin === allowedOrigin || origin.endsWith('.vercel.app')
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log("❌ Socket blocked origin:", origin);
        callback(new Error('CORS not allowed'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/socket.io/',
  // CRITICAL FOR RENDER FREE TIER: Start with polling
  transports: ["polling", "websocket"],
  allowUpgrades: true,
  upgradeTimeout: 30000,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  // RENDER FREE TIER: Disable compression
  perMessageDeflate: false,
  httpCompression: false,
  // Keep connections alive
  cookie: false,
  serveClient: false
});

const clients = new Map();

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id, "Transport:", socket.conn.transport.name);
  clients.set(socket.id, socket);

  socket.join("analytics");
  socket.join("chatbot");

  socket.conn.on("upgrade", (transport) => {
    console.log("⬆️ Socket upgraded to:", transport.name);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔌 Socket disconnected:", socket.id, "-", reason);
    clients.delete(socket.id);
  });

  socket.on("error", (error) => {
    console.error("❌ Socket error:", socket.id, error.message);
    clients.delete(socket.id);
  });
});

app.set("io", io);

// ========================================
// Middleware
// ========================================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ========================================
// Mount Routes
// ========================================
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    database: "PostgreSQL",
    socketConnections: clients.size,
    timestamp: new Date().toISOString() 
  });
});

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
// Static Files
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
// Root Route
// ========================================
app.get("/", (req, res) => {
  res.json({ 
    message: "Portfolio Backend API",
    status: "Running",
    socketConnections: clients.size
  });
});

// ========================================
// Error Handlers
// ========================================
app.use("/api/*", (req, res) => {
  res.status(404).json({ 
    message: "API endpoint not found",
    path: req.path
  });
});

app.use(errorHandler);

// ========================================
// Initialize & Start Server
// ========================================
const PORT = process.env.PORT || 5000;

const initializeServer = async () => {
  try {
    await initDatabase();
    console.log("✅ Database initialized");
    
    await createInitialAdmin();
    console.log("✅ Admin user ready");
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    throw error;
  }
};

initializeServer()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════╗
║     🚀 Server Running on Port ${PORT}        ║
╠═══════════════════════════════════════════╣
║  Socket Connections: ${clients.size}                      
║  Database: PostgreSQL                     
╚═══════════════════════════════════════════╝
      `);
    });
  })
  .catch((error) => {
    console.error("❌ Server initialization failed:", error.message);
    process.exit(1);
  });

// Keep server alive on Render free tier
setInterval(() => {
  console.log(`💓 Keepalive - ${clients.size} socket(s) connected`);
}, 50000);

process.on('SIGTERM', () => {
  console.log('🔴 SIGTERM received, shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;