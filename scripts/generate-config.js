import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
// Usage: node generate-config.js [contentDir] [outputFile]
const contentDirArg = process.argv[2];
const outputFileArg = process.argv[3];

const contentDir = contentDirArg ? path.resolve(contentDirArg) : path.join(__dirname, '..', 'content');
const outputFilePath = outputFileArg ? path.resolve(outputFileArg) : path.join(process.cwd(), 'config.json');

// Standard default titles and descriptions for fallback
const DEFAULT_METADATA = {
  sources: {
    acim: { title: "A Course in Miracles", description: "A Course in Miracles" },
    acol: { title: "A Course of Love", description: "A Course of Love" },
    col: { title: "Choose Only Love", description: "Choose Only Love" },
    ftcm: { title: "From the Christ Mind", description: "From the Christ Mind" },
    jsb: { title: "The Jeshua Letters", description: "The Jeshua Letters" },
    oe: { title: "ACIM Original Edition", description: "ACIM Original Edition" },
    raj: { title: "Raj / Northwest Foundation for ACIM", description: "Raj / Northwest Foundation for ACIM" },
    wom: { title: "The Way of Mastery", description: "The Way of Mastery" }
  },
  books: {
    text: { title: "Text", description: "Text Volume" },
    workbook: { title: "Workbook", description: "Workbook Volume" },
    manual: { title: "Manual for Teachers", description: "Manual for Teachers Volume" },
    preface: { title: "Preface", description: "Preface Volume" }
  }
};

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parses simple YAML frontmatter from a Markdown file content.
 */
function parseFrontmatter(content) {
  const result = { data: {}, content: '' };
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(fmRegex);
  
  if (match) {
    result.content = content.replace(fmRegex, '');
    const fmText = match[1];
    const lines = fmText.split(/\r?\n/);
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Parse simple booleans/numbers if applicable, or keep as string
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value) && value !== '') value = Number(value);
        
        result.data[key] = value;
      }
    }
  } else {
    result.content = content;
  }
  return result;
}

/**
 * Merges a list of physically found items with an ordered list from info.json.
 * Preserves ordered list order, and appends any remaining physical items alphabetically.
 */
function sortItems(found, ordered) {
  if (!ordered || !Array.isArray(ordered)) {
    return [...found].sort();
  }
  const orderedSet = new Set(ordered);
  const matched = ordered.filter(item => found.includes(item));
  const remaining = found.filter(item => !orderedSet.has(item)).sort();
  return [...matched, ...remaining];
}

/**
 * Tries to extract a polished title for a Group using first unit's frontmatter or folder ID.
 */
function getGroupTitle(groupId, firstUnitFrontmatter) {
  if (firstUnitFrontmatter) {
    if (firstUnitFrontmatter.ctitle) return firstUnitFrontmatter.ctitle;
    if (firstUnitFrontmatter.section) return firstUnitFrontmatter.section;
    if (firstUnitFrontmatter.chapter) {
      if (/^\d+$/.test(groupId)) {
        return `Chapter ${groupId}: ${firstUnitFrontmatter.chapter}`;
      }
      return firstUnitFrontmatter.chapter;
    }
  }
  if (/^\d+$/.test(groupId)) {
    return `Chapter ${parseInt(groupId, 10)}`;
  }
  return "No title";
}

/**
 * Safely reads and parses info.json if it exists in the given directory.
 */
function readInfoJson(dirPath) {
  const infoPath = path.join(dirPath, 'info.json');
  if (fs.existsSync(infoPath)) {
    try {
      return JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } catch (err) {
      console.warn(`[Warning] Failed to parse info.json at "${infoPath}": ${err.message}`);
    }
  }
  return null;
}

/**
 * Scans a directory and returns names of its direct subdirectories.
 */
function getSubdirectories(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter(name => {
    if (name.startsWith('.')) return false;
    const fullPath = path.join(dirPath, name);
    return fs.statSync(fullPath).isDirectory();
  });
}

/**
 * Processes an individual Markdown unit.
 */
