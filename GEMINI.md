# Gemini Context for Ink

This repository contains the source code for **Ink**, a library for building command-line interfaces using React.

## Repository Structure

- **`src/`**: Contains the core logic of the library.
  - `ink.tsx`: Main entry point and rendering logic.
  - `components/`: Built-in components like `Box`, `Text`, `Static`, etc.
  - `hooks/`: Custom hooks like `useInput`, `useApp`, etc.
  - `dom.ts`: Custom DOM implementation for the terminal.
  - `reconciler.ts`: React reconciler configuration.
  - `styles.ts`: Style handling (Yoga layout integration).
- **`examples/`**: Contains various example applications demonstrating Ink's features.
- **`test/`**: Contains the test suite using [AVA](https://github.com/avajs/ava).

## Development Workflow

### Building
The project uses TypeScript. You can build the project using:
```bash
npm run build
```

### Testing
Tests are written using AVA. To run tests:
```bash
npm test
```

**Note:** Some tests may fail when run locally depending on the environment. Below is a snapshot of tests that are known to fail in some local environments (specifically macOS) as of Nov 2025. These tests **do not fail** on the continuous integration bots. **Do not attempt to fix these unless you are specifically working on them.**

- `focus › focus the first component to register`
- `focus › focuses first non-disabled component`
- `focus › switch focus to first component on Tab`
- `focus › switch focus to the next component on Tab`
- `focus › skip disabled component on Tab`
- `focus › switch focus to the last component if currently focused component is the first one on Shift+Tab`
- `focus › skip disabled component on Shift+Tab`
- `focus › skips disabled elements when wrapping around from the front`
- `focus › switch focus to the first component if currently focused component is the last one on Tab`
- `focus › switch focus to the previous component on Shift+Tab`
- `focus › skips disabled elements when wrapping around`
- `exit › exit normally without unmount() or exit()`
- `hooks › useInput - should not count as an uppercase character`
- `hooks › useInput - pasted carriage return`
- `exit › exit with thrown error`
- `hooks › useStdout - write to stdout`

### Linting and Formatting
- The project uses `xo` for linting.
- **Important:** There are existing lint warnings in the codebase. **Do not fix them.** Fixing these warnings can make merging changes from the upstream `ink` repository more difficult.
- **Specific Warnings to Ignore:**
  - `@typescript-eslint/promise-function-async`: Found in `test/components.tsx` and `src/components/Static.tsx`. Fixing these often introduces subtle bugs or changes behavior unexpectedly.
  - `max-depth`: Found in `src/log-update.ts` and `src/render-node-to-output.ts`.
  - `no-warning-comments`: TODOs in `src/hooks/use-input.ts` and `test/hooks.tsx`.

- To format a file using Prettier, use the following command:
  ```bash
  npx prettier --write <filePath>
  ```

### Running Examples
To run an example, use the `npm run example` script followed by the path to the example file.
```bash
npm run example examples/counter/counter.tsx
```

## Feature Development Guidelines

### New Features
- **Conceptual Consistency:** When adding new features, strive to keep them conceptually consistent with similar features in the browser (DOM/CSS). This ensures that the API remains intuitive for React developers who are accustomed to web development.
- **Examples:** For any large new feature, **always create a new example** in the `examples/` directory to demonstrate its usage.

## Key Conventions
- **React for CLI**: Ink uses React to render to the terminal. It implements a custom reconciler and DOM-like structure.
- **Layout**: Layout is handled by Yoga (Flexbox implementation).
- **Output**: Output is generated using ANSI escape codes.

## Internal Architecture & APIs

### Measurement & Layout APIs
Ink exposes several internal APIs for measuring elements and retrieving layout information, primarily useful for custom components or advanced use cases. These are tested in `test/measure-element.tsx`.

- **`measureElement(node)`**: Returns the computed width and height of a DOM element.
- **`getBoundingBox(node)`**: Returns the absolute x, y coordinates and dimensions (width, height) of an element relative to the terminal window.
- **`getInnerWidth(node)` / `getInnerHeight(node)`**: Returns the content width/height excluding borders and padding.
- **`getScrollHeight(node)` / `getScrollWidth(node)`**: Returns the total scrollable content size.
- **`getVerticalScrollbarBoundingBox(node)` / `getHorizontalScrollbarBoundingBox(node)`**: Calculates the layout for scrollbars, including the track and thumb position/size, based on the current scroll state.

### Rendering Pipeline

#### `src/render-node-to-output.ts`
This module is responsible for traversing the Ink DOM tree (after Yoga has computed the layout) and generating an intermediate `Output` representation.
- **Layout Mapping**: It maps Yoga's computed layout (relative positions) to absolute terminal coordinates.
- **Clipping**: It handles `overflow: hidden` and `overflow: scroll` by defining clipping regions. Nodes outside the clip region are skipped or truncated.
- **Text Handling**: It handles text wrapping and truncation based on `textWrap` style. It also applies padding to text nodes if the parent Box has padding.
- **Sticky Positioning**: It implements logic for `position: sticky` (or Ink's internal equivalent), ensuring elements stick to the top of the viewport or scroll container.
- **Scrollbars**: It triggers the rendering of scrollbars if the element is scrollable.

#### `src/log-update.ts`
This module manages the actual output to the terminal `stdout`.
- **Modes**: It supports two primary modes:
    - **Standard**: Erases the previous output (using `eraseLines`) and writes the new frame.
    - **Alternate Buffer**: Enters the terminal's alternate screen buffer (full-screen mode).
- **Incremental Rendering**: To improve performance and reduce flickering, it can diff the new output against the previous frame and only write the changed lines (or parts of lines).
- **Synchronized Output**: It uses terminal synchronized output sequences (`\u001B[?2026h` / `l`) to prevent tearing during updates, if supported.
- **Cursor Management**: It handles hiding and showing the cursor during updates to prevent flickering.

### Legacy Features
- **`<Static>`**: This component is considered a legacy feature. It is intended for permanently outputting text above the active Ink app (like a log). However, it is **not fully supported in alternate buffer mode**. The architectural challenge is that `<Static>` relies on side-effects that can conflict with the strict timing requirements of `useLayoutEffect` used in the main rendering loop, potentially leading to out-of-order output or visual glitches in full-screen apps.
