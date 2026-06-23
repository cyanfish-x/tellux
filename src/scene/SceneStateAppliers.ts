import type { AtmosphereRuntimeState, CloudRuntimeState } from '../rendering/AtmosphereRuntimeState'

export type AtmosphereStateApplier = (state: AtmosphereRuntimeState) => void
export type CloudStateApplier = (state: CloudRuntimeState) => void
