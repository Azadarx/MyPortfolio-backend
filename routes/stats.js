// routes/stats.js
import express from "express";
import axios from "axios";
import { executeQuery } from "../server/db.js";

const router = express.Router();

// GitHub API configuration
const GITHUB_USERNAME = "azadarx";
const GITHUB_API_BASE = "https://api.github.com";

// Cache duration in milliseconds (15 minutes)
const CACHE_DURATION = 15 * 60 * 1000;

// Get GitHub statistics
router.get("/github", async (req, res) => {
  try {
    // Check cache first
    const cachedStats = await executeQuery(
      "SELECT * FROM github_stats WHERE last_updated > NOW() - INTERVAL '15 minutes' ORDER BY last_updated DESC LIMIT 1"
    );

    if (cachedStats.length > 0) {
      return res.json(cachedStats[0]);
    }

    const headers = process.env.GITHUB_TOKEN
      ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
      : {};

    const [userResponse, reposResponse] = await Promise.all([
      axios.get(`${GITHUB_API_BASE}/users/${GITHUB_USERNAME}`, { headers }),
      axios.get(
        `${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=100`,
        { headers }
      ),
    ]);

    const userData = userResponse.data;
    const reposData = reposResponse.data;

    // Calculate statistics
    const stats = {
      totalRepos: userData.public_repos,
      totalStars: reposData.reduce(
        (sum, repo) => sum + repo.stargazers_count,
        0
      ),
      totalForks: reposData.reduce((sum, repo) => sum + repo.forks_count, 0),
      totalCommits: 0, // Will be calculated separately
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

    // Get language statistics
    for (const repo of reposData.slice(0, 20)) {
      try {
        const langResponse = await axios.get(
          `${GITHUB_API_BASE}/repos/${GITHUB_USERNAME}/${repo.name}/languages`
        );
        const languages = langResponse.data;

        Object.entries(languages).forEach(([lang, bytes]) => {
          stats.languages[lang] = (stats.languages[lang] || 0) + bytes;
        });
      } catch (error) {
        console.log(`Could not fetch languages for ${repo.name}`);
      }
    }

    // Convert language bytes to percentages
    const totalBytes = Object.values(stats.languages).reduce(
      (sum, bytes) => sum + bytes,
      0
    );
    if (totalBytes > 0) {
      Object.keys(stats.languages).forEach((lang) => {
        stats.languages[lang] = Math.round(
          (stats.languages[lang] / totalBytes) * 100
        );
      });
    }

    // Get recent activity (events)
    try {
      const eventsResponse = await axios.get(
        `${GITHUB_API_BASE}/users/${GITHUB_USERNAME}/events?per_page=10`
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
      console.log("Could not fetch recent activity");
    }

    // Cache the results
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

    res.json(stats);
  } catch (error) {
    console.error("GitHub stats error:", error);
    res.status(500).json({ message: "Failed to fetch GitHub statistics" });
  }
});

// Get contribution graph data
router.get("/github/contributions", async (req, res) => {
  try {
    // This would require scraping GitHub's contribution graph or using a third-party service
    // For now, we'll return mock data structure
    const contributions = {
      totalContributions: 847,
      weeks: [], // Array of weeks with contribution counts
    };

    res.json(contributions);
  } catch (error) {
    console.error("GitHub contributions error:", error);
    res.status(500).json({ message: "Failed to fetch contribution data" });
  }
});

export default router;