# cmiLibrary: Content Architecture & Ingestion Guide

This document serves as the comprehensive user guide for content editors and software developers maintaining the markdown-driven **cmiLibrary** website and its backend search pipelines. It describes the data structures, sorting configurations, frontmatter rules, database ingestion schemas, and post-processing steps used to build and update the site.

---

## 1. The Content Hierarchy

The cmiLibrary app is built on a strict, four-tier hierarchical data structure derived directly from your filesystem layout. This hierarchy controls how data is structured in the search database, generated as metadata, and rendered in the frontend interface.

```
📁 Content Root/
└── 📁 Source/          (e.g., wom, acim) - Represents the top-level collection or teaching
    └── 📁 Book/        (e.g., early, workbook) - Represents a main volume or book
        ├── 📁 Group/   (e.g., part1, section3) - (Optional) Groups units within a book
        │   └── 📄 Unit (e.g., l01.md, chap2.md) - Individual chapters, lessons, or units of reading
        └── 📄 Unit     (e.g., preface.md) - Units can also sit directly under a Book
```

### Why this Hierarchy is Critical
1. **Routing and Breadcrumbs**: The frontend Router parses URL paths matching `/read/:sourceId/:bookId/:groupId/:unitId` to automatically locate files and render breadcrumbs showing exactly where the user is in their study journey.
2. **Sidebar Tree Generation**: The sidebar navigation dynamically expands and collapses directories according to this tree structure.
3. **Sequential Reading Flow**: The "Next Section" and "Previous Section" buttons at the bottom of each reading pane automatically calculate adjacent files in the hierarchy to guide the user seamlessly through the lessons.
4. **DynamoDB Partitioning**: In the database, records are partitioned sequentially based on this hierarchy to guarantee ultra-fast lookup and sort queries.

---

## 2. Controlling Presentation Order (`info.json`)

By default, filesystems sort files alphabetically. In spiritual and educational teachings, alphabetical order rarely matches the chronological or logical reading sequence (e.g., `introduction.md`, `l1.md`, `l10.md`, `l2.md` would sort incorrectly).

To override alphabetical sorting, **`info.json`** mapping files are placed inside each directory. The parser reads these mapping arrays recursively to build the navigation menus and set the correct sequential order.

### `info.json` Structures and Keys

#### 1. Source Level (Content Root Folder)
Defines the sorting order of the top-level sources on your website.
```json
{
  "sources": ["acim", "wom", "acol", "oe", "raj", "col", "ftcm", "jsb"]
}
```

#### 2. Book Level (Inside a Source Folder)
Defines the sorting order of books within a single source.
```json
{
  "books": ["text", "workbook", "manual", "preface"]
}
```

#### 3. Group Level (Inside a Book Folder)
Defines whether a book has grouping subfolders, and lists the sorted order of those groups.
```json
{
  "groups": ["part1", "part2"]
}
```

#### 4. Unit Level (Inside a Book or Group Folder)
Defines the exact reading and presentation order of individual Markdown files (units) in that folder (excluding the `.md` extensions).
```json
{
  "units": ["l01", "l02", "l03", "l04", "l05"]
}
```

*Note: Any files found physically in a folder that are **not** listed in the corresponding `info.json` array will be automatically sorted alphabetically and appended to the **end** of the ordered list.*

### Adding Custom Attributes (e.g., `pageTitle`)
You can add custom configuration properties directly to any `info.json` file. For example, adding **`"pageTitle": "Custom Book Title"`** at the Book or Source level will automatically flow into `config.json` and dynamically override the browser's HTML page title when a user navigates to that section of the website.

---

## 3. Markdown Frontmatter and Directives

Individual Markdown files utilize YAML frontmatter block configurations and inline markdown directives to customize text layout, trigger specific features, and manage search exposure.

### YAML Frontmatter Configuration
A YAML frontmatter block is located at the absolute beginning of a Markdown file bounded by triple-dashes (`---`). It supports the following critical attributes:

