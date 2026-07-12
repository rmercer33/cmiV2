import fs from 'fs';
import path from 'path';

const CONFIG_PATH = './config.json';
const OUTPUT_DIR = './frontend/public/config';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeSourceFile(sourceId, sourceData) {
  const sourceFilePath = path.join(OUTPUT_DIR, `${sourceId}.json`);
  fs.writeFileSync(sourceFilePath, JSON.stringify(sourceData, null, 2));
  console.log(`- Created ${sourceFilePath} (${(fs.statSync(sourceFilePath).size / 1024).toFixed(1)} KB)`);
}

function splitConfig() {
  console.log('Reading main config.json...');
  const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(rawConfig);

  const indexConfig = {
    title: config.title || 'Library of Christ Mind Teachings',
    description: config.description || 'cmiLibrary Website Configuration',
    contact: config.contact,
    email: config.email
  };

  console.log('Splitting sources...');

  if (Array.isArray(config.sections)) {
    indexConfig.sections = config.sections;
    indexConfig.sectionInfo = {};

    for (const sectionId of config.sections) {
      const sectionData = config.sectionInfo[sectionId];
      if (!sectionData) {
        console.warn(`Warning: Section metadata for "${sectionId}" not found in config.json.`);
        continue;
      }

      indexConfig.sectionInfo[sectionId] = {
        title: sectionData.title,
        description: sectionData.description,
        sources: sectionData.sources || [],
        sourceInfo: {}
      };

      for (const sourceId of sectionData.sources) {
        const sourceData = sectionData.sourceInfo[sourceId];
        if (!sourceData) {
          console.warn(`Warning: Source metadata for "${sourceId}" not found in section "${sectionId}".`);
          continue;
        }

        const sourceMetaStub = {
          title: sourceData.title,
          description: sourceData.description,
          image: sourceData.image
        };

        if (sourceData.books) sourceMetaStub.books = sourceData.books;
        if (sourceData.collections) sourceMetaStub.collections = sourceData.collections;

        indexConfig.sectionInfo[sectionId].sourceInfo[sourceId] = sourceMetaStub;

        // Write complete source-specific configuration
        writeSourceFile(sourceId, sourceData);
      }
    }
  } else {
    indexConfig.sources = config.sources || [];
    indexConfig.sourceInfo = {};

    for (const sourceId of config.sources) {
      const sourceData = config.sourceInfo[sourceId];
      if (!sourceData) {
        console.warn(`Warning: Source metadata for "${sourceId}" not found in config.json.`);
        continue;
      }

      const sourceMetaStub = {
        title: sourceData.title,
        description: sourceData.description,
        image: sourceData.image
      };

      if (sourceData.books) sourceMetaStub.books = sourceData.books;
      if (sourceData.collections) sourceMetaStub.collections = sourceData.collections;

      indexConfig.sourceInfo[sourceId] = sourceMetaStub;

      // Write complete source-specific configuration
      writeSourceFile(sourceId, sourceData);
    }
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
