/**
 * Files that live in the project folder but must never be served to browsers.
 *
 * The server uses express.static(__dirname) for the public pages, which would
 * otherwise also hand out the school database (data.json: admin password
 * hashes, applications, messages, fee records), backend source, tests and
 * node_modules to anyone who guesses the URL.
 */
const PRIVATE_ROOT_FILES = new Set([
  'data.json',
  'debest-data.json',
  'package.json',
  'package-lock.json',
  'server.js',
  'application-data.js',
  'assistant-service.js',
  'business-pulse.js',
  'employment-offer-workflow.js',
  'proposal-workflow.js',
  'private-files.js',
]);

const PRIVATE_DIRS = ['node_modules', 'tests', '.github', '.vscode', '.git'];

function isPrivatePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  } catch (e) {
    return true; // malformed encoding: refuse
  }
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (parts.some((part) => part === '..')) return true;
  if (parts.some((part) => part.startsWith('.'))) return true; // .env, .git, .eslintrc …
  if (PRIVATE_DIRS.includes(parts[0])) return true;
  if (parts.length === 1) {
    const file = parts[0];
    if (PRIVATE_ROOT_FILES.has(file)) return true;
    if (file.endsWith('.md')) return true; // internal docs / TODO notes
    if (/^data.*\.json$/.test(file) || /\.json\.(bak|tmp|old)$/.test(file)) return true;
  }
  return false;
}

function blockPrivateFiles(notFound) {
  return (req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && isPrivatePath(req.path)) return notFound(req, res);
    return next();
  };
}

module.exports = { isPrivatePath, blockPrivateFiles };
