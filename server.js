// server.js - PostgreSQL compatible version
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

// CORS configuration
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: corsOptions.methods,
    credentials: true,
  },
});

// Store connected clients
const clients = new Set();

// Socket.IO for real-time updates
io.on("connection", (socket) => {
  console.log("Socket.IO client connected:", socket.id);
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

// Function to broadcast to all clients
const broadcastToClients = (event, data) => {
  io.emit(event, { event, data });
};

// Make io available to routes
app.set("io", io);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

    // Import new routes
    const statsRoutes = (await import("./routes/stats.js")).default;
    const analyticsRoutes = (await import("./routes/analytics.js")).default;
    const blogRoutes = (await import("./routes/blog.js")).default;
    const chatbotRoutes = (await import("./routes/chatbot.js")).default;

    // Mount existing routes
    app.use("/api/auth", authRouter);
    app.use("/api/projects", projectRoutes);
    app.use("/api/skills", skillsRoutes);
    app.use("/api/contact", contactRoutes);

    // Mount new routes
    app.use("/api/analytics", analyticsRoutes);
    app.use("/api/stats", statsRoutes);
    app.use("/api/blog", blogRoutes);
    app.use("/api/chatbot", chatbotRoutes);

    // Health check endpoint
    app.get("/api/health", (req, res) => {
      res.json({ 
        status: "OK", 
        database: "PostgreSQL",
        timestamp: new Date().toISOString() 
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

    // Production setup
    if (process.env.NODE_ENV === "production") {
      app.use(express.static("client/build"));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
      });
    }

    // Error handler
    app.use(errorHandler);

    // 404 handler for API routes
    app.use("/api/*", (req, res) => {
      res.status(404).json({ message: "API endpoint not found" });
    });

    console.log("All routes mounted successfully");
  } catch (error) {
    console.error("Server setup failed:", error.message, error.code, error.stack);
    console.error("Please ensure PostgreSQL is running and credentials are correct");
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

// Initialize server before starting to listen
initializeServer()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Database: PostgreSQL");
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
    console.error("Failed to initialize server:", error.message, error.code, error.stack);
    console.error("Check PostgreSQL connection and database configuration");
    process.exit(1);
  });

export default app;