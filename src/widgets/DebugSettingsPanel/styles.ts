let isStyleInstalled = false

export function installDebugSettingsPanelStyles() {
  if (isStyleInstalled || typeof document === "undefined") return

  const style = document.createElement("style")
  style.dataset.telluxDebugSettings = "true"
  style.textContent = `
.tellux-debug-settings {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 20;
  display: flex;
  max-width: min(340px, calc(100vw - 32px));
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.tellux-debug-settings__toggle {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.52);
  border-radius: 6px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 14px 36px rgba(2, 6, 23, 0.28);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.tellux-debug-settings__toggle:hover,
.tellux-debug-settings__toggle[aria-expanded="true"] {
  border-color: rgba(125, 211, 252, 0.86);
  background: rgba(30, 41, 59, 0.92);
}

.tellux-debug-settings__panel {
  display: flex;
  width: 100%;
  max-height: calc(100vh - 68px);
  flex-direction: column;
  overflow: hidden;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.18);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 18px 48px rgba(2, 6, 23, 0.32);
  backdrop-filter: blur(12px);
}

.tellux-debug-settings__panel[hidden] {
  display: none;
}

.tellux-debug-settings__content {
  min-height: 0;
  margin-top: 14px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
  scrollbar-color: rgba(125, 211, 252, 0.42) transparent;
  scrollbar-width: thin;
}

.tellux-debug-settings__content::-webkit-scrollbar {
  width: 12px;
}

.tellux-debug-settings__content::-webkit-scrollbar-track {
  background: transparent;
}

.tellux-debug-settings__content::-webkit-scrollbar-thumb {
  border: 4px solid transparent;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.42);
  background-clip: content-box;
}

.tellux-debug-settings__content::-webkit-scrollbar-thumb:hover {
  background: rgba(125, 211, 252, 0.68);
  background-clip: content-box;
}

.tellux-debug-settings__panel h2,
.tellux-debug-settings__panel h3,
.tellux-debug-settings__status {
  margin: 0;
}

.tellux-debug-settings__panel h2 {
  font-size: 15px;
  line-height: 1.3;
}

.tellux-debug-settings__group {
  display: grid;
  gap: 0;
  padding-top: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.14);
}

.tellux-debug-settings__group:first-child {
  padding-top: 0;
  border-top: 0;
}

.tellux-debug-settings__group + .tellux-debug-settings__group {
  margin-top: 14px;
}

.tellux-debug-settings__group-header {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border: 0;
  color: #bfdbfe;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

.tellux-debug-settings__group-header:hover,
.tellux-debug-settings__group-header:focus-visible {
  color: #e0f2fe;
  outline: none;
}

.tellux-debug-settings__group-marker {
  position: relative;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  transition: transform 180ms ease;
}

.tellux-debug-settings__group-marker::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  content: "";
  transform: translate(-50%, -62%) rotate(45deg);
}

.tellux-debug-settings__group-header[aria-expanded="false"] .tellux-debug-settings__group-marker {
  transform: rotate(-90deg);
}

.tellux-debug-settings__group-content {
  display: grid;
  gap: 10px;
  max-height: 760px;
  overflow: hidden;
  padding-top: 10px;
  opacity: 1;
  transition: max-height 220ms ease, opacity 160ms ease, padding-top 220ms ease;
}

.tellux-debug-settings__group-header[aria-expanded="false"] + .tellux-debug-settings__group-content {
  max-height: 0;
  padding-top: 0;
  opacity: 0;
}

.tellux-debug-settings__switch {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 8px;
  color: #e2e8f0;
  font-size: 13px;
}

.tellux-debug-settings__switch input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #7dd3fc;
}

.tellux-debug-settings__select,
.tellux-debug-settings__range {
  display: grid;
  gap: 6px;
  color: #e2e8f0;
  font-size: 13px;
}

.tellux-debug-settings__select select {
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid rgba(148, 163, 184, 0.48);
  border-radius: 6px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.72);
  font: inherit;
}

.tellux-debug-settings__select select:focus {
  border-color: rgba(125, 211, 252, 0.96);
  outline: none;
}

.tellux-debug-settings__range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tellux-debug-settings__range output {
  color: #bfdbfe;
  font-variant-numeric: tabular-nums;
}

.tellux-debug-settings__range input {
  width: 100%;
  accent-color: #7dd3fc;
}

.tellux-debug-settings__status {
  margin-top: 12px;
  color: #fde68a;
  font-size: 13px;
  line-height: 1.45;
}

.tellux-debug-fps {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 20;
  min-width: 70px;
  transform: translateX(-50%);
  padding: 5px 8px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 6px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.24);
  font: 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
  backdrop-filter: blur(10px);
}

@media (max-width: 720px) {
  .tellux-debug-settings {
    top: 12px;
    right: 12px;
    max-width: calc(100vw - 24px);
  }

  .tellux-debug-settings__panel {
    max-height: calc(100vh - 60px);
  }

  .tellux-debug-fps {
    top: 12px;
  }
}
`

  document.head.appendChild(style)
  isStyleInstalled = true
}
