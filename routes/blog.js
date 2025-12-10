// routes/blog.js
import express from 'express';
import { executeQuery } from '../server/db.js';
import { isAuthenticated, isAdmin } from '../middleware/middleware.js';

const router = express.Router();

// Get all blog posts (public)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const category = req.query.category;
    const featured = req.query.featured;
    const offset = (page - 1) * limit;

    let baseQuery = `
      SELECT id, title, excerpt, content, tags, featured_image, author_id, published_at, updated_at, views, likes, reading_time, status, featured, slug
      FROM blog_posts
      WHERE status = 'published'
    `;
    const params = [];
    let idx = 1;

    if (category) {
      baseQuery += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (featured === 'true') {
      baseQuery += ` AND featured = true`;
    }

    baseQuery += ` ORDER BY published_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const posts = await executeQuery(baseQuery, params);

    // Total count for pagination
    let countQuery = `SELECT COUNT(*)::int AS total FROM blog_posts WHERE status = 'published'`;
    const countParams = [];
    if (category) {
      countQuery += ` AND category = $1`;
      countParams.push(category);
    }
    const totalCountRows = await executeQuery(countQuery, countParams);
    const total = totalCountRows[0]?.total || 0;

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Blog posts fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch blog posts', error: error.message });
  }
});

// Get single blog post by slug
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const posts = await executeQuery(`
      SELECT id, title, excerpt, content, category, featured_image, author_id as author, published_at, updated_at, views, likes, reading_time, status, tags, featured, slug
      FROM blog_posts
      WHERE slug = $1 AND status = 'published'
    `, [slug]);

    if (!posts || posts.length === 0) return res.status(404).json({ message: 'Blog post not found' });

    const post = posts[0];

    // Increment view count
    await executeQuery('UPDATE blog_posts SET views = views + 1 WHERE id = $1', [post.id]);

    // Related posts
    const relatedPosts = await executeQuery(`
      SELECT id, title, excerpt, featured_image, published_at, reading_time, slug
      FROM blog_posts
      WHERE category = $1 AND id != $2 AND status = 'published'
      ORDER BY published_at DESC
      LIMIT 3
    `, [post.category, post.id]);

    res.json({
      post: {
        ...post,
        views: (post.views || 0) + 1
      },
      relatedPosts
    });
  } catch (error) {
    console.error('Blog post fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch blog post', error: error.message });
  }
});

// Get blog categories
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await executeQuery(`
      SELECT category, COUNT(*)::int as count
      FROM blog_posts
      WHERE status = 'published'
      GROUP BY category
      ORDER BY count DESC
    `);
    res.json(categories);
  } catch (error) {
    console.error('Blog categories fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch blog categories', error: error.message });
  }
});

// Get blog statistics
router.get('/meta/stats', async (req, res) => {
  try {
    const [
      totalPostsRows,
      totalViewsRows,
      totalLikesRows,
      featuredPostsRows,
      recentPosts
    ] = await Promise.all([
      executeQuery(`SELECT COUNT(*)::int as count FROM blog_posts WHERE status = 'published'`),
      executeQuery(`SELECT COALESCE(SUM(views),0)::int as total FROM blog_posts WHERE status = 'published'`),
      executeQuery(`SELECT COALESCE(SUM(likes),0)::int as total FROM blog_posts WHERE status = 'published'`),
      executeQuery(`SELECT COUNT(*)::int as count FROM blog_posts WHERE featured = true AND status = 'published'`),
      executeQuery(`
        SELECT title, published_at, views, likes, slug
        FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC
        LIMIT 5
      `)
    ]);

    res.json({
      totalPosts: totalPostsRows[0]?.count || 0,
      totalViews: totalViewsRows[0]?.total || 0,
      totalLikes: totalLikesRows[0]?.total || 0,
      featuredPosts: featuredPostsRows[0]?.count || 0,
      recentPosts
    });
  } catch (error) {
    console.error('Blog stats fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch blog statistics', error: error.message });
  }
});

// Like a blog post
router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    await executeQuery('UPDATE blog_posts SET likes = COALESCE(likes,0) + 1 WHERE id = $1', [id]);
    const post = await executeQuery('SELECT likes FROM blog_posts WHERE id = $1', [id]);
    if (!post || post.length === 0) return res.status(404).json({ message: 'Blog post not found' });

    const io = req.app.get('io');
    if (io) io.emit('blog_liked', { postId: id, likes: post[0].likes });

    res.json({ likes: post[0].likes });
  } catch (error) {
    console.error('Blog like error:', error);
    res.status(500).json({ message: 'Failed to like blog post', error: error.message });
  }
});

// Create new blog post (Admin only)
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const {
      title,
      excerpt,
      content,
      category,
      featured_image,
      author,
      reading_time,
      tags,
      featured = false,
      status = 'draft'
    } = req.body;

    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const insertSql = `
      INSERT INTO blog_posts
      (title, excerpt, content, category, featured_image, author_id, reading_time, tags, featured, status, slug, published_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      RETURNING id
    `;
    const tagsValue = tags ? JSON.stringify(tags) : null;
    const publishedAt = status === 'published' ? new Date() : null;

    const rows = await executeQuery(insertSql, [
      title, excerpt, content, category, featured_image, author, reading_time, tagsValue, featured, status, slug, publishedAt
    ]);

    const insertedId = rows[0]?.id;

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('new_blog_post', {
        id: insertedId,
        title,
        status,
        author: req.user.email
      });
    }

    res.status(201).json({
      id: insertedId,
      message: 'Blog post created successfully',
      slug
    });
  } catch (error) {
    console.error('Blog post creation error:', error);
    res.status(500).json({ message: 'Failed to create blog post', error: error.message });
  }
});

// Update blog post (Admin only)
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.status === 'published') {
      updateData.published_at = new Date();
    }

    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    if (fields.length === 0) return res.status(400).json({ message: 'No fields to update' });

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const sql = `UPDATE blog_posts SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`;
    await executeQuery(sql, [...values, id]);

    const io = req.app.get('io');
    if (io) io.emit('blog_post_updated', { id, ...updateData, updatedBy: req.user.email });

    res.json({ message: 'Blog post updated successfully' });
  } catch (error) {
    console.error('Blog post update error:', error);
    res.status(500).json({ message: 'Failed to update blog post', error: error.message });
  }
});

// Delete blog post (Admin only)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await executeQuery('DELETE FROM blog_posts WHERE id = $1', [id]);

    const io = req.app.get('io');
    if (io) io.emit('blog_post_deleted', { id, deletedBy: req.user.email });

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Blog post deletion error:', error);
    res.status(500).json({ message: 'Failed to delete blog post', error: error.message });
  }
});

export default router;