function processUnit(unitFilePath, unitId, urlParts) {
  let unitTitle = capitalize(unitId);
  let extraData = {};

  try {
    const content = fs.readFileSync(unitFilePath, 'utf8');
    const parsed = parseFrontmatter(content);
    extraData = parsed.data;
    unitTitle = parsed.data.title || capitalize(unitId);
  } catch (err) {
    console.warn(`[Warning] Failed to parse frontmatter for unit "${unitFilePath}": ${err.message}`);
  }

  const unitObj = {
    title: unitTitle,
    url: urlParts.join('/'),
    ...extraData
  };

  unitObj.title = unitTitle;
  unitObj.url = urlParts.join('/');

  return unitObj;
}

/**
 * Processes a Book level directory.
 */
function processBook(bookPath, bookId, urlParts) {
  const bookInfo = readInfoJson(bookPath) || {};
  const defaultBookMeta = DEFAULT_METADATA.books[bookId] || {};

  const bookNode = {
    title: defaultBookMeta.title || capitalize(bookId),
    description: defaultBookMeta.description || defaultBookMeta.title || "No description",
    ...bookInfo
  };

  const bookEntries = fs.readdirSync(bookPath).filter(name => !name.startsWith('.'));
  const subdirectories = [];
  const markdownFiles = [];

  for (const entry of bookEntries) {
    const entryPath = path.join(bookPath, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      subdirectories.push(entry);
    } else if (entry.endsWith('.md')) {
      markdownFiles.push(entry);
    }
  }

  const hasGroups = subdirectories.length > 0;

  if (hasGroups) {
    bookNode.groups = sortItems(subdirectories, bookInfo.groups);
    bookNode.groupInfo = {};

    for (const groupId of bookNode.groups) {
      const groupPath = path.join(bookPath, groupId);
      const groupInfo = readInfoJson(groupPath) || {};

      const physicalUnits = fs.readdirSync(groupPath).filter(name => {
        return !name.startsWith('.') && name.endsWith('.md');
      });

      const unitIds = physicalUnits.map(name => name.slice(0, -3));
      const sortedUnitIds = sortItems(unitIds, groupInfo.units);

      let groupTitle = groupInfo.title;
      let firstUnitFM = null;

      if (!groupTitle && sortedUnitIds.length > 0) {
        const firstUnitPath = path.join(groupPath, `${sortedUnitIds[0]}.md`);
        try {
          const content = fs.readFileSync(firstUnitPath, 'utf8');
          firstUnitFM = parseFrontmatter(content).data;
        } catch (err) {}
      }

      bookNode.groupInfo[groupId] = {
        title: groupTitle || getGroupTitle(groupId, firstUnitFM) || "No title",
        ...groupInfo,
        units: sortedUnitIds,
        unitInfo: {}
      };

      for (const unitId of sortedUnitIds) {
        const unitFilePath = path.join(groupPath, `${unitId}.md`);
        bookNode.groupInfo[groupId].unitInfo[unitId] = processUnit(
          unitFilePath,
          unitId,
          urlParts.concat([groupId, unitId])
        );
      }
    }
  } else {
    const unitIds = markdownFiles.map(name => name.slice(0, -3));
    bookNode.units = sortItems(unitIds, bookInfo.units);
    bookNode.unitInfo = {};

    for (const unitId of bookNode.units) {
      const unitFilePath = path.join(bookPath, `${unitId}.md`);
      bookNode.unitInfo[unitId] = processUnit(
        unitFilePath,
        unitId,
        urlParts.concat([unitId])
      );
    }
  }

  return bookNode;
}

/**
 * Processes a Source level directory.
 */
