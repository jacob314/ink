# fix(text-wrap): floor text node width when calling wrapOrTruncateStyledChars

When Yoga calculates layout widths, it often provides floating point values (e.g. `19.04` instead of `19`). However, because terminal output operates on discrete integer columns, our `wrapOrTruncateStyledChars` implementation uses this width as a hard character limit. 

Previously, passing `19.04` to `wrapOrTruncateStyledChars` caused the wrapper algorithm to treat the limit as an unconstrained value for characters, occasionally keeping an un-wrapped chunk up to length 20 while the physical space available to render it was actually 19. This caused characters at the end of the line to be physically truncated or pushed outside terminal boundaries.

By explicitly applying `Math.floor(width)` before computing wrapping chunks, we align our wrapping constraint behavior with upstream Ink and ensure text is strictly wrapped to integer boundaries that actually fit the container.
# fix(layout): workaround yoga flex-shrink bug in column containers

When measuring the maximum width of a text node inside a column-oriented flex container, Yoga sometimes fails to properly account for the parent's actual bounded width if `flexShrink` is involved. As a result, Yoga reports a `computedWidth` for the text node that is larger than its parent's width, causing text to wrap too late and get clipped or overflow the terminal boundary.

By explicitly bounding the text node's computed width to `Math.min(yogaNode.getComputedWidth(), yogaNode.getParent()?.getComputedWidth())`, we enforce standard CSS flexbox behavior.

**Why this is safe:**
1. **Normal Flow:** In standard layouts, a child node should not exceed its parent's width unless explicitly sized. This fix ensures text properly wraps within the bounds of its container.
2. **Horizontal Scrolling (`overflow-x: scroll`):** For scrolling containers with `align-items: stretch` (the default), standard CSS dictates that the child's width still stretches to match the *viewport* width of the container. Therefore, wrapping to the parent's visible width is exactly the right behavior, preventing users from having to scroll horizontally just to read a wrapped paragraph. If infinite horizontal text is desired, a user would configure `alignItems: 'flex-start'` or explicit widths, preventing the text from being artificially stretched, and our constraint safely allows Yoga's intended behavior to emerge.

**Why this wasn't needed in upstream Ink:**
Upstream Ink's legacy `Output` engine does not perform strict horizontal clipping. When a text node is incorrectly sized by Yoga and overflows its container, upstream simply writes the overflowing string to the output buffer anyway. The `test-wrap-truncation.tsx` test merely strips whitespace and checks if all characters exist in the output, meaning it passes upstream even though the text physically exceeded the intended bounds.

Our branch uses a modern `Canvas`-based `TerminalBufferWorker` that strictly enforces terminal boundaries and correctly clips any out-of-bounds characters. Because our renderer accurately drops characters that are drawn outside the parent's actual width, it exposed this latent Yoga layout bug that upstream's looser rendering pipeline silently ignored.
