# Components

Components are self-contained pieces of UI that can be picked up and used somewhere else.

**Where they live**
- Used by **one page**: `src/pages/<page>/components/<name>/` (e.g. `src/pages/reporting/components/timeline/`).
- Used by **more than one page**: here, in `src/components/<name>/` (e.g. `nav/`). When a page component is needed on a second page, move its folder here; only import paths change.

**Rules**
- **A component is a folder.** Its `index.ts` is its public API; the other files in the folder are internal.
- **Import a component only by its folder** (`./components/timeline`, `../report_view`), never its internal files.
- **Pass in what it needs** (a container element, options, callbacks); it returns a controller if it has one. A component doesn't look up page elements by id or know which page it's on.
- **Dependencies:** `src/services/`, `src/helpers/`, `src/types/`, and other components through their `index.ts`. Never page scripts.
- `nav/` is the one exception: it adds behavior to the site nav markup that every page's HTML already contains, and has no exports. Each page's HTML loads it directly as `nav/navigation_bar.ts`, so it has no `index.ts`.

Styles for components still live in the shared `src/styles.css`.
