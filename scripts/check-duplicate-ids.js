const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'tech-events.json');

if (!fs.existsSync(filePath)) {
  console.log('tech-events.json not found, skipping check.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const ids = data.map((e) => e.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);

if (dupes.length > 0) {
  console.error('ERROR: Duplicate IDs found in tech-events.json:');
  [...new Set(dupes)].forEach((id) => console.error(`  - ${id}`));
  process.exit(1);
}

console.log('OK: no duplicate IDs found in tech-events.json.');
