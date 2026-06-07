// Runs inside GitHub Actions — uses GITHUB_TOKEN automatically
// Fetches your public repos, sorts by last pushed, skips forks,
// builds a markdown table and splices it into README.md

const https = require('https');
const fs = require('fs');

const USERNAME = process.env.GITHUB_USERNAME || 'Abhibadan';
const TOKEN    = process.env.GITHUB_TOKEN;
const README   = 'README.md';

// Repos to always skip (your profile repo itself, etc.)
const SKIP = new Set([USERNAME, 'Abhibadan']);

// Language → emoji map (extend as you like)
const LANG_EMOJI = {
  TypeScript:      '🔷',
  JavaScript:      '🟨',
  Python:          '🐍',
  'C++':           '⚙️',
  PHP:             '🐘',
  HTML:            '🌐',
  CSS:             '🎨',
  'Jupyter Notebook': '📓',
  Shell:           '🐚',
};

function request(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      headers: {
        'User-Agent': 'readme-updater',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function getRepos() {
  let page = 1, all = [];
  while (true) {
    const repos = await request(
      `/users/${USERNAME}/repos?per_page=100&page=${page}&sort=pushed&direction=desc`
    );
    if (!repos.length) break;
    all = all.concat(repos);
    page++;
    if (repos.length < 100) break;
  }
  return all
    .filter(r => !r.fork && !r.archived && !SKIP.has(r.name))
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8); // show top 8 most recently active
}

function statusBadge(repo) {
  // Heuristic: if it has a description and was pushed in last 90 days → Live
  const recent = (Date.now() - new Date(repo.pushed_at)) < 90 * 24 * 60 * 60 * 1000;
  if (repo.homepage) return '🌍 Live';
  if (recent)        return '✅ Active';
  return '📦 Stable';
}

function langBadge(lang) {
  if (!lang) return '—';
  const emoji = LANG_EMOJI[lang] || '💻';
  return `${emoji} ${lang}`;
}

function buildTable(repos) {
  const header = [
    '| Project | What it does | Language | Status |',
    '|---|---|---|---|',
  ];
  const rows = repos.map(r => {
    const name   = `**[${r.name}](${r.html_url})**`;
    const desc   = (r.description || '—').replace(/\|/g, '\\|');
    const lang   = langBadge(r.language);
    const status = statusBadge(r);
    return `| ${name} | ${desc} | ${lang} | ${status} |`;
  });
  return [...header, ...rows].join('\n');
}

async function main() {
  const repos = await getRepos();
  const table = buildTable(repos);

  let readme = fs.readFileSync(README, 'utf8');

  // Replace everything between the two sentinel comments
  const START = '<!-- PROJECTS:START -->';
  const END   = '<!-- PROJECTS:END -->';

  const block = `${START}\n${table}\n${END}`;

  if (readme.includes(START) && readme.includes(END)) {
    readme = readme.replace(
      new RegExp(`${START}[\\s\\S]*?${END}`),
      block
    );
  } else {
    console.error('Sentinel comments not found in README.md — nothing updated.');
    process.exit(1);
  }

  fs.writeFileSync(README, readme);
  console.log(`✅ Updated projects table with ${repos.length} repos.`);
  repos.forEach(r => console.log(`   → ${r.name} (${r.language || 'no lang'})`));
}

main().catch(err => { console.error(err); process.exit(1); });