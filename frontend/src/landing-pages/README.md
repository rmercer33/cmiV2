# Custom Landing Page Integration Guide (MDX)

This directory is the designated storage folder for **custom landing page overrides** using MDX (Markdown + React). 

The platform supports a highly flexible, cascading directory-based resolution engine. You can create customized layouts and interactive landing pages for the site home, sections, spiritual sources, collections, or individual books. If no custom MDX file is found for a specific page, the system automatically falls back to your database-driven default card layouts.

---

## Table of Contents
1. [Core Features](#core-features)
2. [Site Home Landing Page](#site-home-landing-page)
3. [Hierarchical Overrides & Directory Naming](#hierarchical-overrides--directory-naming)
4. [Resolution Cascading Path Reference](#resolution-cascading-path-reference)
5. [How to Create an MDX Landing Page](#how-to-create-an-mdx-landing-page)
6. [Deployment & Compiling](#deployment--rebuilding)

---

## Core Features
*   **Markdown Simplicity:** Write content in clean, readable markdown (lists, bold text, links).
*   **React Power:** Insert custom styled inline HTML, custom styles, or full React components directly inside the Markdown.
*   **Graceful Fallbacks:** If a custom override does not exist for an active ID, the app automatically falls back to the default dynamically generated catalog cards (e.g. lists of books, chapters, or units).
*   **Automated Navigation Shell:** Custom overrides for sub-pages (sections, sources, collections, books) are automatically rendered with a **Back Button** at the top of the container, maintaining intuitive app shell navigation.

---

## Site Home Landing Page
The main dashboard (the absolute root URL `/`) is overridden by editing the **`Welcome.mdx`** file directly in this folder.
*   **File Path:** `frontend/src/landing-pages/Welcome.mdx`
*   **Layout Context:** Renders below the global header/site logo and above the automatic "Library Sections" index card display.

---

## Hierarchical Overrides & Directory Naming
To prevent naming collisions (such as different sources having a book with the same identifier, like `workbook`), you can nest your MDX files into folders that mirror the URL structure of the library.

### Folder Structure Overview
Place your overrides under the following subdirectories:
*   `sections/` — Override Section-level views.
*   `sources/` — Override Source-level views (available collections & books).
*   `collections/` — Override Collection-level views.
*   `books/` — Override Book-level views (table of contents / chapter listings).

*Note: For maximum flexibility, the resolution engine scans deeply nested custom paths before falling back to flat filenames.*

---

## Resolution Cascading Path Reference

When navigating the library, the system resolves custom landing pages based on the following fallback priority lists:

### 1. Section Pages (`/read/[sectionId]`)
The engine checks paths in this order:
1.  `landing-pages/[sectionId].mdx` *(e.g. `landing-pages/wom.mdx`)*
2.  `landing-pages/sections/[sectionId].mdx` *(e.g. `landing-pages/sections/wom.mdx`)*

### 2. Source Pages (`/read/[sectionId]/[sourceId]` or `/read/[sourceId]`)
The engine checks paths in this order:
1.  `landing-pages/[sectionId]/[sourceId].mdx` *(e.g. `landing-pages/acol/col.mdx`)*
2.  `landing-pages/[sourceId].mdx` *(e.g. `landing-pages/col.mdx`)*
3.  `landing-pages/sources/[sourceId].mdx` *(e.g. `landing-pages/sources/col.mdx`)*

### 3. Collection Pages (`/read/[sourceId]/[collectionId]`)
The engine checks paths in this order:
1.  `landing-pages/[sectionId]/[sourceId]/[collectionId].mdx`
2.  `landing-pages/[sourceId]/[collectionId].mdx` *(e.g. `landing-pages/col/book1.mdx`)*
3.  `landing-pages/collections/[collectionId].mdx` *(e.g. `landing-pages/collections/book1.mdx`)*

### 4. Book Pages (`/read/[sourceId]/[bookId]`)
The engine checks paths in this order:
1.  `landing-pages/[sectionId]/[sourceId]/[collectionId]/[bookId].mdx`
2.  `landing-pages/[sectionId]/[sourceId]/[bookId].mdx`
3.  `landing-pages/[sourceId]/[collectionId]/[bookId].mdx` *(e.g. `landing-pages/acol/col/book1/workbook.mdx`)*
4.  `landing-pages/[sourceId]/[bookId].mdx` *(e.g. `landing-pages/raj/workbook.mdx`)*
5.  `landing-pages/books/[bookId].mdx` *(e.g. `landing-pages/books/workbook.mdx`)*

---

## How to Create an MDX Landing Page

Here is an example of an MDX file showing how to blend markdown, CSS, and inline React elements:

```mdx
# Custom Course Landing Page

Welcome to the **ACOL** study module. This landing page is customized using MDX.

### Special Directives:
*   Read each unit sequentially.
*   Take notes in your study journal.

{/* Custom styled HTML/JSX wrapper */}
<div style={{
  padding: '1.5rem',
  backgroundColor: 'var(--bg-highlight)',
  borderLeft: '4px solid var(--accent-color)',
  borderRadius: '6px',
  margin: '2rem 0',
  boxShadow: '0 2px 4px var(--shadow-color)'
}}>
  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-header)' }}>Study Notice</h4>
  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
    Please ensure you are logged into your local study session to keep track of reading time.
  </p>
</div>

Choose an active reading unit from the sidebar to begin.
```

---

## Deployment & Rebuilding

### Local Development
Vite's hot-module replacement (HMR) automatically tracks MDX imports. Any time you add, rename, or save an `.mdx` file, the changes will render in your browser instantly without needing a manual restart:
```bash
cd frontend
npm run dev
```

### Production Build
Because MDX is compiled into optimized JavaScript components at build-time to ensure instant page load speeds, you must rebuild the application to bundle new overrides for your production servers:
```bash
cd frontend
npm run build
```