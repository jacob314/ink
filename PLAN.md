# Plan: Scroll Optimization in Ink

## Objective
Optimize rendering performance by utilizing terminal scroll capabilities (`scrollLines`) instead of re-rendering the entire screen when content scrolls. Implement support for sticky headers and scrollbars within the `render-worker`.

## Architecture Changes

1.  **Stable Identity**:
    *   Add a unique `internal_id` to `DOMElement` in `src/dom.ts` to track nodes across renders.

2.  **Metadata Collection (`Output` & `render-node-to-output`)**:
    *   Extend `Output` class to store metadata:
        *   `scrollRegions`: List of active scrollable areas (id, bounds, scroll state).
        *   `stickyHeaders`: List of sticky headers (lines to render, position, visibility range).
        *   `scrollbars`: List of scrollbars to render (position, size, thumb).
    *   Modify `render-node-to-output.ts`:
        *   **Scrollbars**: Stop rendering scrollbars directly to the character grid. Instead, add them to `Output` metadata.
        *   **Sticky Headers**: Stop rendering the "stuck" version of sticky headers to the main grid. Instead, render them to a temporary `Output`, capture the lines, and add to `Output` metadata.
        *   **Scroll Regions**: Capture layout and scroll state of scrollable boxes and add to `Output` metadata.

3.  **Renderer Update (`renderer.ts`)**:
    *   Pass the collected metadata from `Output` to the `Result` object returned by `renderer`.

4.  **Terminal Buffer Logic (`src/terminal-buffer.ts`)**:
    *   Update `splice` (or add `update`) to accept the new metadata.
    *   Maintain a map of "previous frame" scroll regions.
    *   Detect Scroll:
        *   Compare current `scrollTop` with previous for each region.
        *   If changed, calculate delta.
        *   Modify the local shadow buffer (`this.lines`) by shifting lines (simulating the scroll).
        *   Generate a `scroll` command for the worker.
    *   Calculate Diffs:
        *   After simulating scroll, diff the shadow buffer against the new frame's lines.
        *   This diff should now be minimal (only new content).
    *   Send Payload:
        *   Send `scroll` commands, `updates` (diffs), `stickyHeaders`, and `scrollbars` to the worker.

5.  **Render Worker (`src/render-worker.ts` & `src/terminal-writer.ts`)**:
    *   Handle `scroll` commands:
        *   Call `terminalWriter.scrollLines`.
    *   Handle Overlays:
        *   After applying text updates, render **Sticky Headers** and **Scrollbars** on top of the content.
    *   **Sticky Headers**:
        *   Draw the provided `lines` at the specified target Y (relative to scroll region or absolute).
        *   Ensure they are only drawn if within the visible range.
    *   **Backbuffer**:
        *   Identify if a scroll region is the "topmost" (e.g., `y=0` or root).
        *   If so, set `scrollToBackbuffer: true` when scrolling up.

## Detailed Steps

### 1. `src/dom.ts`
*   Add `internal_id: number` to `DOMElement`.
*   Initialize it in `createNode` using a global counter.

### 2. `src/output.ts`
*   Add interfaces: `ScrollRegion`, `StickyHeader`, `Scrollbar`.
*   Add arrays to `Output` to store these.
*   Add methods: `addScrollRegion`, `addStickyHeader`, `addScrollbar`.

### 3. `src/render-node-to-output.ts`
*   **Scrollbars**: Remove calls to `renderVerticalScrollbar`/`renderHorizontalScrollbar`. Replace with `output.addScrollbar(...)`.
*   **Sticky Headers**:
    *   In the post-order traversal (where `activeStickyNode` is handled):
    *   Disable the direct `renderNodeToOutput` call for the stuck node.
    *   Create a temp `Output`.
    *   Render the stuck node to temp output.
    *   Capture lines.
    *   Call `output.addStickyHeader(...)` with lines, position, and "valid range" (startRow/endRow).
*   **Scroll Regions**:
    *   Inside the `ink-box` handling, if `overflow` is scroll:
    *   Call `output.addScrollRegion(...)` with computed layout (x, y, width, height) and scroll state.

### 4. `src/renderer.ts`
*   Extract metadata from `output.get()` and return it.

### 5. `src/serialization.ts`
*   Update `Serializer` and `Deserializer` to handle the new metadata structures (or use JSON if performance permits, but binary is preferred for `lines`).
*   *Self-correction*: The worker uses `process.send` which serializes JSON automatically for the structure, but `lines` are binary serialized. We can keep `lines` binary and pass metadata as plain objects in the message payload.

### 6. `src/terminal-buffer.ts`
*   Track `previousScrollRegions`.
*   In `splice`:
    *   Iterate `newScrollRegions`. Find match in `previous`.
    *   If `scrollTop` diff != 0:
        *   Check bounds (exclude borders).
        *   Apply shift to `this.lines`.
        *   Push `scroll` op to `pendingOps`.
*   Pass `stickyHeaders` and `scrollbars` through to worker.

### 7. `src/render-worker.ts`
*   Update `update` method to accept `scrolls`, `overlays`.
*   Execute scrolls.
*   Apply line updates.
*   Render overlays (sticky, scrollbars).

### 8. `src/terminal-writer.ts`
*   Ensure `scrollLines` handles the `scrollToBackbuffer` logic correctly (it seems to exist already).

## Verification
*   Verify scrolling a long list is performant (minimal diffs).
*   Verify sticky headers stay fixed and render correctly.
*   Verify scrollbars update correctly.
*   Verify top-level scrolling pushes to backbuffer.
*   Verify nested scrolling clips correctly (no backbuffer pollution).