```yaml
---
title: "Lesson 1: I am as God created me"
audiofn: "wom_early_l01_audio"
pageTitle: "Lesson 1 Override"
---
```
*   `title`: The primary display title of the unit on the website and navigation tree.
*   `audiofn`: (Optional) Specifies the S3 audio file name for this unit. If present, the website automatically loads the audio player at the bottom of the screen.
*   `pageTitle`: (Optional) Specifies an absolute HTML browser tab title override. If set, it replaces the default contextual title format for this unit.

### Dynamic Variable Expansion
You can expand any frontmatter attribute directly inside the body of your Markdown files by writing **`{{page.<attribute>}}`**. The parser expands these variables during compilation.

**Source Markdown:**
```markdown
# {{page.title}}

This is a lesson transcript. Our focus is: "{{page.title}}".
```
**Compiled Website Output:**
```html
<h1 id="h1">Lesson 1: I am as God created me</h1>
<p id="p1">This is a lesson transcript. Our focus is: "Lesson 1: I am as God created me".</p>
```

### Omission Directives (`{: .omit}`)
If you want to include notes, guidelines, or formatting rules in your markdown file that should **not** be visible to readers or indexed in the search database, append **`{: .omit}`** to the end of the paragraph or heading block.

**Markdown Example:**
```markdown
This paragraph is a note to editors and should not be saved. {: .omit}
```

#### Impact of `{: .omit}`:
- **Search Database**: The block is completely ignored and will not be indexed.
- **HTML Output**: The paragraph is generated with an `.omit` CSS class which can be styled as hidden (`display: none;`), but it is still assigned a sequential ID (e.g. `id="p2"`) to ensure paragraph numbers stay perfectly synchronized between the HTML content and the VTT audio timing markers.

---

## 4. The Generation & Ingestion Pipeline

The project provides shell scripts and Node.js executables to transform raw Markdown into website assets and populate the AWS DynamoDB search database.

```
                ┌────────────────────────┐
                │   Markdown Content     │
                └───────────┬────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    [Metadata Pipeline]             [Parser & Database Pipeline]
      ./generate.sh                       node src/index.mjs
            │                               │
            ▼                               ▼
     (config.json)                    (cmiSearch Table)
            │                         - HTML files served
            ▼                         - DynamoDB index updated
    node scripts/split-config.mjs
            │
            ▼
 (Split chunks for website)
```

### Step 1: Run the Metadata Config Generator
This step recursively compiles all `info.json` and Markdown frontmatter titles, descriptions, and structural listings into a single monolithic config map (`config.json`).

```bash
# Command: ./generate.sh <content_root_directory> [output_config_path]
./generate.sh ../cmiContent/content config.json
```

### Step 2: Split Config for Frontend Performance
To avoid loading a massive `config.json` file in the user's browser, split it into highly optimized, lightweight chunks. Run this command from the project root:
```bash
node scripts/split-config.mjs
```
This splits the config into a core file (`index.json`) and specific source modules under `frontend/public/config/`.

### Step 3: Run the Parser & Search Index Ingestor
The unified parser (`src/index.mjs`) reads the Markdown directory, compiles clean HTML fragments, and optionally indexes the paragraphs into your local or cloud DynamoDB **`cmiSearch`** table.

```bash
# 1. HTML compilation ONLY (safe, local test mode)
node src/index.mjs

# 2. HTML compilation + Local DynamoDB Search Ingestion (using --db or -d)
node src/index.mjs --db --endpoint http://localhost:8000
```

#### Pipeline Command-Line Arguments:
- `-p, --path <path>`: Limits processing to a subset directory or single file (e.g. `--path "oe/workbook/l001"`).
- `-d, --db`: Opt-in flag to enable database ingestion.
- `-e, --endpoint <url>`: DynamoDB Endpoint URL (required if `--db` is active, e.g. `-e http://localhost:8000` for offline development).
- `-r, --region <region>`: AWS Region (default: `us-east-1`).
- `-c, --config <path>`: Alternate parser config file (default: `./parser-config.json`).

