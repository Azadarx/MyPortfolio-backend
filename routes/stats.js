// routes/stats.js - Fixed with better error handling and GitHub token validation
import express from "express";
import axios from "axios";
import { executeQuery } from "../server/db.js";

const router = express.Router();

// GitHub configuration
const GITHUB_USERNAME = "azadarx";
const GITHUB_API_BASE = "https://api.github.com";
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Validate GitHub token on startup
const validateGitHubToken = async () => {
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠️ GITHUB_TOKEN not configured - API will have limited rate limits');
    return false;
  }

  try {
    const response = await axios.get(`${GITHUB_API_BASE}/user`, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` },
      timeout: 5000
    });
    console.log('✅ GitHub token validated for user:', response.data.login);
    return true;
  } catch (error) {
    console.error('❌ GitHub token validation failed:', error.response?.data?.message || error.message);
    console.error('   Please generate a new token at: https://github.com/settings/tokens');
    console.error('   Required scopes: repo, read:user');
    return false;
  }
};

// Validate token on module load
validateGitHubToken();

// Get GitHub statistics
router.get("/github", async (req, res) => {
  try {
    // Check cache first
    const cachedStats = await executeQuery(
      "SELECT * FROM github_stats WHERE last_updated > NOW() - INTERVAL '15 minutes' ORDER BY last_updated DESC LIMIT 1"
    );

    if (cachedStats && cachedStats.length > 0) {
      console.log('📦 Returning cached GitHub stats');
      return res.json({
        ...cachedStats[0],
        cached: true,
        cacheAge: Date.now() - new Date(cachedStats[0].last_updated).getTime()
      });
    }

    // Validate token exists
    if (!process.env.GITHUB_TOKEN) {
      console.error('❌ GITHUB_TOKEN not configured');
      
      // Try to return stale cache
      const staleCache = await executeQuery(
        "SELECT * FROM github_stats ORDER BY last_updated DESC LIMIT 1"
      );
      
      if (staleCache && staleCache.length > 0) {
        return res.json({
          ...staleCache[0],
          cached: true,
          stale: true,
          warning: "Using stale cache - GitHub token not configured"
        });
      }

      return res.status(503).json({ 
        message: "GitHub API unavailable",
        error: "GITHUB_TOKEN not configured",
        suggestion: "Please configure GITHUB_TOKEN environment variable"
      });
    }

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json'
    };

    console.log('🔍 Fetching fresh GitHub stats for:', GITHUB_USERNAME);

    let userResponse, reposResponse;
    
    try {
      [userResponse, reposResponse] = await Promise.all([
        axios.get(`${GITHUB_API_BASE}/users/${GITHUB_USERNAME}`, { 
          headers,
          timeout: 10000 
        }),
        axios.get(
          `${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`,
          { 
            headers,
            timeout: 10000 
          }
        ),
      ]);
    } catch (apiError) {
      const status = apiError.response?.status;
      const message = apiError.response?.data?.message;
      
      console.error(`❌ GitHub API Error [${status}]:`, message || apiError.message);
      
      if (status === 401 || status === 403) {
        console.error('   Token may be expired or invalid');
        console.error('   Generate new token at: https://github.com/settings/tokens');
      }
      
      // Return stale cache if API fails
      const lastCache = await executeQuery(
        "SELECT * FROM github_stats ORDER BY last_updated DESC LIMIT 1"
      );
      
      if (lastCache && lastCache.length > 0) {
        console.log('📦 Returning stale cache due to API error');
        return res.json({
          ...lastCache[0],
          cached: true,
          stale: true,
          cacheAge: Date.now() - new Date(lastCache[0].last_updated).getTime()
        });
      }
      
      return res.status(503).json({ 
        message: "GitHub API temporarily unavailable",
        error: message || "Service unavailable",
        status: status,
        suggestion: status === 401 || status === 403 
          ? "GitHub token is invalid or expired. Please update GITHUB_TOKEN."
          : "Please try again later"
      });
    }

    const userData = userResponse.data;
    const reposData = reposResponse.data;

    console.log(`✅ Fetched ${reposData.length} repositories`);

    // Calculate statistics
    const stats = {
      totalRepos: userData.public_repos,
      totalStars: reposData.reduce((sum, repo) => sum + repo.stargazers_count, 0),
      totalForks: reposData.reduce((sum, repo) => sum + repo.forks_count, 0),
      totalCommits: 0,
      followers: userData.followers,
      following: userData.following,
      languages: {},
      topRepos: reposData
        .filter((repo) => !repo.fork)
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, 5)
        .map((repo) => ({
          name: repo.name,
          description: repo.description,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          html_url: repo.html_url,
          updated_at: repo.updated_at,
        })),
      recentActivity: [],
    };

    // Get language statistics (limit to top 20 repos)
    const languagePromises = reposData.slice(0, 20).map(async (repo) => {
      try {
        const langResponse = await axios.get(
          `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo.name}/languages`,
          { headers, timeout: 5000 }
        );
        return langResponse.data;
      } catch (error) {
        console.log(`⚠️ Could not fetch languages for ${repo.name}`);
        return {};
      }
    });

    const languageResults = await Promise.all(languagePromises);
    
    languageResults.forEach(languages => {
      Object.entries(languages).forEach(([lang, bytes]) => {
        stats.languages[lang] = (stats.languages[lang] || 0) + bytes;
      });
    });

    // Convert language bytes to percentages
    const totalBytes = Object.values(stats.languages).reduce((sum, bytes) => sum + bytes, 0);
    if (totalBytes > 0) {
      Object.keys(stats.languages).forEach((lang) => {
        stats.languages[lang] = Math.round((stats.languages[lang] / totalBytes) * 100);
      });
    }

    // Get recent activity
    try {
      const eventsResponse = await axios.get(
        `${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/events?per_page=10`,
        { headers, timeout: 5000 }
      );
      stats.recentActivity = eventsResponse.data.slice(0, 5).map((event) => ({
        type: event.type,
        repo: event.repo?.name,
        created_at: event.created_at,
        payload: {
          action: event.payload?.action,
          ref: event.payload?.ref,
          commits: event.payload?.commits?.length || 0,
        },
      }));
    } catch (error) {
      console.log('⚠️ Could not fetch recent activity');
    }

    // Cache the results
    try {
      await executeQuery(
        `INSERT INTO github_stats (username, public_repos, followers, following, total_commits, total_stars, total_forks, languages, repositories, last_updated) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (username) 
         DO UPDATE SET 
           public_repos = EXCLUDED.public_repos,
           followers = EXCLUDED.followers,
           following = EXCLUDED.following,
           total_commits = EXCLUDED.total_commits,
           total_stars = EXCLUDED.total_stars,
           total_forks = EXCLUDED.total_forks,
           languages = EXCLUDED.languages,
           repositories = EXCLUDED.repositories,
           last_updated = NOW()`,
        [
          GITHUB_USERNAME,
          stats.totalRepos,
          stats.followers,
          stats.following,
          stats.totalCommits,
          stats.totalStars,
          stats.totalForks,
          JSON.stringify(stats.languages),
          JSON.stringify(stats.topRepos)
        ]
      );
      console.log('✅ GitHub stats cached successfully');
    } catch (cacheError) {
      console.error('⚠️ Failed to cache stats:', cacheError.message);
    }

    res.json({
      ...stats,
      cached: false,
      fetched: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ GitHub stats error:", error.message);
    res.status(500).json({ 
      message: "Failed to fetch GitHub statistics",
      error: error.message
    });
  }
});

// Get contribution graph data
router.get("/github/contributions", async (req, res) => {
  try {
    // This endpoint would require GitHub GraphQL API or scraping
    // For now, return a helpful message
    res.json({
      message: "Contribution data requires GitHub GraphQL API",
      suggestion: "Implement using GitHub's GraphQL API for detailed contribution data"
    });
  } catch (error) {
    console.error("❌ Contributions error:", error);
    res.status(500).json({ 
      message: "Failed to fetch contribution data",
      error: error.message 
    });
  }
});

export default router;