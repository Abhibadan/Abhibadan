// .github/scripts/update-projects.js
// Fetches all public repos via GitHub API and rewrites the PROJECTS section in README.md

const https = require("https");
const fs = require("fs");
const path = require("path");

const USERNAME = process.env.GITHUB_USERNAME || "Abhibadan";
const TOKEN = process.env.GITHUB_TOKEN;

// Repos to skip (forks you don't want listed, or archived/demo repos)
const SKIP_REPOS = new Set([
  `${USERNAME}`,           // profile repo itself
  "snake",                 // old game project
  "glowing_lamp",          // private-style experiment
  "treatment",             // old PHP project
  "gogobus",               // old JS project
  "employee_management_task",
  "vite-react",
]);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "readme-updater",
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("JSON parse error: " + data.slice(0, 200)));
        }
      });
    }).on("error", reject);
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Language → badge color map
const LANG_COLORS = {
  TypeScript: "3178C6",
  JavaScript: "F7DF1E",
  Python: "3776AB",
  "C++": "00599C",
  "Jupyter Notebook": "DA5B0B",
  PHP: "777BB4",
  HTML: "E34F26",
  CSS: "1572B6",
};

function langBadge(lang) {
  if (!lang) return "—";
  const color = LANG_COLORS[lang] || "555555";
  const label = encodeURIComponent(lang);
  return `![${lang}](https://img.shields.io/badge/-${label}-${color}?style=flat-square&logoColor=white)`;
}

// Calculate experience dynamically from career start date
function calcExperience() {
  const start = new Date("2023-09-05");
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years} year${years !== 1 ? "s" : ""} ${months} month${months !== 1 ? "s" : ""}`;
}

async function main() {
  console.log(`Fetching public repos for ${USERNAME}...`);

  // Paginate through all public repos
  let page = 1;
  let allRepos = [];
  while (true) {
    const url = `https://api.github.com/users/${USERNAME}/repos?type=public&sort=pushed&per_page=100&page=${page}`;
    const repos = await fetchJSON(url);
    if (!Array.isArray(repos) || repos.length === 0) break;
    allRepos = allRepos.concat(repos);
    if (repos.length < 100) break;
    page++;
  }

  console.log(`Total public repos fetched: ${allRepos.length}`);

  // Filter and sort
  const filtered = allRepos
    .filter((r) => !r.archived && !SKIP_REPOS.has(r.name))
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  // Build markdown table rows
  const rows = filtered.map((repo) => {
    const name = `[${repo.name}](${repo.html_url})`;
    const desc = repo.description
      ? repo.description.replace(/\|/g, "\\|")
      : "_No description_";
    const lang = langBadge(repo.language);
    const updated = formatDate(repo.pushed_at);
    return `| ${name} | ${desc} | ${lang} | ${updated} |`;
  });

  const table = [
    `> ⚡ _Auto-updated every 24 h by GitHub Actions — always reflects latest public repos._`,
    ``,
    `| Repository | Description | Language | Last Updated |`,
    `|---|---|---|---|`,
    ...rows,
  ].join("\n");

  // Read README
  const readmePath = path.join(process.cwd(), "README.md");
  let content = fs.readFileSync(readmePath, "utf8");

  // Replace between markers
  const startMarker = "<!-- PROJECTS_START -->";
  const endMarker = "<!-- PROJECTS_END -->";
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find PROJECTS_START / PROJECTS_END markers in README.md");
    process.exit(1);
  }

  const newContent =
    content.slice(0, startIdx + startMarker.length) +
    "\n" +
    table +
    "\n" +
    content.slice(endIdx);

  // Also update dynamic experience
  const experience = calcExperience();
  const finalContent = newContent.replace(
    /<!-- EXPERIENCE_BADGE -->[^""]*/,
    experience
  );

  fs.writeFileSync(readmePath, finalContent, "utf8");
  console.log(`Updated README.md with ${filtered.length} repos. Experience: ${experience}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});