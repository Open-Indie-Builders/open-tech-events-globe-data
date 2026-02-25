#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const FILE_PATH = path.resolve(__dirname, '..', 'tech-events.json');
const STAGED_ONLY = process.argv.includes('--staged-only');
const MAX_REDIRECTS = 3;

function checkUrl(url) {
  return new Promise((resolve) => {
    function attempt(currentUrl, redirectsLeft) {
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.request(currentUrl, { method: 'HEAD', timeout: 10000 }, (res) => {
        const status = res.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
          const next = new URL(res.headers.location, currentUrl).href;
          attempt(next, redirectsLeft - 1);
          return;
        }
        resolve({ ok: status !== 404, status });
      });
      req.on('error', (err) => resolve({ ok: false, status: null, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: null, error: 'timeout' });
      });
      req.end();
    }
    attempt(url, MAX_REDIRECTS);
  });
}

function getStagedLogoUrls() {
  let stagedFiles;
  try {
    stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' });
  } catch {
    return [];
  }

  if (!stagedFiles.split('\n').map((f) => f.trim()).includes('tech-events.json')) {
    return [];
  }

  // Extract logoUrl lines added or changed in the staged diff
  let diff;
  try {
    diff = execSync('git diff --cached -- tech-events.json', { encoding: 'utf8' });
  } catch {
    return [];
  }

  const urls = [];
  for (const line of diff.split('\n')) {
    // Only lines added (starting with '+') that contain a logoUrl value
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const match = line.match(/"logoUrl"\s*:\s*"([^"]+)"/);
      if (match && match[1].trim() !== '') {
        urls.push(match[1]);
      }
    }
  }
  return [...new Set(urls)];
}

function getAllLogoUrls() {
  if (!fs.existsSync(FILE_PATH)) {
    console.log('tech-events.json not found, skipping check.');
    process.exit(0);
  }
  const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  return data
    .filter((e) => e.logoUrl && e.logoUrl.trim() !== '')
    .map((e) => ({ id: e.id, url: e.logoUrl }));
}

async function main() {
  let targets;

  if (STAGED_ONLY) {
    const urls = getStagedLogoUrls();
    if (urls.length === 0) {
      console.log('OK: no logoUrl changes detected in staged files.');
      process.exit(0);
    }
    console.log(`Checking ${urls.length} staged logoUrl(s)...`);
    targets = urls.map((url) => ({ id: url, url }));
  } else {
    targets = getAllLogoUrls();
    if (targets.length === 0) {
      console.log('No logoUrl entries found.');
      process.exit(0);
    }
    console.log(`Checking ${targets.length} logoUrl(s)...`);
  }

  const results = await Promise.all(
    targets.map(async ({ id, url }) => {
      const result = await checkUrl(url);
      return { id, url, ...result };
    })
  );

  const failures = results.filter((r) => !r.ok);

  if (failures.length === 0) {
    console.log('OK: all logoUrl(s) are reachable.');
    process.exit(0);
  }

  console.error(`\nERROR: ${failures.length} logoUrl(s) failed:`);
  for (const { id, url, status, error } of failures) {
    const reason = error ? `error: ${error}` : `HTTP ${status}`;
    console.error(`  [${id}] ${url}  →  ${reason}`);
  }
  process.exit(1);
}

main();
