import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Read args: node scripts/build-room.mjs <roomId> [contentDirOverride]
const roomId = process.argv[2];
const contentDirOverride = process.argv[3];

if (!roomId) {
  console.error("\nError: Please provide a room ID. Example: node scripts/build-room.mjs main");
  process.exit(1);
}

const roomsConfigPath = path.join(projectRoot, 'frontend', 'public', 'config', 'rooms.json');

if (!fs.existsSync(roomsConfigPath)) {
  console.error(`Error: rooms.json not found at ${roomsConfigPath}`);
  process.exit(1);
}

const roomsConfig = JSON.parse(fs.readFileSync(roomsConfigPath, 'utf-8'));
const room = roomsConfig.rooms.find(r => r.id === roomId);

if (!room) {
  console.error(`Error: Room with ID '${roomId}' not found in rooms.json`);
  console.error(`Available rooms: ${roomsConfig.rooms.map(r => r.id).join(', ')}`);
  process.exit(1);
}

// Extract contentDir from rooms.json, or use the provided command-line override
const contentDir = contentDirOverride || room.contentDir;
if (!contentDir) {
  console.error(`Error: Room '${roomId}' does not have a 'contentDir' defined in rooms.json, and no command-line override was provided.`);
  process.exit(1);
}

const resolvedContentDir = path.resolve(projectRoot, contentDir);

if (!fs.existsSync(resolvedContentDir)) {
  console.error(`Error: Content directory '${contentDir}' not found at ${resolvedContentDir}`);
  process.exit(1);
}

const indexUrl = room.indexUrl;
if (!indexUrl) {
  console.error(`Error: Room '${roomId}' does not have an 'indexUrl' defined in rooms.json`);
  process.exit(1);
}

const indexFilename = path.basename(indexUrl);
const configFilename = roomId === 'main' ? 'config.json' : `config-${roomId}.json`;

console.log(`==========================================================`);
console.log(`          Building Navigation Config for Room: ${roomId}`);
console.log(`==========================================================`);
console.log(`Content Dir : ${contentDir}`);
console.log(`Config File : ${configFilename}`);
console.log(`Index File  : ${indexFilename}`);

try {
  console.log(`\nStep 1/2: Generating '${configFilename}' from content tree...`);
  execSync(`node scripts/generate-config.js "${resolvedContentDir}" "${configFilename}"`, { cwd: projectRoot, stdio: 'inherit' });

  console.log(`\nStep 2/2: Splitting config into frontend JSON chunks...`);
  execSync(`node scripts/split-config.mjs "${configFilename}" "${indexFilename}"`, { cwd: projectRoot, stdio: 'inherit' });

  console.log(`\n==========================================================`);
  console.log(`✅ Success! Navigation configs updated for room '${roomId}'`);
  console.log(`==========================================================`);
} catch (err) {
  console.error("\n❌ Build failed.");
  process.exit(1);
}