function processSource(sourcePath, sourceId, urlParts) {
  const sourceInfo = readInfoJson(sourcePath) || {};
  const defaultSourceMeta = DEFAULT_METADATA.sources[sourceId] || {};

  const sourceNode = {
    title: defaultSourceMeta.title || capitalize(sourceId),
    description: defaultSourceMeta.description || defaultSourceMeta.title || "No description",
    ...sourceInfo
  };

  const physicalSubdirs = getSubdirectories(sourcePath);

  const collectionsList = Array.isArray(sourceInfo.collections) ? sourceInfo.collections : [];
  const hasCollections = collectionsList.length > 0;

  if (hasCollections) {
    const physicalCollections = physicalSubdirs.filter(d => collectionsList.includes(d));
    sourceNode.collections = sortItems(physicalCollections, sourceInfo.collections);
    sourceNode.collectionInfo = {};

    for (const collectionId of sourceNode.collections) {
      const collectionPath = path.join(sourcePath, collectionId);
      const collectionInfo = readInfoJson(collectionPath) || {};

      const collectionNode = {
        title: collectionInfo.title || capitalize(collectionId),
        description: collectionInfo.description || capitalize(collectionId),
        ...collectionInfo,
        books: [],
        bookInfo: {}
      };

      const physicalBooks = getSubdirectories(collectionPath);
      collectionNode.books = sortItems(physicalBooks, collectionInfo.books);

      for (const bookId of collectionNode.books) {
        collectionNode.bookInfo[bookId] = processBook(
          path.join(collectionPath, bookId),
          bookId,
          urlParts.concat([collectionId, bookId])
        );
      }

      sourceNode.collectionInfo[collectionId] = collectionNode;
    }

    // Treat any other subdirectories as flat books directly under this source
    const flatBooks = physicalSubdirs.filter(d => !collectionsList.includes(d));
    if (flatBooks.length > 0) {
      sourceNode.books = sortItems(flatBooks, sourceInfo.books);
      sourceNode.bookInfo = {};

      for (const bookId of sourceNode.books) {
        sourceNode.bookInfo[bookId] = processBook(
          path.join(sourcePath, bookId),
          bookId,
          urlParts.concat([bookId])
        );
      }
    }
  } else {
    sourceNode.books = sortItems(physicalSubdirs, sourceInfo.books);
    sourceNode.bookInfo = {};

    for (const bookId of sourceNode.books) {
      sourceNode.bookInfo[bookId] = processBook(
        path.join(sourcePath, bookId),
        bookId,
        urlParts.concat([bookId])
      );
    }
  }

  return sourceNode;
}

function generateConfig() {
  console.log(`Content Directory: ${contentDir}`);
  console.log(`Output File: ${outputFilePath}`);
  console.log('Generating config.json...');

  if (!fs.existsSync(contentDir)) {
    console.error(`Error: Content directory "${contentDir}" does not exist.`);
    process.exit(1);
  }

  const rootInfo = readInfoJson(contentDir) || {};
  const config = {
    title: "cmiLibrary",
    description: "cmiLibrary Website Configuration",
    ...rootInfo
  };

  const physicalSubdirs = getSubdirectories(contentDir);

  const sectionsList = Array.isArray(rootInfo.sections) ? rootInfo.sections : [];
  const hasSections = sectionsList.length > 0;

  if (hasSections) {
    // Only treat subdirectories explicitly listed in rootInfo.sections as sections
    const physicalSections = physicalSubdirs.filter(d => sectionsList.includes(d));
    config.sections = sortItems(physicalSections, rootInfo.sections);
    config.sectionInfo = {};

    for (const sectionId of config.sections) {
      const sectionPath = path.join(contentDir, sectionId);
      const sectionInfo = readInfoJson(sectionPath) || {};

      const sectionNode = {
        title: sectionInfo.title || capitalize(sectionId),
        description: sectionInfo.description || capitalize(sectionId),
        ...sectionInfo,
        sources: [],
        sourceInfo: {}
      };

      const physicalSources = getSubdirectories(sectionPath);
      sectionNode.sources = sortItems(physicalSources, sectionInfo.sources);

      for (const sourceId of sectionNode.sources) {
        sectionNode.sourceInfo[sourceId] = processSource(
          path.join(sectionPath, sourceId),
          sourceId,
          [sectionId, sourceId]
        );
      }

      config.sectionInfo[sectionId] = sectionNode;
    }

    // Treat any other subdirectories as root-level flat sources
    const flatSources = physicalSubdirs.filter(d => !sectionsList.includes(d));
    if (flatSources.length > 0) {
      config.sources = sortItems(flatSources, rootInfo.sources);
      config.sourceInfo = {};

      for (const sourceId of config.sources) {
        config.sourceInfo[sourceId] = processSource(
          path.join(contentDir, sourceId),
          sourceId,
          [sourceId]
        );
      }
    }
  } else {
    config.sources = sortItems(physicalSubdirs, rootInfo.sources);
    config.sourceInfo = {};

    for (const sourceId of config.sources) {
      config.sourceInfo[sourceId] = processSource(
        path.join(contentDir, sourceId),
        sourceId,
        [sourceId]
      );
    }
  }

  // Ensure output directory exists before writing
  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write finalized config to outputFilePath
  fs.writeFileSync(outputFilePath, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Success! Configuration generated and saved to: ${outputFilePath}`);
}

generateConfig();
