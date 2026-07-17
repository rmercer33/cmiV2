# Technical Guide: Build-Time Markdown Templating (Handlebars)

This directory houses the **Handlebars (`.hbs`) layout templates** used during the static data compilation pipeline. 

By utilizing frontmatter metadata in standard markdown files, authors can wrap their parsed markdown content (converted into HTML) in sophisticated, custom-designed page layouts without writing raw HTML directly inside their source text files.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [How to Create a Handlebars Template](#how-to-create-a-handlebars-template)
3. [Mapping Markdown Frontmatter to Templates](#mapping-markdown-frontmatter-to-templates)
4. [Step-by-Step Implementation Example](#step-by-step-implementation-example)
5. [Caching, Logging, & Fallback Behavior](#caching-logging--fallback-behavior)
6. [Compilation Commands](#compilation-commands)

---

## Architecture Overview

The markdown parsing tool (`cmi-data-generator`) is built on top of the **Unified / Remark / Rehype AST** ecosystem. The templating pipeline functions sequentially as follows:

```
[Markdown File (.md)]
       │
       ▼ (Parser extracts frontmatter YAML)
[Frontmatter Attributes] & [Markdown Body AST]
                               │
                               ▼ (Unified compiles AST to HTML string)
                         [Compiled HTML Body]
                               │
                               ▼ (Handlebars loader)
     Checks frontmatter for "template: <template-name>"
     Loads and compiles "templates/<template-name>.hbs"
                               │
                               ▼ (Layout Compilation)
     Merges Compiled HTML into {{{content}}} along with 
     all other frontmatter properties.
                               │
                               ▼ (Final output)
       [HTML Output Fragment (Ready for the Reader SPA)]
```

---

## How to Create a Handlebars Template

Create a new file with the extension `.hbs` inside this `templates/` folder (e.g. `templates/my-custom-layout.hbs`).

### Core Handlebars Rules:
1.  **Immersive Content Injection:** You **must** include `{{{content}}}` (using triple curly braces) to output the parsed markdown body HTML. Using double curly braces `{{content}}` will escape the HTML tags, causing them to render as raw string text on the screen.
2.  **Conditional Rendering:** Use `{{#if variableName}} ... {{/if}}` blocks to only render layout wrappers if a specific frontmatter property is provided by the author.

#### Example Template: `templates/hero-layout.hbs`
```html
<div class="template-hero-layout">
  <!-- Check if a hero image was specified in frontmatter -->
  {{#if heroImage}}
    <div class="hero-banner" style="background-image: url('{{heroImage}}'); height: 300px; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; border-radius: 8px;">
      
      <!-- Check if a special title was specified, otherwise fallback -->
      {{#if heroTitle}}
        <h1 style="color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.6); font-size: 3rem; margin: 0;">{{heroTitle}}</h1>
      {{/if}}
    </div>
  {{/if}}

  <!-- Markdown body content is injected here -->
  <div class="template-content">
    {{{content}}}
  </div>
</div>
```

---

## Mapping Markdown Frontmatter to Templates

Every key-value pair declared in your markdown's frontmatter block (delimited by `---` at the top of the file) is automatically registered as a top-level variable in your Handlebars template.

```yaml
---
template: hero-layout
heroTitle: Immersive Study Module
heroImage: /images/covers/early.jpg
author: Jane Doe
---
# Actual Markdown Content Starts Here...
```

*   **`template`:** *(Reserved)* Tells the generator which `.hbs` file to load.
*   **`{{{content}}}`:** Injects the compiled HTML representation of `# Actual Markdown Content Starts Here...`
*   **`{{heroTitle}}`:** Resolves to `"Immersive Study Module"`
*   **`{{heroImage}}`:** Resolves to `"/images/covers/early.jpg"`
*   **`{{author}}`:** Resolves to `"Jane Doe"`

---

## Step-by-Step Implementation Example

### 1. Write the Template
Create `templates/default.hbs`:
```html
<div class="template-default-layout">
  <div class="layout-meta" style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
    Author: {{author}} | Category: {{category}}
  </div>
  <hr style="border-color: var(--border-color); margin-bottom: 2rem;" />
  <div class="layout-body">
    {{{content}}}
  </div>
</div>
```

### 2. Write the Markdown File
Create `content/my-source/my-book/lesson-01.md`:
```yaml
---
template: default
title: Introduction to Presence
author: Master Study Group
category: Fundamental Teachings
---
# Lesson 1: The Core of Being

Presence is not a destination, it is a state of recognition.
```

### 3. Compile the Markdown File
Run the parser script (which runs `src/index.mjs`):
```bash
./run-parser.sh content/my-source/my-book/lesson-01.md -s my-source -b my-book -u lesson-01
```

### 4. Resulting Generated HTML Fragment
The compiler merges them into the final file in `frontend/public/content/my-source/my-book/lesson-01.html`:
```html
<cmi-unit id="my-source-my-book-lesson-01">
<div class="template-default-layout">
  <div class="layout-meta" style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
    Author: Master Study Group | Category: Fundamental Teachings
  </div>
  <hr style="border-color: var(--border-color); margin-bottom: 2rem;" />
  <div class="layout-body">
    <h1>Lesson 1: The Core of Being</h1>
    <p>Presence is not a destination, it is a state of recognition.</p>
  </div>
</div>
</cmi-unit>
```

---

## Caching, Logging, & Fallback Behavior

### Caching
To maintain high-speed compilations across catalogs containing thousands of markdown files, the generator maintains a **Template Compilation Cache**. 
*   Each `.hbs` file is read from disk and compiled by Handlebars **only once** per execution cycle. Subsequent markdown files referencing the same layout use the compiled, in-memory reference instantly.

### Failures & Graceful Fallbacks
*   **Missing Template:** If a markdown file specifies a template that does not exist in the `templates/` folder (e.g. `template: non-existent`), the parser will issue a warning in the terminal and automatically **fall back to rendering the raw compiled HTML body**. Compilation of the markdown file will complete successfully.
*   **Compile Error:** If there is a syntax error in your `.hbs` file, a terminal warning will output the error description and fallback to the raw HTML, ensuring the pipeline never breaks completely.

---

## Compilation Commands

To test your layouts, compile files using either the single-file or complete-batch run scripts:

```bash
# Parse a specific file
./run-parser.sh <path-to-markdown> -s <source-id> -b <book-id> -u <unit-id>

# Run full batch catalog parse (re-compiles all HTML fragments)
./generate.sh
```