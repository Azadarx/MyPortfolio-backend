import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

import { executeQuery } from '../server/db.js';
import { isAuthenticated, isAdmin } from '../middleware/middleware.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'Uploads', 'projects');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const fileName = `${uuidv4()}-${file.originalname.replace(/\s/g, '_')}`;
    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Get all projects
router.get('/', async (req, res) => {
  try {
    const projects = await executeQuery('SELECT * FROM projects ORDER BY createdAt DESC');
    if (!projects) {
      console.error('No projects returned from database');
      return res.status(500).json({ message: 'Failed to fetch projects: No data returned' });
    }
    const formattedProjects = projects.map(project => ({
      ...project,
      imageUrl: project.imageurl || project.imageUrl,
      repoLink: project.repolink || project.repoLink,
      liveLink: project.livelink || project.liveLink,
      technologies: typeof project.technologies === 'string'
        ? project.technologies.split(',').map(tech => tech.trim())
        : project.technologies || []
    }));
    res.status(200).json(formattedProjects);
  } catch (error) {
    console.error('Error fetching projects:', error.message, error.stack);
    res.status(500).json({ message: 'Server error while fetching projects', error: error.message });
  }
});

// Get single project by ID
router.get('/:id', async (req, res) => {
  try {
    const projects = await executeQuery('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!projects || projects.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const project = projects[0];
    project.imageUrl = project.imageurl || project.imageUrl;
    project.technologies = typeof project.technologies === 'string'
      ? project.technologies.split(',').map(tech => tech.trim())
      : project.technologies || [];
    res.status(200).json(project);
  } catch (error) {
    console.error('Error fetching project:', error.message, error.stack);
    res.status(500).json({ message: 'Server error while fetching project', error: error.message });
  }
});

// Create a new project (admin only)
router.post('/', isAuthenticated, isAdmin, upload.single('projectImage'), async (req, res) => {
  try {
    const { title, description, technologies, repoLink, liveLink } = req.body;
    if (!title || !description || !technologies) {
      return res.status(400).json({ message: 'Title, description, and technologies are required' });
    }
    
    let imageUrl = null;
    let cloudinaryPublicId = null;
    
    // Upload to Cloudinary if image exists
    if (req.file) {
      const { uploadToCloudinary } = await import('../config/cloudinary.js');
      const uploadResult = await uploadToCloudinary(req.file.path, 'portfolio/projects');
      imageUrl = uploadResult.url;
      cloudinaryPublicId = uploadResult.publicId;
      
      // Delete local file after upload
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    
    const techString = Array.isArray(technologies) ? technologies.join(',') : technologies;
    const result = await executeQuery(
      'INSERT INTO projects (title, description, technologies, repolink, livelink, imageurl, cloudinary_public_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, createdat',
      [title, description, techString, repoLink || null, liveLink || null, imageUrl, cloudinaryPublicId]
    );
    
    const newProject = {
      id: result[0].id,
      title,
      description,
      technologies: techString.split(',').map(tech => tech.trim()),
      repoLink,
      liveLink,
      imageUrl,
      createdAt: result[0].createdat
    };
    
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error.message, error.stack);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Server error while creating project', error: error.message });
  }
}); 

// Update a project (admin only)
router.put('/:id', isAuthenticated, isAdmin, upload.single('projectImage'), async (req, res) => {
  try {
    const { title, description, technologies, repoLink, liveLink } = req.body;
    const projectId = req.params.id;
    
    if (!title || !description || !technologies) {
      return res.status(400).json({ message: 'Title, description, and technologies are required' });
    }
    
    const existingProjects = await executeQuery('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!existingProjects || existingProjects.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const existingProject = existingProjects[0];
    
    let imageUrl = existingProject.imageurl;
    let cloudinaryPublicId = existingProject.cloudinary_public_id;
    
    // Upload new image to Cloudinary if provided
    if (req.file) {
      const { uploadToCloudinary, deleteFromCloudinary } = await import('../config/cloudinary.js');
      
      // Delete old image from Cloudinary
      if (existingProject.cloudinary_public_id) {
        await deleteFromCloudinary(existingProject.cloudinary_public_id);
      }
      
      // Upload new image
      const uploadResult = await uploadToCloudinary(req.file.path, 'portfolio/projects');
      imageUrl = uploadResult.url;
      cloudinaryPublicId = uploadResult.publicId;
      
      // Delete local file after upload
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    
    const techString = Array.isArray(technologies) ? technologies.join(',') : technologies;
    await executeQuery(
      'UPDATE projects SET title = $1, description = $2, technologies = $3, repolink = $4, livelink = $5, imageurl = $6, cloudinary_public_id = $7 WHERE id = $8',
      [title, description, techString, repoLink || null, liveLink || null, imageUrl, cloudinaryPublicId, projectId]
    );
    
    const updatedProject = {
      id: parseInt(projectId),
      title,
      description,
      technologies: techString.split(',').map(tech => tech.trim()),
      repoLink,
      liveLink,
      imageUrl,
      updatedAt: new Date()
    };
    
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error.message, error.stack);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Server error while updating project', error: error.message });
  }
});

// Delete a project (admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const projects = await executeQuery('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!projects || projects.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const project = projects[0];
    
    // Delete from Cloudinary if public_id exists
    if (project.cloudinary_public_id) {
      const { deleteFromCloudinary } = await import('../config/cloudinary.js');
      await deleteFromCloudinary(project.cloudinary_public_id);
    }
    
    await executeQuery('DELETE FROM projects WHERE id = $1', [projectId]);
    
    res.status(200).json({ message: 'Project deleted successfully', id: projectId });
  } catch (error) {
    console.error('Error deleting project:', error.message, error.stack);
    res.status(500).json({ message: 'Server error while deleting project', error: error.message });
  }
});
export default router;