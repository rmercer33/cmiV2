# Interactive Template Development (Hot Recompilation)

Developing Handlebars layouts (`.hbs` files) for the `cmiLibrary` reader can be fully automated using the live-compilation watcher script. This ensures that every change you make to a layout or a markdown content file is instantly compiled and available in the frontend without manually re-running the parser commands.

---

## 1. Create a Watch Configuration File

To start, create a small JSON file (e.g., `watch-config.json` at the project root) to specify the target file you are currently designing:

```json
{
  "filepath": "../cmiContent/example/flat/book1/chap0q.md",
  "source": "example",
  "book": "book1",
  "unit": "chap0q"
}
```

### Configuration Fields:
* **`filepath`**: *(Required)* Path to the source Markdown file you are testing with.
* **`source`**: *(Optional)* The source ID (partition key) to use during parsing.
* **`book`**: *(Optional)* The book ID.
* **`unit`**: *(Optional)* The unit/lesson ID.

---

## 2. Launching the Watcher

Run the `./watch-template.sh` script from the project root directory, passing the path to your watch configuration:

```bash
./watch-template.sh watch-config.json
```

Once started, **Nodemon** will automatically watch:
1. All template files inside the `/templates` directory.
2. The specific test Markdown file defined in your config.

Whenever either of these files is saved, the pipeline immediately recompiles the output HTML.

---

## 3. High-Speed Preview Workflow

To see your template styles and structure update dynamically in the exact styling environment of the frontend:

1. **Start the Frontend Dev Server**:
   ```bash
   cd frontend
   npm run dev
   ```
2. **Start the Watcher Script** in a separate terminal tab.
3. Open your browser to the local dev URL (e.g., `http://localhost:5173`) and navigate to the module you are designing.
4. Position your code editor (editing your `.hbs` file or `.md` file) side-by-side with your browser.
5. **Save and Refresh**: Every time you save your Handlebars file, the HTML is rebuilt instantly behind the scenes. Simply reload your browser page to view your live visual layout and style changes!

