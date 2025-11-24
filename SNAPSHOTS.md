# Ink Snapshot & Replay Viewer

Ink features an internal tool to capture and inspect the exact layout, state, and rendered text of a UI frame (or sequence of frames) when using the `terminalBuffer` rendering pipeline. This is exceptionally useful for debugging layout glitches, clipping boundaries, scrolling regressions, and sticky header behavior.

## Creating a Snapshot

To use the snapshot feature, you must have the `terminalBuffer` option enabled in your `render()` call.

```tsx
import React from 'react';
import { render, useApp } from 'ink';

const App = () => {
    const { dumpCurrentFrame } = useApp();
    
    // Sometime later, trigger a dump:
    // dumpCurrentFrame('snapshot.json');

    return <Box>...</Box>;
}

render(<App />, { terminalBuffer: true });
```

### Example via Keyboard Shortcut
In the provided sticky headers example (`examples/sticky`), you can press **'e'** to export a snapshot of the current view interactively using the `useApp` hook (which returns the underlying `AppContext`).

```tsx
import { useApp, useInput } from 'ink';

const MyComponent = () => {
    const { dumpCurrentFrame } = useApp();

    useInput((input) => {
        if (input === 'e') {
            dumpCurrentFrame('snapshot.json');
        }
    });

    return <Box>...</Box>;
}
```

Alternatively, you can call the method from the `instance` returned by `render`:
```tsx
const instance = render(<App />, { terminalBuffer: true });
instance.dumpCurrentFrame('snapshot.json');
```

When `dumpCurrentFrame('snapshot.json')` is called, two files are created:
1. `snapshot.json` - Contains the absolute layout bounds (x, y, width, height, scroll heights) for every region, as well as the base64 encoded binary data representing the styled text within those regions. This file can be loaded back into the viewer to precisely replay the terminal state.
2. `snapshot.json.dump.txt` - A human-readable text representation of the regions and their plain text content mapped to visual coordinates. This extracts the exact text rendered but strips out ANSI color codes and layout metadata for easy readability and debugging.

## Replaying Snapshots in the Viewer

Once you have a `snapshot.json` file, you can load it in the headless viewer. The viewer reconstructs the internal worker state and handles scrolling locally *without* relying on the React or DOM layers—making it perfect for isolating bugs within the terminal writer and scroll optimizer.

```bash
npx tsx tools/viewer/viewer.ts snapshot.json
```

### Viewer Controls
When loaded in the viewer:
- **Up / Down Arrow**: Scroll the terminal's main scrollable region up and down by 1 line.
- **Shift + Up / Down Arrow**: Scroll 10 lines at a time.
- **PageUp / PageDown (or W / S)**: Scroll 100 lines at a time.
- **Left / Right Arrow (or Space)**: For sequences, advance or go back to previous frames.
- **Ctrl+C**: Exit the viewer.

## Manually Dumping Snapshots

If you need to regenerate the human-readable `snapshot.json.dump.txt` from a `.json` payload, or want to inspect a sequence manually, you can use the command-line dumper:

```bash
npx tsx src/worker/dump-replay.ts snapshot.json
```