import type { RiyueBayOceanDemo } from './index'
import {
  OCEAN_PARAMETER_DEFINITIONS,
  type OceanDebugField,
  type OceanParameters,
  type OceanQuality
} from './parameters'

const GROUP_LABELS = {
  waves: '波浪 Waves',
  ripples: '涟漪 Ripples',
  appearance: '外观 Appearance',
  foam: '泡沫 Foam'
} as const

export function mountRiyueBayOceanControls(
  container: HTMLElement,
  demo: RiyueBayOceanDemo
) {
  container.replaceChildren()
  for (const group of Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>) {
    const body = createFolder(container, GROUP_LABELS[group], group === 'waves')
    for (const definition of OCEAN_PARAMETER_DEFINITIONS.filter((entry) => entry.group === group)) {
      body.append(createNumberRow(
        definition.key,
        demo.parameters[definition.key],
        definition.min,
        definition.max,
        definition.step,
        (value) => demo.ocean.setParameters({ [definition.key]: value })
      ))
    }
  }

  const switches = createFolder(container, '运行 Runtime', true)
  switches.append(
    createBooleanRow('pause', demo.parameters.pause, (value) => demo.ocean.setParameters({ pause: value })),
    createBooleanRow('wireframe', demo.parameters.wireframe, (value) => demo.ocean.setParameters({ wireframe: value })),
    createBooleanRow('noiseView', demo.parameters.noiseView, (value) => demo.ocean.setParameters({ noiseView: value }))
  )

  const advanced = createFolder(container, '近岸与调试 Coast & Debug', false)
  advanced.append(
    createNumberRow('seaLevel', demo.parameters.seaLevel, -3, 3, 0.05, (value) => demo.ocean.setParameters({ seaLevel: value })),
    createNumberRow('bathymetrySlope', demo.parameters.bathymetrySlope, 0.005, 0.12, 0.005, (value) => demo.ocean.setParameters({ bathymetrySlope: value })),
    createNumberRow('handoverDepth', demo.parameters.handoverDepth, 1, 20, 0.5, (value) => demo.ocean.setParameters({ handoverDepth: value })),
    createNumberRow('lodBlendSeconds', demo.parameters.lodBlendSeconds, 0.25, 4, 0.25, (value) => demo.ocean.setParameters({ lodBlendSeconds: value })),
    createSelectRow<OceanQuality>('quality', ['high', 'balanced'], demo.parameters.quality, (value) => demo.ocean.setParameters({ quality: value })),
    createSelectRow<OceanDebugField>(
      'debugField',
      ['none', 'height', 'landMask', 'sdf', 'depth', 'velocity', 'foam', 'revision', 'timing'],
      demo.parameters.debugField,
      (value) => demo.ocean.setParameters({ debugField: value })
    )
  )
}

function createFolder(container: HTMLElement, label: string, open: boolean) {
  const folder = document.createElement('details')
  folder.className = 'example-panel__folder'
  folder.open = open
  const summary = document.createElement('summary')
  summary.className = 'example-panel__folder-summary'
  summary.textContent = label
  const collapse = document.createElement('div')
  collapse.className = 'example-panel__folder-collapse'
  const body = document.createElement('div')
  body.className = 'example-panel__folder-body'
  collapse.append(body)
  folder.append(summary, collapse)
  container.append(folder)
  return body
}

function createNumberRow(
  key: keyof OceanParameters,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void
) {
  const row = createRow(key)
  const input = document.createElement('input')
  input.className = 'example-panel__input'
  input.type = 'number'
  input.value = String(value)
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.addEventListener('input', () => {
    const next = Number(input.value)
    if (Number.isFinite(next)) onChange(next)
  })
  row.append(input)
  return row
}

function createBooleanRow(
  key: keyof OceanParameters,
  value: boolean,
  onChange: (value: boolean) => void
) {
  const row = createRow(key)
  const input = document.createElement('input')
  input.className = 'example-panel__checkbox'
  input.type = 'checkbox'
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  row.append(input)
  return row
}

function createSelectRow<T extends string>(
  key: keyof OceanParameters,
  values: readonly T[],
  value: T,
  onChange: (value: T) => void
) {
  const row = createRow(key)
  const select = document.createElement('select')
  select.className = 'example-panel__select'
  for (const entry of values) select.add(new Option(entry, entry, false, entry === value))
  select.addEventListener('change', () => onChange(select.value as T))
  row.append(select)
  return row
}

function createRow(key: PropertyKey) {
  const row = document.createElement('label')
  row.className = 'example-panel__row'
  const label = document.createElement('span')
  label.className = 'example-panel__label'
  label.textContent = String(key)
  row.append(label)
  return row
}
