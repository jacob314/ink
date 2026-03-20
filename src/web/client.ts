import {ansiToCss, cssObjToString, type AnsiCode} from './ansi-to-css.js';

// We define minimal interfaces to match what we expect from the server
export type StyledChar = {
	type: 'char';
	value: string;
	fullWidth: boolean;
	styles: AnsiCode[];
};

export type RegionUpdatePayload = {
	id: string | number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	scrollTop?: number;
	scrollLeft?: number;
	scrollHeight?: number;
	scrollWidth?: number;
	isScrollable?: boolean;
	isVerticallyScrollable?: boolean;
	isHorizontallyScrollable?: boolean;
	scrollbarVisible?: boolean;
	backgroundColor?: string;
	opaque?: boolean;
	borderTop?: number;
	borderBottom?: number;
	lines?: {
		totalLength: number;
		updates: Array<{
			start: number;
			end: number;
			lines: StyledChar[][];
		}>;
	};
	stickyHeaders?: Array<{
		y: number;
		type: 'top' | 'bottom';
		lines: StyledChar[][];
		stuckLines?: StyledChar[][];
		naturalRow: number;
		startRow: number;
		endRow: number;
	}>;
};

export type RegionNode = {
	id: string | number;
	children: RegionNode[];
};

export type FrameMessage = {
	tree: RegionNode;
	updates: RegionUpdatePayload[];
};

class WebRenderer {
	regions = new Map<string | number, HTMLElement>();
	linesContainers = new Map<string | number, HTMLElement>();
	stickyContainers = new Map<string | number, HTMLElement>();
	charWidth = 8;
	charHeight = 16;

	constructor(public rootElement: HTMLElement) {
		this.measureChar();
	}

	measureChar() {
		const span = document.createElement('span');
		span.textContent = 'M'.repeat(100);
		span.style.visibility = 'hidden';
		span.style.position = 'absolute';
		span.style.whiteSpace = 'pre';
		document.body.append(span);
		const rect = span.getBoundingClientRect();
		if (rect.width > 0) {
			this.charWidth = rect.width / 100;
			document.documentElement.style.setProperty(
				'--char-width',
				`${this.charWidth}px`,
			);
		}

		if (rect.height > 0) {
			this.charHeight = rect.height;
			document.documentElement.style.setProperty(
				'--char-height',
				`${this.charHeight}px`,
			);
		}

		span.remove();
	}

	renderStyledChars(chars: StyledChar[]): HTMLElement[] {
		const elements: HTMLElement[] = [];
		let currentSpan: HTMLSpanElement | undefined;
		let currentKey = '';

		for (const char of chars) {
			if (!char) {
				continue;
			}

			const cssObj = ansiToCss(char.styles);
			const isHalfBlock = char.value === '▄' || char.value === '▀';
			const cssStr = cssObjToString(cssObj);

			// Grouping key: CSS styles + half-block state
			const key = cssStr + (isHalfBlock ? `|hb|${char.value}` : '|text');

			if (!currentSpan || currentKey !== key) {
				currentSpan = document.createElement('span');

				let finalCss = cssStr;
				if (isHalfBlock) {
					const fg = cssObj.color ?? 'var(--fg-color)';
					const bg = cssObj.backgroundColor ?? 'var(--bg-color)';
					const top = char.value === '▄' ? bg : fg;
					const bottom = char.value === '▄' ? fg : bg;
					finalCss += `;background-image:linear-gradient(to bottom, ${top} 50%, ${bottom} 50%);`;
				}

				if (finalCss) {
					currentSpan.style.cssText = finalCss;
				}

				elements.push(currentSpan);
				currentKey = key;
			}

			currentSpan.textContent += isHalfBlock ? ' ' : char.value;
		}

		return elements;
	}

