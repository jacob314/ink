# Gemini Context for Ink

This repository contains the source code for **Ink**, a library for building command-line interfaces using React.

**Do not edit package.json unless specifically instructed to that file.**

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
- **Important:** the repository uses tabs not spaces so be sure to use tabs instead of spaces for indentation.
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

#### `src/worker/`
This directory contains the modern rendering pipeline for Ink, which contains the recommended renders for Gemini CLI.
- **`render-worker.ts`**: The main entry point for the rendering worker. It handles scene composition, scroll management, and coordination between primary and alternate buffers.
- **`terminal-writer.ts`**: A low-level utility that handles optimized writing to the terminal, including line diffing, cursor management, and synchronized output.

**Important:** New features MUST be added for these efficient renders. Note that this new renderer ONLY supports `<StaticRender>` and will never support the legacy `<Static>` component.

**Note:** `src/log-update.ts` and its associated rendering logic in `src/render-node-to-output.ts` are considered **obsolete** and are being replaced by the worker-based architecture. Support for new features in these legacy renderers is optional.

#### `src/render-node-to-output.ts` (Obsolete)
This module was responsible for traversing the Ink DOM tree and generating an intermediate `Output` representation.

#### `src/log-update.ts` (Obsolete)
This module managed the actual output to the terminal `stdout` in the legacy rendering pipeline.

### Testing Guidelines
- **End-to-End Testing:** When possible, tests SHOULD use `xterm.js` headless (via `@xterm/headless`) to verify the actual rendered output end-to-end, rather than taking test snapshots. This allows for asserting on the final state of the terminal buffer, including cursor position and alternate buffer state. For examples of the most complete such tests, see `test/render-worker-xterm.test.ts` and `test/terminal-writer-xterm.test.ts`.

### Legacy Features
- **`<Static>`**: This component is considered a legacy feature. It is intended for permanently outputting text above the active Ink app (like a log). However, it is **not fully supported in alternate buffer mode** and will NEVER be supported by the new worker-based renderer. The architectural challenge is that `<Static>` relies on side-effects that can conflict with the strict timing requirements of `useLayoutEffect` used in the main rendering loop, potentially leading to out-of-order output or visual glitches in full-screen apps.
- **`<StaticRender>`**: This is the more modern and efficient replacement for `<Static>`, designed to work better with the new rendering pipeline and avoid the pitfalls of the legacy implementation. This is the only static-style component supported by the new renderer. Use this instead of `<Static>` for new developments.
