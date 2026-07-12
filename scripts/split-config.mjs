import fs from 'fs';
import path from 'path';

const CONFIG_PATH = './config.json';
const OUTPUT_DIR = './frontend/public/config';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function splitConfig() {
  console.log('Reading main config.json...');
  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(rawConfig);

  const indexConfig = {
    title: config.title || 'Library of Christ Mind Teachings',
    description: config.description || 'cmiLibrary Website Configuration',
    contact: config.contact,
    email: config.email,
    sources: config.sources || [],
    sourceInfo: {}
  };

  console.log('Splitting sources...');
  for (const sourceId of config.sources) {
    const sourceData = config.sourceInfo[sourceId];
    if (!sourceData) {
      console.warn(`Warning: Source metadata for "${sourceId}" not found in config.json.`);
      continue;
    }

    // Add minimal source meta to index.json so the initial UI can show titles/books
    indexConfig.sourceInfo[sourceId] = {
      title: sourceData.title,
      description: sourceData.description,
      books: sourceData.books || [],
      image: sourceData.image // Pass through source cover image to homepage index
    };

    // Write complete source-specific configuration
    const sourceFilePath = path.join(OUTPUT_DIR, `${sourceId}.json`);
    fs.writeFileSync(sourceFilePath, JSON.stringify(sourceData, null, 2));
    console.log(`- Created ${sourceFilePath} (${(fs.statSync(sourceFilePath).size / 1024).toFixed(1)} KB)`);
  }

  // Write index.json
  const indexFilePath = path.join(OUTPUT_DIR, 'index.json');
  fs.writeFileSync(indexFilePath, JSON.stringify(indexConfig, null, 2));
  console.log(`Created index.json (${(fs.statSync(indexFilePath).size / 1024).toFixed(1)} KB)`);

  console.log('Config splitting completed successfully!');
}

try {
  splitConfig();
} catch (error) {
  console.error('Error during config splitting:', error);
  process.exit(1);
}
