# Sticky Headers Example

This example demonstrates how to implement sticky headers in a scrollable view using Ink.

## Usage

You can run the example interactively:

```bash
npm run example examples/sticky/index.ts
```

### Command Line Arguments

The example also supports several command-line arguments to customize its initial state:

- `--no-static`: Disables the use of `StaticRender`. By default, the example uses `StaticRender` blocks to optimize rendering.
- `--items <number>`: Populates the list with a specific number of item groups on startup (each group adds 20 lines). This is equivalent to pressing the `space` bar the specified number of times.
- `--scroll-down <number>`: Automatically scrolls down the specified number of lines on startup.
- `--export [filename]`: Triggers a render, exports the current frame to the specified filename (defaults to `snapshot.json`), and then exits automatically. This is useful for testing or debugging.
- `--record [filename]`: Starts recording all frames to the specified filename (defaults to `recording.json`) and saves it when the process exits.

### Examples

**Start with 50 groups of items:**

```bash
npm run example examples/sticky/index.ts -- --items 50
```

**Record a session to a custom file:**

```bash
npm run example examples/sticky/index.ts -- --record custom-recording.json
```

**Start with 10 groups, scrolled down 50 lines, and export to custom file immediately:**

```bash
npm run example examples/sticky/index.ts -- --items 10 --scroll-down 50 --export custom-snapshot.json
```

**Run interactively without using StaticRender:**

```bash
npm run example examples/sticky/index.ts -- --no-static
```

### Interactive Controls

While running interactively, you can use the following keys:

- `space`: Add another block of 20 items.
- `c`: Clear the list.
- `b`: Toggle the scrollbar on/off.
- `t`: Toggle the border.
- `f`: Collapse/expand the footer.
- `a`: Toggle alternate buffer and sticky headers.
- `h`: Toggle sticky headers in the backbuffer.
- `v`: Toggle stable scrollback.
- `e`: Export the current frame to `snapshot.json`.
- `r`: Toggle recording to `recording.json`.
- `up arrow` / `w`: Scroll up (Hold `Shift` with arrows or use `w` for larger jumps).
- `down arrow` / `s`: Scroll down (Hold `Shift` with arrows or use `s` for larger jumps).
