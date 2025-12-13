import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

import { executeQuery } from "../server/db.js";
import { isAuthenticated, isAdmin } from "../middleware/middleware.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer Storage for Skills
const skillStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "..", "Uploads", "skills");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const fileName = `${uuidv4()}-${file.originalname.replace(/\s/g, "_")}`;
    cb(null, fileName);
  }
});

const uploadSkillIcon = multer({
  storage: skillStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed!"), false);
    }
    cb(null, true);
  }
});

// Get All Skills
router.get("/", async (req, res) => {
  try {
    const skills = await executeQuery("SELECT * FROM skills ORDER BY createdAt DESC");

    const formatted = skills.map(s => ({
      ...s,
      iconUrl: s.iconurl || s.iconUrl
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching skills:", error);
    res.status(500).json({ message: "Server error while fetching skills", error: error.message });
  }
});

// Add New Skill
router.post("/", isAuthenticated, isAdmin, uploadSkillIcon.single("iconFile"), async (req, res) => {
  try {
    const { name, level, category } = req.body;

    if (!name || !level || !category) {
      return res.status(400).json({ message: "Name, level, and category are required" });
    }

    let iconUrl = null;
    if (req.file) {
      iconUrl = `/Uploads/skills/${req.file.filename}`;
    }

    const result = await executeQuery(
      "INSERT INTO skills (name, level, category, iconUrl) VALUES ($1, $2, $3, $4) RETURNING id, createdAt",
      [name, level, category, iconUrl]
    );

    const newSkill = {
      id: result[0].id,
      name,
      level,
      category,
      iconUrl,
      createdAt: result[0].createdAt,
    };

    res.status(201).json(newSkill);
  } catch (error) {
    console.error("Error adding new skill:", error);
    res.status(500).json({ message: "Server error while adding skill", error: error.message });
  }
});

// Update Skill
router.put("/:id", isAuthenticated, isAdmin, uploadSkillIcon.single("iconFile"), async (req, res) => {
  try {
    const skillId = req.params.id;
    const { name, level, category, iconUrl: existingIconUrl } = req.body;

    if (!name || !level || !category) {
      return res.status(400).json({ message: "Name, level, and category are required" });
    }

    const skills = await executeQuery("SELECT * FROM skills WHERE id=$1", [skillId]);
    if (!skills || skills.length === 0) {
      return res.status(404).json({ message: "Skill not found" });
    }
    const oldSkill = skills[0];
    const oldIconPath = oldSkill.iconurl ? path.join(__dirname, '..', 'Uploads', 'skills', path.basename(oldSkill.iconurl)) : null;

    let finalIconUrl = existingIconUrl || null;

    if (req.file) {
      finalIconUrl = `/Uploads/skills/${req.file.filename}`;
      if (oldIconPath && fs.existsSync(oldIconPath)) {
        fs.unlinkSync(oldIconPath);
      }
    } else if (!existingIconUrl && oldIconPath) {
      finalIconUrl = null;
      if (fs.existsSync(oldIconPath)) {
        fs.unlinkSync(oldIconPath);
      }
    }

    const updateQuery = `
      UPDATE skills
      SET name = $1, level = $2, category = $3, iconUrl = $4, updatedAt = CURRENT_TIMESTAMP
      WHERE id = $5
    `;

    await executeQuery(updateQuery, [name, level, category, finalIconUrl, skillId]);

    const updatedSkill = {
      id: skillId,
      name,
      level,
      category,
      iconUrl: finalIconUrl,
      updatedAt: new Date()
    };

    res.status(200).json(updatedSkill);
  } catch (error) {
    console.error("Error updating skill:", error);
    res.status(500).json({ message: "Server error while updating skill", error: error.message });
  }
});

// Delete Skill
router.delete("/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const skillId = req.params.id;

    const skills = await executeQuery("SELECT * FROM skills WHERE id=$1", [skillId]);
    if (!skills || skills.length === 0) {
      return res.status(404).json({ message: "Skill not found" });
    }

    const skill = skills[0];

    if (skill.iconurl) {
      const iconPath = path.join(
        __dirname,
        "..",
        "Uploads",
        "skills",
        path.basename(skill.iconurl)
      );
      if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
    }

    await executeQuery("DELETE FROM skills WHERE id=$1", [skillId]);

    res.status(200).json({ message: "Skill deleted successfully", id: skillId });
  } catch (error) {
    console.error("Error deleting skill:", error);
    res.status(500).json({ message: "Server error while deleting skill", error: error.message });
  }
});

export default router;