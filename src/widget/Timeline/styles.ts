let isStyleInstalled = false

export function installTimelineStyles() {
  if (isStyleInstalled || typeof document === "undefined") return

  const style = document.createElement("style")
  style.dataset.telluxTimeline = "true"
  style.textContent = `
.tellux-timeline {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 20;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  max-width: 1040px;
  margin: 0 auto;
  padding: 10px 12px;
  border: 1px solid rgba(215, 224, 233, 0.16);
  border-radius: 8px;
  color: #eef5f8;
  background: rgba(9, 13, 20, 0.82);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  backdrop-filter: blur(14px);
}

.tellux-timeline__controls,
.tellux-timeline__status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.tellux-timeline__play,
.tellux-timeline__step {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 6px;
  color: #f8fafc;
  background: rgba(30, 41, 59, 0.78);
  cursor: pointer;
}

.tellux-timeline__play:hover,
.tellux-timeline__play:focus-visible,
.tellux-timeline__step:hover,
.tellux-timeline__step:focus-visible {
  border-color: rgba(45, 245, 195, 0.68);
  background: rgba(39, 54, 66, 0.92);
  outline: none;
}

.tellux-timeline__play::before {
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 9px solid currentColor;
  content: "";
  transform: translateX(1px);
}

.tellux-timeline__play[data-playing="true"]::before,
.tellux-timeline__play[data-playing="true"]::after {
  width: 3px;
  height: 13px;
  border: 0;
  background: currentColor;
  content: "";
  transform: none;
}

.tellux-timeline__play[data-playing="true"] {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.tellux-timeline__step {
  font-size: 15px;
  line-height: 1;
}

.tellux-timeline__speed {
  min-width: 82px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 6px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.72);
  font: inherit;
}

.tellux-timeline__speed:focus {
  border-color: rgba(45, 245, 195, 0.78);
  outline: none;
}

.tellux-timeline__track {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.tellux-timeline__range {
  width: 100%;
  min-width: 0;
  height: 24px;
  margin: 0;
  accent-color: #2df5c3;
  cursor: pointer;
}

.tellux-timeline__ticks,
.tellux-timeline__status {
  color: #c4ced7;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.tellux-timeline__ticks {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.tellux-timeline__status {
  justify-content: flex-end;
}

.tellux-timeline__time {
  color: #ffffff;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .tellux-timeline {
    right: 12px;
    bottom: 12px;
    left: 12px;
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 10px;
  }

  .tellux-timeline__controls,
  .tellux-timeline__status {
    justify-content: space-between;
  }

  .tellux-timeline__time {
    white-space: normal;
  }
}
`

  document.head.appendChild(style)
  isStyleInstalled = true
}
