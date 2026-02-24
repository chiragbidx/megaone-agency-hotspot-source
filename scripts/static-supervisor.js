const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 8080;
const REPO_URL = process.env.REPO_URL;
const BRANCH = process.env.PREVIEW_BRANCH || 'main';
const POLL_MS = Number(process.env.GIT_POLL_MS || 30000);

const repoPath = path.resolve(__dirname, '..', 'site');
const fallbackPath = path.resolve(__dirname, '..');
function currentRoot() {
  if (REPO_URL && fs.existsSync(path.join(repoPath, '.git'))) return repoPath;
  return fallbackPath;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function run(cmd, cwd = repoPath) {
  execSync(cmd, { stdio: 'inherit', cwd });
}

function ensureRepo() {
  if (!REPO_URL) return;
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
    console.log(`Cloning ${REPO_URL}#${BRANCH} into ${repoPath}`);
    run(`git clone --depth 1 --branch ${BRANCH} ${REPO_URL} ${repoPath}`, path.dirname(repoPath));
  } else {
    updateRepo();
  }
}

function updateRepo() {
  if (!REPO_URL) return;
  try {
    console.log(`Fetching ${BRANCH}...`);
    run(`git fetch origin ${BRANCH}`);
    run(`git reset --hard origin/${BRANCH}`);
  } catch (err) {
    console.error('Git fetch/reset failed:', err.message);
  }
}

function startPolling() {
  if (!REPO_URL) return;
  setInterval(updateRepo, POLL_MS);
}

function serveStatic(req, res) {
  const safePath = decodeURI(req.url.split('?')[0]);
  let relPath = path.normalize(safePath).replace(/^(\.\.[/\\])+/, '');
  if (relPath === '/' || relPath === '') relPath = '/index.html';
  const root = currentRoot();
  const filePath = path.join(root, relPath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    });
  });
}

function startServer() {
  const root = currentRoot();
  http.createServer(serveStatic).listen(PORT, () => {
    console.log(`Serving ${root} on port ${PORT}`);
  });
}

ensureRepo();
startPolling();
startServer();
