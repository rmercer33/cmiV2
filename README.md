# cmiLibrary Data Generator & Unified Ingestion Pipeline (`cmiV2`)

This repository contains the configuration generation and Markdown processing pipeline for the **cmiLibrary** website and its search database. It supports generating hierarchical metadata for the frontend website and a unified pipeline for compiling Markdown files into clean, styled HTML fragments and optional ingestion into the DynamoDB `cmiSearch` database.

---

## 1. Metadata Config Generator (`config.json`)

Generates a normalized `config.json` containing hierarchical metadata (Sources -> Books -> Groups -> Units) used by the frontend to enrich light-weight search results.

### Configuration Traversal
The generator reads `info.json` mapping files recursively at each level of your content tree and parses individual `.md` files to compile exact titles, descriptions, custom frontmatter metadata, and paths.

### Execution
Run the configuration generator by providing the path to the content directory:
```bash
./generate.sh <content_directory> [output_file]
```
*   **Example:**
    ```bash
    ./generate.sh ../cmiContent/content config.json
    ```

---

## 2. Unified Markdown to HTML & DynamoDB Ingestion Pipeline

The unified parser (`src/index.mjs`) reads Markdown files from a content directory, parses them into an AST, generates structural element-level keys, renders them into clean HTML fragments with preserved IDs, and optionally indexes the content into the `cmiSearch` DynamoDB table.

### Shared Key Generation
To guarantee exact mapping between search indexing and DOM rendering, both processes share the same logic:
*   **DynamoDB Ingestion**: Ingests paragraphs and headings using a fully ordered sort key (e.g. `0001#h1`).
*   **HTML Generation**: Strips the leading sequence number from the keys and injects them as element IDs directly on the tag (e.g. `<h1 id="h1">` and `<p id="p1">`).
*   **Omissions (`{: .omit}`)**: Headings and paragraphs ending in `{: .omit}` are skipped for both HTML rendering and database ingestion.
*   **Template Replacement**: Frontmatter variables like `{{page.title}}` are automatically expanded within headings and paragraphs.

### Parser Configuration (`parser-config.json`)
The script is driven by a main configuration file:
```json
{
  "contentRoot": "../cmiContent/content",
  "outputRoot": "./public/content",
  "wrapperTag": "div",
  "wrapperId": "cmi-content"
}
```
*   `contentRoot`: Relative or absolute path to the directory containing Markdown files.
*   `outputRoot`: The output directory where compiled `.html` fragments will be written, mirroring the source hierarchy.
*   `wrapperTag`: The root tag used to wrap the compiled Markdown HTML (e.g., `div` or `section`).
*   `wrapperId`: The `id` attribute given to the wrapper tag.

---

## 3. How to Execute the Unified Parser

### Folder/Directory Processing Mode
To recursively traverse the configured `contentRoot`, generate HTML fragments, and optionally update DynamoDB:
```bash
# HTML generation only (safe, default mode)
node src/index.mjs

# HTML generation + DynamoDB ingestion (opt-in)
node src/index.mjs --db -e http://localhost:8000
```

### Path Filtering
To limit processing to a specific directory or a single unit/file under your `contentRoot`:
```bash
# Process only files under workbook directory
node src/index.mjs --path "oe/workbook"

# Process only a single unit/lesson
node src/index.mjs --path "oe/workbook/l001"
```

### Single File Mode (Backward Compatible)
Direct processing on an individual file:
```bash
# Process a single file and generate its HTML
node src/index.mjs sample.md -s wom -b wok -u l01

# Run via run-parser.sh shell script (automatically ingests to local DynamoDB)
./run-parser.sh sample.md -s wom -b wok -u l01
```

### Options Overview
| Flag | Description | Default |
| :--- | :--- | :--- |
| `-p, --path <path>` | Limits processing to a path relative to the `contentRoot` (e.g., `oe/workbook`). | *(None)* |
| `-d, --db` | Opt-in flag to enable DynamoDB ingestion (requires `--endpoint`). | `false` |
| `-c, --config <path>`| Path to the parser configuration file. | `./parser-config.json` |
| `-e, --endpoint <url>`| DynamoDB endpoint URL (required when `--db` is enabled). | *(None)* |
| `-r, --region <region>`| AWS Region for DynamoDB client. | `us-east-1` |

---

## 4. Running the Tests

A comprehensive integration and unit test suite is included to guarantee pipeline performance and compatibility.

Run all tests:
```bash
npm test
```
The test suite validates:
1.  **Metadata Config Generator Tests**: Verifies recursive schema mapping, custom YAML frontmatter parsing, and sorting arrays.
2.  **Original Ingestion Integration Tests**: Verifies single file parsing, duplicate prevention, and local DynamoDB population.
3.  **Unified Ingestion Pipeline Tests**: Verifies recursive traversal, path filtering, configuration wrapper injection, sequence-stripped HTML element IDs, and opt-in database indexing.

---

## 5. React SPA Frontend Website

An immersive, modern, responsive Single-Page Application (SPA) frontend is included inside the `frontend/` folder to view and read the generated teachings.

### Development Server
To launch the frontend locally for development and reading:
```bash
cd frontend
npm run dev
```
The application will start at `http://localhost:5173/`.

### Synchronizing Re-generated Data
If you have recreated `config.json` (metadata config) or compiled new HTML files into `_site/`:

1. **Synchronize Config Metadata:**
   Run the following splitter script from the **project root folder**:
   ```bash
   node scripts/split-config.mjs
   ```
   This splits your massive metadata `config.json` into a super lightweight initial index file and optimized source chunks inside `frontend/public/config/`.

2. **Synchronize HTML Content:**
   **No action is needed!** Because we've set up a relative symlink from `_site/` to `frontend/public/content`, any freshly compiled HTML fragments inside `_site/` are instantly and automatically served to the React app in real-time.

Simply **refresh your browser** after running the config splitter to see your newest content!

### Production Build
To build and optimize the frontend for production hosting:
```bash
cd frontend
npm run build
```
This builds static assets into `frontend/dist/` ready to be served from any static host (such as AWS S3, Vercel, Netlify, or GitHub Pages).

