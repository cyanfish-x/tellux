let isStyleInstalled = false

export function installTimelineStyles() {
  if (typeof document === 'undefined') return

  let style = document.head.querySelector<HTMLStyleElement>('style[data-tellux-timeline]')
  if (!style) {
    style = document.createElement('style')
    style.dataset.telluxTimeline = 'true'
    document.head.appendChild(style)
  }

  style.textContent = TIMELINE_STYLES
  isStyleInstalled = true
}

/** Exposed for HMR / tests that need to know styles were applied. */
export function areTimelineStylesInstalled() {
  return isStyleInstalled
}

const TIMELINE_STYLES = `
.tellux-timeline {
  --tx-ink: #f8fafc;
  --tx-muted: rgba(248, 250, 252, 0.58);
  --tx-faint: rgba(248, 250, 252, 0.16);
  --tx-panel: rgba(9, 13, 20, 0.82);
  --tx-panel-edge: rgba(215, 224, 233, 0.16);
  --tx-accent: #20d6aa;
  --tx-accent-bright: #2df5c3;
  --tx-accent-hover: #42f0c5;
  --tx-accent-ink: #03110d;
  --tx-accent-soft: rgba(45, 245, 195, 0.28);
  --tx-accent-glow: rgba(45, 245, 195, 0.18);
  --tx-track: rgba(248, 250, 252, 0.12);
  --tx-thumb: 14px;
  --tx-thumb-inset: calc(var(--tx-thumb) / 2);
  --tx-font: "Segoe UI", "Helvetica Neue", "PingFang SC", "Noto Sans SC", sans-serif;
  --tx-mono: "Cascadia Mono", "Segoe UI Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;

  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  left: max(16px, env(safe-area-inset-left));
  z-index: 20;
  display: block;
  max-width: 920px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--tx-panel-edge);
  border-radius: 10px;
  color: var(--tx-ink);
  background:
    linear-gradient(135deg, rgba(45, 245, 195, 0.08), transparent 46%),
    var(--tx-panel);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 18px 48px rgba(0, 0, 0, 0.32);
  font-family: var(--tx-font);
  backdrop-filter: blur(14px) saturate(1.1);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
}

.tellux-timeline__spine {
  display: none;
}

.tellux-timeline__body {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px 22px 14px;
}

.tellux-timeline__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px 20px;
  align-items: center;
}

.tellux-timeline__transport {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--tx-faint);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
}

.tellux-timeline__step,
.tellux-timeline__play {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: var(--tx-ink);
  background: transparent;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.tellux-timeline__step:hover,
.tellux-timeline__step:focus-visible,
.tellux-timeline__play:hover,
.tellux-timeline__play:focus-visible {
  background: rgba(248, 250, 252, 0.08);
  outline: none;
}

.tellux-timeline__step:active,
.tellux-timeline__play:active {
  transform: scale(0.94);
}

.tellux-timeline__step svg,
.tellux-timeline__play svg {
  display: block;
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.tellux-timeline__play {
  width: 40px;
  height: 40px;
  color: var(--tx-accent-ink);
  background: var(--tx-accent);
  box-shadow: 0 0 0 1px rgba(45, 245, 195, 0.45), 0 8px 20px var(--tx-accent-glow);
}

.tellux-timeline__play:hover,
.tellux-timeline__play:focus-visible {
  background: var(--tx-accent-hover);
  color: var(--tx-accent-ink);
}

.tellux-timeline__play[data-playing="true"] {
  animation: tellux-timeline-pulse 1.8s ease-in-out infinite;
}

.tellux-timeline__chronograph {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.tellux-timeline__clock {
  margin: 0;
  color: var(--tx-ink);
  font-family: var(--tx-mono);
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  line-height: 1;
}

.tellux-timeline__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: baseline;
  color: var(--tx-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tellux-timeline__date {
  color: rgba(248, 250, 252, 0.78);
  font-family: var(--tx-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.tellux-timeline__tz {
  padding: 1px 6px;
  border: 1px solid rgba(45, 245, 195, 0.42);
  border-radius: 999px;
  color: var(--tx-accent-bright);
  letter-spacing: 0.12em;
}

.tellux-timeline__dials {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  min-width: 168px;
}

.tellux-timeline__field {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "label value"
    "input input";
  gap: 4px 10px;
  min-width: 0;
}

.tellux-timeline__field-label {
  grid-area: label;
  color: var(--tx-muted);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tellux-timeline__field-value {
  grid-area: value;
  color: var(--tx-ink);
  font-family: var(--tx-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-align: right;
}

.tellux-timeline__day,
.tellux-timeline__speed {
  grid-area: input;
  width: 100%;
  height: 18px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.tellux-timeline__day::-webkit-slider-runnable-track,
.tellux-timeline__speed::-webkit-slider-runnable-track {
  height: 2px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--tx-accent-soft), var(--tx-track) 55%);
}

.tellux-timeline__day::-moz-range-track,
.tellux-timeline__speed::-moz-range-track {
  height: 2px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--tx-accent-soft), var(--tx-track) 55%);
}

.tellux-timeline__day::-webkit-slider-thumb,
.tellux-timeline__speed::-webkit-slider-thumb {
  width: 11px;
  height: 11px;
  margin-top: -4.5px;
  appearance: none;
  border: 2px solid var(--tx-accent-ink);
  border-radius: 999px;
  background: var(--tx-accent-bright);
  box-shadow: 0 0 0 1px var(--tx-accent-soft), 0 0 12px var(--tx-accent-glow);
  transition: transform 140ms ease;
}

.tellux-timeline__day::-moz-range-thumb,
.tellux-timeline__speed::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: 2px solid var(--tx-accent-ink);
  border-radius: 999px;
  background: var(--tx-accent-bright);
  box-shadow: 0 0 0 1px var(--tx-accent-soft), 0 0 12px var(--tx-accent-glow);
}

.tellux-timeline__day:active::-webkit-slider-thumb,
.tellux-timeline__speed:active::-webkit-slider-thumb,
.tellux-timeline__day:focus-visible::-webkit-slider-thumb,
.tellux-timeline__speed:focus-visible::-webkit-slider-thumb {
  transform: scale(1.12);
}

.tellux-timeline__day:focus-visible,
.tellux-timeline__speed:focus-visible,
.tellux-timeline__range:focus-visible {
  outline: none;
}

.tellux-timeline__scrub {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding-top: 6px;
}

.tellux-timeline__track {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  height: 22px;
  align-items: center;
}

/*
 * Native <input type="range"> paints over siblings behind it, so ticks must use
 * a higher z-index with pointer-events:none. Grow upward from the 3px rail only.
 */
.tellux-timeline__track::after {
  position: absolute;
  /* Flush to the top edge of the 3px slider rail, grow 8px upward. */
  top: calc(50% - 1.5px - 8px);
  right: var(--tx-thumb-inset);
  left: var(--tx-thumb-inset);
  height: 8px;
  /* 8 gaps → ticks at 0%…87.5%; second layer paints the missing 100% end tick. */
  background:
    repeating-linear-gradient(
      90deg,
      rgba(248, 250, 252, 0.45) 0,
      rgba(248, 250, 252, 0.45) 1px,
      transparent 1px,
      transparent 12.5%
    ),
    linear-gradient(
      90deg,
      transparent 0,
      transparent calc(100% - 1px),
      rgba(248, 250, 252, 0.45) calc(100% - 1px),
      rgba(248, 250, 252, 0.45) 100%
    );
  content: "";
  pointer-events: none;
  z-index: 2;
}

.tellux-timeline__range {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-width: 0;
  height: 22px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.tellux-timeline__range::-webkit-slider-runnable-track {
  height: 3px;
  border: 0;
  border-radius: 999px;
  background:
    linear-gradient(
      90deg,
      var(--tx-accent-bright) 0%,
      var(--tx-accent-soft) var(--tx-progress, 0%),
      rgba(248, 250, 252, 0.2) var(--tx-progress, 0%)
    );
}

.tellux-timeline__range::-moz-range-track {
  height: 3px;
  border: 0;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.2);
}

.tellux-timeline__range::-webkit-slider-thumb {
  position: relative;
  z-index: 3;
  width: var(--tx-thumb);
  height: var(--tx-thumb);
  margin-top: -5.5px;
  appearance: none;
  border: 2px solid var(--tx-accent-ink);
  border-radius: 999px;
  background: var(--tx-accent-bright);
  box-shadow: 0 0 0 1px var(--tx-accent-soft), 0 0 12px var(--tx-accent-glow);
  transition: transform 140ms ease;
}

.tellux-timeline__range::-moz-range-thumb {
  width: var(--tx-thumb);
  height: var(--tx-thumb);
  border: 2px solid var(--tx-accent-ink);
  border-radius: 999px;
  background: var(--tx-accent-bright);
  box-shadow: 0 0 0 1px var(--tx-accent-soft), 0 0 12px var(--tx-accent-glow);
}

.tellux-timeline__range:active::-webkit-slider-thumb,
.tellux-timeline__range:focus-visible::-webkit-slider-thumb {
  transform: scale(1.12);
}

.tellux-timeline__ticks {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  box-sizing: border-box;
  padding: 0 var(--tx-thumb-inset);
  color: var(--tx-muted);
  font-family: var(--tx-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

@keyframes tellux-timeline-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(45, 245, 195, 0.45), 0 8px 20px var(--tx-accent-glow); }
  50% { box-shadow: 0 0 0 1px rgba(45, 245, 195, 0.72), 0 8px 28px rgba(45, 245, 195, 0.32); }
}

@media (prefers-reduced-motion: reduce) {
  .tellux-timeline__play[data-playing="true"] {
    animation: none;
  }

  .tellux-timeline__step,
  .tellux-timeline__play,
  .tellux-timeline__day::-webkit-slider-thumb,
  .tellux-timeline__speed::-webkit-slider-thumb,
  .tellux-timeline__range::-webkit-slider-thumb {
    transition: none;
  }
}

@media (max-width: 760px) {
  .tellux-timeline {
    border-radius: 10px;
  }

  .tellux-timeline__body {
    padding: 12px 16px;
  }

  .tellux-timeline__header {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .tellux-timeline__transport {
    justify-self: start;
  }

  .tellux-timeline__dials {
    min-width: 0;
  }

  .tellux-timeline__clock {
    font-size: 24px;
  }
}
`

// HMR: styles are injected once at Timeline mount; re-apply when this module reloads.
if (typeof document !== 'undefined') {
  installTimelineStyles()
}
