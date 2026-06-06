interface RangeControlOptions {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  format: (value: number) => string
}

interface SelectControlOptions<T extends string> {
  id: string
  label: string
  value: T
  options: readonly T[]
}

export function createGroup(
  label: string,
  controls: HTMLElement[],
  expanded = true
) {
  const group = document.createElement("div")
  group.className = "example-settings__group"

  const header = document.createElement("button")
  header.className = "example-settings__group-header"
  header.type = "button"
  header.setAttribute("aria-expanded", String(expanded))

  const title = document.createElement("span")
  title.textContent = label

  const marker = document.createElement("span")
  marker.className = "example-settings__group-marker"
  marker.setAttribute("aria-hidden", "true")

  const content = document.createElement("div")
  content.className = "example-settings__group-content"
  content.inert = !expanded

  header.append(title, marker)
  controls.forEach((control) => {
    content.appendChild(control)
  })

  header.addEventListener("click", () => {
    const isOpen = header.getAttribute("aria-expanded") === "true"
    header.setAttribute("aria-expanded", String(!isOpen))
    content.inert = isOpen
  })

  group.append(header, content)
  return group
}

export function createSwitchControl(
  id: string,
  label: string,
  checked: boolean
) {
  const wrapper = document.createElement("label")
  wrapper.className = "example-settings__switch"

  const input = document.createElement("input")
  input.id = `example-settings-${id}`
  input.type = "checkbox"
  input.checked = checked

  const text = document.createElement("span")
  text.textContent = label

  wrapper.append(input, text)
  return { element: wrapper, input }
}

export function createRangeControl(options: RangeControlOptions) {
  const wrapper = document.createElement("label")
  wrapper.className = "example-settings__range"

  const header = document.createElement("span")
  header.className = "example-settings__range-header"

  const label = document.createElement("span")
  label.textContent = options.label

  const value = document.createElement("output")
  value.textContent = options.format(options.value)

  const input = document.createElement("input")
  input.id = `example-settings-${options.id}`
  input.type = "range"
  input.min = String(options.min)
  input.max = String(options.max)
  input.step = String(options.step)
  input.value = String(options.value)
  input.addEventListener("input", () => {
    value.textContent = options.format(Number(input.value))
  })

  header.append(label, value)
  wrapper.append(header, input)

  return { element: wrapper, input }
}

export function createSelectControl<T extends string>(
  options: SelectControlOptions<T>
) {
  const wrapper = document.createElement("label")
  wrapper.className = "example-settings__select"

  const label = document.createElement("span")
  label.textContent = options.label

  const input = document.createElement("select")
  input.id = `example-settings-${options.id}`
  options.options.forEach((optionValue) => {
    const option = document.createElement("option")
    option.value = optionValue
    option.textContent = optionValue
    input.appendChild(option)
  })
  input.value = options.value

  wrapper.append(label, input)

  return { element: wrapper, input }
}
