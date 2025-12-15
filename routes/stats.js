// routes/stats.js - MISSING FILE - Create this
import express from 'express';
import axios from 'axios';
import { executeQuery } from '../server/db.js';
import { isAuthenticated, isAdmin } from '../middleware/middleware.js';

const router = express.Router();

// Get GitHub stats
router.get('/github', async (req, res) => {
  try {
    const username = process.env.GITHUB_USERNAME || 'azadarx'; // Your actual GitHub username
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({ 
        message: 'GitHub token not configured',
        error: 'GITHUB_TOKEN environment variable is missing'
      });
    }

    // Fetch user data
    const userResponse = await axios.get(`https://api.github.com/users/${username}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    // Fetch repositories
    const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const userData = userResponse.data;
    const repos = reposResponse.data;

    // Calculate stats
    const totalStars = repos.reduce((acc, repo) => acc + repo.stargazers_count, 0);
    const totalForks = repos.reduce((acc, repo) => acc + repo.forks_count, 0);
    
    // Get languages
    const languages = {};
    repos.forEach(repo => {
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
      }
    });

    const stats = {
      username: userData.login,
      public_repos: userData.public_repos,
      followers: userData.followers,
      following: userData.following,
      total_stars: totalStars,
      total_forks: totalForks,
      languages: languages,
      repositories: repos.map(repo => ({
        name: repo.name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        url: repo.html_url
      }))
    };

    // Store in database for caching
    try {
      await executeQuery(`
        INSERT INTO github_stats 
        (username, public_repos, followers, following, total_stars, total_forks, languages, repositories)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (username) 
        DO UPDATE SET 
          public_repos = $2,
          followers = $3,
          following = $4,
          total_stars = $5,
          total_forks = $6,
          languages = $7,
          repositories = $8,
          last_updated = CURRENT_TIMESTAMP
      `, [
        stats.username,
        stats.public_repos,
        stats.followers,
        stats.following,
        stats.total_stars,
        stats.total_forks,
        JSON.stringify(stats.languages),
        JSON.stringify(stats.repositories)
      ]);
    } catch (dbError) {
      console.error('Database cache error:', dbError);
      // Continue even if caching fails
    }

    res.json(stats);
  } catch (error) {
    console.error('GitHub API error:', error.message);
    
    // Try to return cached data
    try {
      const username = process.env.GITHUB_USERNAME || 'azadarx';
      const cached = await executeQuery(
        'SELECT * FROM github_stats WHERE username = $1',
        [username]
      );
      if (cached && cached.length > 0) {
        console.log('Returning cached GitHub stats');
        const cachedData = cached[0];
        return res.json({
          ...cachedData,
          cached: true,
          last_updated: cachedData.last_updated
        });
      }
    } catch (cacheError) {
      console.error('Cache retrieval error:', cacheError);
    }

    res.status(503).json({ 
      message: 'Failed to fetch GitHub stats',
      error: error.message,
      hint: 'Check GITHUB_TOKEN and rate limits'
    });
  }
});

// Get system stats (admin only)
router.get('/system', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    console.error('System stats error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch system stats',
      error: error.message 
    });
  }
});

export default router;