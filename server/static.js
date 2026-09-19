'use strict';
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Serves a file from `rootDir`, refusing to escape it via `..` traversal.
function serveFrom(rootDir) {
  return function serve(req, res, urlPathname) {
    let rel = decodeURIComponent(urlPathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const resolved = path.normalize(path.join(rootDir, rel));
    if (!resolved.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return false;
    }
    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(resolved).pipe(res);
    return true;
  };
}

module.exports = { serveFrom, MIME };
