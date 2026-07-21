# Bulk Metadata Modifier Utility

The `scripts/bulk-modifier.mjs` script is a powerful, automated utility designed to batch-modify frontmatter metadata inside Markdown (`.md`) files and JSON attributes inside `.json` configuration files (such as `info.json`). 

It is designed to simplify managing large content hierarchies by avoiding manual, repetitive edits across hundreds of content files.

---

## Key Features

1. **Dual Format Compatibility**:
   - **Markdown (`.md`)**: Safely parses, updates, and serializes the `---` YAML frontmatter blocks using `js-yaml` without ever modifying or corrupting the main body content.
   - **JSON (`.json`)**: Reads, modifies, and pretty-prints JSON structures natively.

2. **Distinct Modifying Semantics**:
   - **`set`**: Adds the specified keys and values **only if they do not already exist** in the target file.
   - **`replace`**: Adds the specified keys and values, **explicitly overwriting** them if they are already present.
   - **`delete`**: Safely **removes** specified attributes if they are present.

3. **Dynamic `<basename>` Token**:
   - Any string value containing `<basename>` is automatically replaced with the file's name (minus its extension) at runtime. For example, `early/ble.md` will compile `<basename>` to `ble`. This is ideal for bulk-assigning audio file mappings or relative link anchors.

4. **Self-Contained Wildcard Matching**:
   - Uses an optimized directory walker supporting wildcards (`*`) and recursive double wildcards (`**`) to target deeply nested files accurately across your directories.

---

## Configuration Schema

The script expects a path to a JSON configuration file (e.g. `tasks.json`) containing an array of one or more task objects:

```json
[
  {
    "match": "../cmiContent/example/flat/wom/english/early/*.md",
    "set": {
      "audiofn": "<basename>",
      "draft": "true"
    },
    "replace": {
      "author": "Rick Mercer"
    },
    "delete": [
      "obsolete_key"
    ]
  }
]
```

### Task Attributes:
* **`match`** *(Required)*: The glob pattern matching the files you want to modify (relative to your command-running location).
* **`set`** *(Optional)*: An object of key/value pairs to add *only if absent*.
* **`replace`** *(Optional)*: An object of key/value pairs to *always overwrite*.
* **`delete`** *(Optional)*: An array of key names to *remove*.

---

## How to Run It

Run the modifier script using Node.js from your project root, passing the path of your task JSON file as the single argument:

```bash
node scripts/bulk-modifier.mjs path/to/your-tasks.json
```

### Example Logs Output:
```text
==========================================================
            Bulk Metadata Modifier Script Started          
==========================================================

Processing match pattern: "../cmiContent/example/flat/wom/english/early/*.md"...
Found 13 matching files.

  [UPDATED] ../cmiContent/example/flat/wom/english/early/ble.md
  [UPDATED] ../cmiContent/example/flat/wom/english/early/c2s.md
  [UPDATED] ../cmiContent/example/flat/wom/english/early/com.md

Finished task. Modified 3 files.
----------------------------------------------------------

Bulk metadata modification completed successfully!
Total files modified across all patterns: 3
```

---

## Common Use Cases

### A. Batch Map Audio Files (`audiofn`)
If you have a collection of lessons and want to automatically assign their `audiofn` frontmatter tags to match their filenames (but only if they don't already have one configured):

**Task Configuration (`map-audio.json`)**:
```json
{
  "match": "../cmiContent/example/flat/wom/english/**/*.md",
  "set": {
    "audiofn": "<basename>"
  }
}
```

### B. Bulk Remove Obsolete Attributes
To remove deprecated metadata fields across all files in your content database:

**Task Configuration (`remove-keys.json`)**:
```json
{
  "match": "../cmiContent/example/flat/**/*.md",
  "delete": [
    "old_author",
    "deprecated_date"
  ]
}
```

### C. Overwrite Copyrights on info.json Files
To recursively overwrite a global copyright statement on all `info.json` folders:

**Task Configuration (`update-copyright.json`)**:
```json
{
  "match": "../cmiContent/example/flat/**/info.json",
  "replace": {
    "copyright": "Copyright © 2026 Christ Mind Inward"
  }
}
```