---

## 5. Post-Processing: VTT Generation

To enable interactive, sentence-level audio highlighting and click-to-seek playback, each audio track needs a WebVTT (`.vtt`) subtitle file that is annotated with HTML paragraph IDs.

The **`audio/generate_vtt.py`** script automates this forced-alignment pipeline.

### System & Module Requirements

Before running the VTT generator, ensure you have installed the necessary system packages and Python modules:

#### 1. System Requirements
- **Python 3.x**: The core programming environment.
- **Node.js**: Required by the script to spawn the background AST extractor (`node scripts/extract-blocks.mjs`).
- **ffmpeg**: A system-level multimedia processing framework required by Whisper / stable-whisper to decode and parse MP3 audio tracks.
  - *macOS Installation*: `brew install ffmpeg`
  - *Ubuntu/Debian Installation*: `sudo apt update && sudo apt install ffmpeg`
  - *Windows Installation*: Install via Chocolatey (`choco install ffmpeg`) or download official binaries and add them to your System PATH.

#### 2. Python Libraries
Install the Python dependencies using the provided `audio/requirements.txt` file:
```bash
pip install -r audio/requirements.txt
```
The dependencies are:
- **`stable-ts`**: (Stable Whisper) The library that wraps OpenAI's Whisper models to provide robust, precise word-level alignment and timestamps.
- **`requests`**: Used to safely stream and download the audio files from your S3 bucket.

### Execution Command
Execute the script from the directory where you want the resulting `.vtt` file to be saved:
```bash
python3 audio/generate_vtt.py <S3_PUBLIC_AUDIO_URL> <PATH_TO_LOCAL_MARKDOWN_FILE>
```

#### Example:
```bash
cd my-output-folder/
python3 ../audio/generate_vtt.py "https://s3.amazonaws.com/cmi-audio/wom/early/l01.mp3" "../cmiContent/content/wom/early/l01.md"
```

### Under the Hood Process:
1. **Download**: The script streams and downloads the audio MP3 file to a local temp file.
2. **Structure Extraction**: It spawns a background Node.js process using our unified Markdown block extractor (`scripts/extract-blocks.mjs`). This extracts the exact plain-text paragraphs and assigns them correct, sequence-accurate HTML paragraph IDs (e.g. `p1`, `p3`), taking into account omitted sections and frontmatter expansions.
3. **Forced Alignment**: It loads the **Whisper AI** model (`base`) and aligns the clean text blocks sequentially to the audio timeline down to the word level.
4. **ID Injection & Annotation**: It processes each Whisper segment. Using a robust alphanumeric character-indexing algorithm, it identifies which HTML paragraph ID (`pX`) the segment belongs to, retrieves the exact capitalized and punctuated substring from the original Markdown, and prepends the ID to the segment.
5. **Output**: It writes a standard WebVTT file with cues prepended like this: `p5|This is a spoken segment.` into the calling directory.

### S3 Upload & Deployment
Once the `.vtt` file has been generated, you **must upload it to your S3 bucket in the exact same folder/directory as its corresponding audio MP3 file**.

For example, if your audio file is hosted at:
`https://s3.amazonaws.com/cmi-audio-bucket/wom/early/l01.mp3`

The generated `.vtt` file must be uploaded to:
`https://s3.amazonaws.com/cmi-audio-bucket/wom/early/l01.vtt`

This is crucial because the React SPA frontend dynamically constructs bucket URLs for both media types using the same path suffix (e.g., `<s3BucketUrl>/<sourceId>/audio/<bookId>/[groupId]/<unitId>.mp3` and `.vtt`). Keeping them paired in the same S3 directory ensures the app can successfully fetch and sync captions.

The React frontend parsing is then fully automated: clicking any paragraph in the browser immediately grabs the element's `id`, matches it to the prepended `pX|` tag in the VTT track, and jumps the audio timeline directly to the start of that paragraph!
