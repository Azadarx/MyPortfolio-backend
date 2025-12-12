// server.js - Fixed version
import express from "express";
import cors from "cors";
import path from "path";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import errorHandler from "./middleware/errorHandler.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom modules
import { initDatabase, createInitialAdmin } from "./server/db.js";

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Parse ALLOWED_ORIGINS safely
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(",").map(o => o.trim()).filter(Boolean);

// Add fallback if no origins configured
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
  console.warn('Warning: No ALLOWED_ORIGINS configured, using defaults');
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Socket.IO config with fixed CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  path: '/socket.io/',  // Explicit path
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Store connected clients
const clients = new Set();

// Socket.IO for real-time updates
io.on("connection", (socket) => {
  console.log("✓ Socket.IO client connected:", socket.id);
  clients.add(socket);

  // Join analytics room for real-time updates
  socket.join("analytics");
  socket.join("chatbot");

  socket.on("message", (message) => {
    console.log("Received message:", message);
  });

  socket.on("disconnect", () => {
    console.log("Socket.IO client disconnected:", socket.id);
    clients.delete(socket);
  });

  socket.on("error", (error) => {
    console.error("Socket.IO error:", error);
    clients.delete(socket);
  });
});

// Make io available to routes
app.set("io", io);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

const initializeServer = async () => {
  console.log("Initializing PostgreSQL database...");
  try {
    await initDatabase();
    console.log("PostgreSQL database initialized successfully");
    
    console.log("Creating initial admin user...");
    await createInitialAdmin();
    console.log("Initial admin user setup complete");

    // Dynamically import route modules
    console.log("Mounting routes...");
    const authRouter = (await import("./routes/auth.js")).default;
    const projectRoutes = (await import("./routes/projects.js")).default;
    const skillsRoutes = (await import("./routes/skills.js")).default;
    const contactRoutes = (await import("./routes/contact.js")).default;
    const statsRoutes = (await import("./routes/stats.js")).default;
    const analyticsRoutes = (await import("./routes/analytics.js")).default;
    const blogRoutes = (await import("./routes/blog.js")).default;
    const chatbotRoutes = (await import("./routes/chatbot.js")).default;

    // Mount routes
    app.use("/api/auth", authRouter);
    app.use("/api/projects", projectRoutes);
    app.use("/api/skills", skillsRoutes);
    app.use("/api/contact", contactRoutes);
    app.use("/api/analytics", analyticsRoutes);
    app.use("/api/stats", statsRoutes);
    app.use("/api/blog", blogRoutes);
    app.use("/api/chatbot", chatbotRoutes);

    // Health check endpoint
    app.get("/api/health", (req, res) => {
      res.json({ 
        status: "OK", 
        database: "PostgreSQL",
        socketConnected: io.engine.clientsCount,
        timestamp: new Date().toISOString() 
      });
    });

    // Root endpoint
    app.get("/", (req, res) => {
      res.json({ 
        message: "Portfolio Backend API",
        status: "Running",
        version: "1.0.0",
        endpoints: [
          "/api/auth",
          "/api/projects",
          "/api/skills",
          "/api/contact",
          "/api/stats",
          "/api/analytics",
          "/api/blog",
          "/api/chatbot"
        ]
      });
    });

    // Static file serving for uploads
    app.use(
      "/Uploads",
      express.static(path.join(__dirname, "Uploads"), {
        fallthrough: true,
        setHeaders: (res, filePath) => {
          res.setHeader("Cache-Control", "public, max-age=31536000");
          res.setHeader("Access-Control-Allow-Origin", "*");
        },
      })
    );

    // Error handler
    app.use(errorHandler);

    // 404 handler for API routes
    app.use("/api/*", (req, res) => {
      res.status(404).json({ 
        message: "API endpoint not found",
        path: req.path,
        availableEndpoints: [
          "/api/auth",
          "/api/projects",
          "/api/skills",
          "/api/contact",
          "/api/stats",
          "/api/analytics",
          "/api/blog",
          "/api/chatbot"
        ]
      });
    });

    console.log("All routes mounted successfully");
  } catch (error) {
    console.error("Server setup failed:", error.message, error.stack);
    console.error("Please ensure PostgreSQL is running and credentials are correct");
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

// Initialize server before starting to listen
initializeServer()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Database: PostgreSQL");
      console.log("Allowed origins:", allowedOrigins);
      console.log("Socket.IO path: /socket.io/");
      console.log("Available API endpoints:");
      console.log("- /api/auth/* - Authentication");
      console.log("- /api/projects/* - Projects CRUD");
      console.log("- /api/skills/* - Skills management");
      console.log("- /api/contact/* - Contact form");
      console.log("- /api/stats/* - GitHub & system stats");
      console.log("- /api/analytics/* - Visitor analytics");
      console.log("- /api/blog/* - Blog management");
      console.log("- /api/chatbot/* - AI chatbot");
    });
  })
  .catch((error) => {
    console.error("Failed to initialize server:", error.message, error.stack);
    console.error("Check PostgreSQL connection and database configuration");
    process.exit(1);
  });

export default app;