	update(tree: RegionNode, updates: RegionUpdatePayload[]) {
		const updateMap = new Map<string | number, RegionUpdatePayload>();
		for (const update of updates) {
			updateMap.set(update.id, update);
		}
		
		for (const update of updates) {
			let el = this.regions.get(update.id);
			let linesContainer = this.linesContainers.get(update.id);
			let stickyContainer = this.stickyContainers.get(update.id);

			if (!el) {
				el = document.createElement('div');
				el.className = 'region';
				el.dataset['regionId'] = String(update.id);
				this.regions.set(update.id, el);

				stickyContainer = document.createElement('div');
				stickyContainer.className = 'sticky-container';
				el.append(stickyContainer);
				this.stickyContainers.set(update.id, stickyContainer);

				linesContainer = document.createElement('div');
				linesContainer.className = 'region-content';
				el.append(linesContainer);
				this.linesContainers.set(update.id, linesContainer);

				// Handle native scrolling visibility for sticky headers
				el.addEventListener('scroll', () => {
					if (!el) return;
					const currentScrollTop = el.scrollTop / this.charHeight;
					const currentClientHeight = el.clientHeight / this.charHeight;
					const headers = el.querySelectorAll('.sticky-header');
					for (const headerEl of headers) {
						const naturalRow = Number.parseFloat(
							(headerEl as HTMLElement).dataset['naturalRow'] ?? '0',
						);
						const linesLength = Number.parseFloat(
							(headerEl as HTMLElement).dataset['linesLength'] ?? '0',
						);
						const {type} = (headerEl as HTMLElement).dataset;
						let isStuck = true;
						if (type === 'top') {
							if (naturalRow >= currentScrollTop) {
								isStuck = false;
							}
						} else if (
							naturalRow + linesLength <=
							currentScrollTop + currentClientHeight
						) {
							isStuck = false;
						}

						(headerEl as HTMLElement).style.display = isStuck
							? 'block'
							: 'none';
					}
				});
			}

			// Apply basic layout
			if (update.x !== undefined) {
				el.style.left = `calc(${Math.round(update.x)} * var(--char-width))`;
			}

			if (update.y !== undefined) {
				el.style.top = `calc(${Math.round(update.y)} * var(--char-height))`;
			}

			if (update.width !== undefined) {
				el.style.width = `calc(${Math.round(update.width)} * var(--char-width))`;
			}

			if (update.height !== undefined) {
				el.style.height = `calc(${Math.round(update.height)} * var(--char-height))`;
			}

			if (update.scrollWidth !== undefined && linesContainer) {
				linesContainer.style.width = `calc(${Math.round(update.scrollWidth)} * var(--char-width))`;
			}

			if (update.scrollHeight !== undefined && linesContainer) {
				linesContainer.style.height = `calc(${Math.round(update.scrollHeight)} * var(--char-height))`;
			}

			// Apply colors and opacity
			if (update.backgroundColor) {
				el.style.backgroundColor = update.backgroundColor;
			}

			// Default to opaque to align with TUI rendering
			if (update.opaque !== false) {
				el.style.backgroundColor ||= 'var(--bg-color)';
			} else if (!update.backgroundColor) {
				el.style.backgroundColor = 'transparent';
			}

			// Apply overflow/scrolling
			if (update.isScrollable !== undefined) {
				el.dataset['scrollableY'] = String(update.isScrollable);
				el.dataset['scrollableX'] = String(update.isScrollable);
			}

			if (update.isVerticallyScrollable !== undefined) {
				el.dataset['scrollableY'] = String(update.isVerticallyScrollable);
			}

			if (update.isHorizontallyScrollable !== undefined) {
				el.dataset['scrollableX'] = String(update.isHorizontallyScrollable);
			}

			if (update.scrollTop !== undefined) {
				const target = update.scrollTop;
				requestAnimationFrame(() => {
					if (el) {
						el.scrollTop = target * this.charHeight;
					}
				});
			}

			if (update.scrollLeft !== undefined) {
				const target = update.scrollLeft;
				requestAnimationFrame(() => {
					if (el) {
						el.scrollLeft = target * this.charWidth;
					}
				});
			}

			// Update lines
			if (update.lines && linesContainer) {
				const {totalLength} = update.lines;

				// Ensure correct number of line elements
				while (linesContainer.children.length < totalLength) {
					const lineEl = document.createElement('div');
					lineEl.className = 'line';
					lineEl.style.top = `calc(${linesContainer.children.length} * var(--char-height))`;
					linesContainer.append(lineEl);
				}

				while (linesContainer.children.length > totalLength) {
					linesContainer.lastChild?.remove();
				}

				for (const chunk of update.lines.updates) {
					for (let i = 0; i < chunk.lines.length; i++) {
						const rowIndex = chunk.start + i;
						const lineEl = linesContainer.children[rowIndex] as HTMLElement;
						if (lineEl) {
							lineEl.innerHTML = '';
							const spans = this.renderStyledChars(chunk.lines[i] ?? []);
							for (const span of spans) {
								lineEl.append(span);
							}

							// Reset sticky styling by default
							lineEl.style.position = 'absolute';
							lineEl.style.top = `calc(${rowIndex} * var(--char-height))`;
							lineEl.style.zIndex = '1';
						}
					}
				}
			}

			// Update sticky headers
			if (update.stickyHeaders && stickyContainer) {
				stickyContainer.innerHTML = '';
				for (const header of update.stickyHeaders) {
					const headerEl = document.createElement('div');
					headerEl.className = 'sticky-header';

					// Sync background with region
					headerEl.style.backgroundColor =
						el.style.backgroundColor || 'var(--bg-color)';

					// Real DOM sticky: set top/bottom to 0 and marginTop to natural position
					if (header.type === 'top') {
						headerEl.style.top = '0px';
						headerEl.style.marginTop = `calc(${Math.round(header.naturalRow)} * var(--char-height))`;
					} else {
						headerEl.style.bottom = '0px';
						headerEl.style.marginTop = `calc(${Math.round(header.naturalRow)} * var(--char-height))`;
					}

					const linesToRender = header.stuckLines ?? header.lines;
					for (const line of linesToRender) {
						const lineEl = document.createElement('div');
						lineEl.className = 'line';
						lineEl.style.position = 'relative'; // Flow within sticky header
						lineEl.style.top = '0px';

						const spans = this.renderStyledChars(line ?? []);
						for (const span of spans) {
							lineEl.append(span);
						}

						headerEl.append(lineEl);
					}

					stickyContainer.append(headerEl);
				}
			}
		}

		// Re-sync DOM hierarchy and remove orphaned regions
		const activeRegionIds = new Set<string | number>();
		const collectActiveIds = (node: RegionNode) => {
			activeRegionIds.add(node.id);
			for (const child of node.children) {
				collectActiveIds(child);
			}
		};

		collectActiveIds(tree);

		// Remove regions no longer in the tree
		for (const [id, el] of this.regions) {
			if (!activeRegionIds.has(id)) {
				el.remove();
				this.regions.delete(id);
				this.linesContainers.delete(id);
				this.stickyContainers.delete(id);
			}
		}

		const buildDomTree = (node: RegionNode, parentEl: HTMLElement) => {
			const el = this.regions.get(node.id);
			const update = updateMap.get(node.id);
			
			if (el) {
				if (el.parentElement !== parentEl) {
					parentEl.append(el);
				}
				
				// Apply relative positioning based on absolute coordinates
				if (update) {
					// We store the absolute coordinates on the element dataset to reuse them if they aren't in this update
					if (update.x !== undefined) el.dataset['absX'] = String(update.x);
					if (update.y !== undefined) el.dataset['absY'] = String(update.y);
					if (update.scrollTop !== undefined) el.dataset['scrollTop'] = String(update.scrollTop);
					if (update.scrollLeft !== undefined) el.dataset['scrollLeft'] = String(update.scrollLeft);
					
					const absX = parseFloat(el.dataset['absX'] || '0');
					const absY = parseFloat(el.dataset['absY'] || '0');
					const parentAbsX = parentEl.dataset['absX'] ? parseFloat(parentEl.dataset['absX']) : 0;
					const parentAbsY = parentEl.dataset['absY'] ? parseFloat(parentEl.dataset['absY']) : 0;
					const parentScrollTop = parentEl.dataset['scrollTop'] ? parseFloat(parentEl.dataset['scrollTop']) : 0;
					const parentScrollLeft = parentEl.dataset['scrollLeft'] ? parseFloat(parentEl.dataset['scrollLeft']) : 0;
					
					const relX = absX - parentAbsX + parentScrollLeft;
					const relY = absY - parentAbsY + parentScrollTop;
					
					const marginLeft = (update as any).showBorderLeft !== false && (update as any).borderStyle !== undefined ? ' - 1px' : '';
					const marginTop = (update as any).showBorderTop !== false && (update as any).borderStyle !== undefined ? ' - 1px' : '';
					
					el.style.left = `calc(${Math.round(relX)} * var(--char-width)${marginLeft})`;
					el.style.top = `calc(${Math.round(relY)} * var(--char-height)${marginTop})`;

					if (update.width !== undefined) {
						el.style.width = `calc(${Math.round(update.width)} * var(--char-width))`;
					}

					if (update.height !== undefined) {
						el.style.height = `calc(${Math.round(update.height)} * var(--char-height))`;
					}
				}

				for (const child of node.children) {
					buildDomTree(child, el);
				}
			}
		};

		buildDomTree(tree, this.rootElement);
	}
}

const host = globalThis.location?.host ?? 'localhost:3000';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const ws = new WebSocket(`ws://${host}`);
// eslint-disable-next-line unicorn/prefer-query-selector
const rootEl = document.getElementById('root')!;
rootEl.dataset['absX'] = '0';
rootEl.dataset['absY'] = '0';
rootEl.dataset['scrollTop'] = '0';
rootEl.dataset['scrollLeft'] = '0';
const renderer = new WebRenderer(rootEl);

ws.addEventListener('message', event => {
	const data = JSON.parse(event.data as string) as FrameMessage;
	renderer.update(data.tree, data.updates);
});

ws.addEventListener('open', () => {
	console.log('Connected to Ink Web Debugger');
});
