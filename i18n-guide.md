In our hierarchical design, **i18n is achieved by utilizing Tier 4 (Collections) as language namespaces.**

This allows us to selectively add language support *only* where it is needed, while other pathways remain clean, flat, and English-only.

Here is a breakdown of how this hierarchy behaves under the hood and how to structure mock directories and files to test this selective implementation.

---

### The 7-Tier Universal Hierarchy

When translating this design into a test mock, remember the universal hierarchy layout:
1. **Library** (Root directory)
2. **Section** *(Optional folder, e.g., `classical/`)*
3. **Source** *(e.g., `wom/`, `oe/`, `acim/`)*
4. **Collection** `<-- THIS IS THE LANGUAGE TIER` *(e.g., `english/`, `polish/`, `german/`)*
5. **Book** *(e.g., `text/`, `workbook/`)*
6. **Group** *(Optional chapter/section folders, e.g., `ch1/`)*
7. **Unit** *(Markdown documents, e.g., `l01.md`)*

---

### 1. Mock Folder Layout for Localized vs. Non-Localized Paths

To test this behavior, you should create a mixed structure where one source (`wom`) uses language collections, while another source (`acim`) completely bypasses the collection tier to map books directly.

```text
temp-test-content/
├── info.json                           <-- Root (defines sources)
│
├── acim/                               <-- Non-Localized (Flat English)
│   ├── info.json                       <-- Defines books directly: "books": ["text"]
│   └── text/
│       └── info.json                   <-- Defines "units"
│
└── wom/                                <-- Localized (Uses collections)
    ├── info.json                       <-- Defines collections: "collections": ["english", "polish"]
    ├── english/                        <-- Collection Tier
    │   ├── info.json                   <-- Defines books: "books": ["text"]
    │   └── text/
    │       └── info.json               <-- Defines "units"
    └── polish/                         <-- Collection Tier
        ├── info.json                   <-- Defines books: "books": ["text"]
        └── text/
            └── info.json               <-- Defines "units"
```

---

### 2. How `info.json` Files Must Be Defined in Tests

To verify that the config generator successfully parses both structures, set up your test `info.json` metadata like this:

#### Non-Localized Source: `acim/info.json`
```json
{
  "title": "A Course in Miracles",
  "description": "Flat, English-only pathway",
  "books": ["text"]
}
```

#### Localized Source: `wom/info.json`
```json
{
  "title": "The Way of Mastery",
  "description": "Dual-language localized pathway",
  "collections": ["english", "polish"]
}
```

#### Language Collection: `wom/polish/info.json`
```json
{
  "title": "Wersja Polska (Polish)",
  "description": "Polish translation of The Way of Mastery",
  "books": ["text"]
}
```

---

### 3. Assertions to Make in Your Tests

When validating the compiled configuration output, verify the following three key behaviors:

1. **Existence of Collections on Localized Sources:**
   ```javascript
   // Assert wom lists collections
   assert.deepStrictEqual(config.sourceInfo.wom.collections, ["english", "polish"]);
   assert.ok(config.sourceInfo.wom.collectionInfo.polish);
   ```

2. **Absence of Collections on Flat Sources:**
   ```javascript
   // Assert acim bypasses collections entirely
   assert.strictEqual(config.sourceInfo.acim.collections, undefined);
   assert.strictEqual(config.sourceInfo.acim.collectionInfo, undefined);
   assert.deepStrictEqual(config.sourceInfo.acim.books, ["text"]);
   ```

3. **Correct Deep URL Generation for Book Landing Pages:**
   * Localized book landing page URL: `/read/wom/polish/text`
   * Non-localized book landing page URL: `/read/acim/text`

Let's begin! Share the first, simplest hierarchical navigation edge case or bug you've found and we'll dive in.
