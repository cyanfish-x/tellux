import * as THREE from 'three'
import { RTC_POSITION_STAGE_NAME } from './stages/rtcPositionStage'

/**
 * PositionPipeline stage 编译上下文。
 *
 * Compilation context for a PositionPipeline stage.
 */
export interface PositionPipelineStageContext {
  /** 是否启用 instancing。Whether instancing is enabled. */
  useInstancing: boolean
}

export type PositionPipelineStagePhase = 'pre-instancing' | 'post-instancing'

/**
 * 位置管线 stage：在 view 空间对 mvPosition 做变换。
 *
 * Position pipeline stage: transforms mvPosition in view space.
 */
export interface PositionPipelineStage {
  /** Stage 名称，用于注册与调试。Stage name for registration and debugging. */
  readonly name: string
  /**
   * 执行顺序，数值越小越早执行。
   *
   * Execution order; lower values run earlier.
   */
  readonly order: number
  /**
   * 执行阶段：instancing 前（局部/model 空间）或 instancing 后（post-instancing）。
   *
   * Execution phase: before instancing (local/model space) or after instancing.
   */
  readonly phase?: PositionPipelineStagePhase
  /**
   * 需要注入的 GLSL 声明（attribute / uniform / varying）。
   *
   * GLSL declarations to inject (attributes, uniforms, varyings).
   */
  readonly declarations?: string
  /**
   * 需要的 GLSL define。
   *
   * Required GLSL defines.
   */
  readonly requiredDefines?: string[]
  /**
   * 在 view 空间变换 mvPosition，返回 GLSL 语句块。
   *
   * Transforms mvPosition in view space and returns a GLSL statement block.
   */
  transform(mvPosition: string, ctx: PositionPipelineStageContext): string
}

export interface PositionPipelineComposeOptions {
  /** 是否注入 instancing 块。Whether to inject the instancing block. */
  useInstancing?: boolean
  /**
   * 最终投影矩阵 GLSL 标识符。
   *
   * GLSL identifier for the final projection matrix.
   */
  projectionMatrix?: string
}

export interface PositionPipelineApplyOptions extends PositionPipelineComposeOptions {
  /**
   * 启用 ez-tree 等已替换 `<project_vertex>` 材质的内联回退 patch。
   *
   * Enables inline fallback patching for materials that already replaced
   * `<project_vertex>` (e.g. ez-tree).
   */
  enableCustomProjectVertexFallback?: boolean
}

const DEFAULT_INSTANCING_BLOCK = `
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif`

const MODEL_VIEW_PROJECTION_PATTERN =
  /mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;\s*gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition;/

/**
 * Shader 位置组合协议：单一 owner 按 order 拼接各 stage 的 GLSL 片段。
 *
 * Shader position composition protocol: a single owner composes GLSL fragments
 * from stages ordered by `order`.
 */
export class PositionPipeline {
  private readonly stages = new Map<string, PositionPipelineStage>()

  register(stage: PositionPipelineStage): this {
    if (this.stages.has(stage.name)) {
      throw new Error(`PositionPipeline: stage "${stage.name}" is already registered.`)
    }
    this.stages.set(stage.name, stage)
    return this
  }

  unregister(name: string): boolean {
    return this.stages.delete(name)
  }

  hasStage(name: string): boolean {
    return this.stages.has(name)
  }

  getStageNames(): string[] {
    return this.getOrderedStages().map((stage) => stage.name)
  }

  /**
   * 组合 `<project_vertex>` 替换块，供单元测试与材质注入使用。
   *
   * Composes the `<project_vertex>` replacement block for unit tests and
   * material injection.
   */
  composeProjectVertex(options: PositionPipelineComposeOptions = {}): string {
    const ctx: PositionPipelineStageContext = {
      useInstancing: options.useInstancing ?? true
    }
    const projectionMatrix =
      options.projectionMatrix ?? this.resolveProjectionMatrix()

    const lines = [
      'vec4 mvPosition = vec4( transformed, 1.0 );',
      '',
      '#ifdef USE_BATCHING',
      '',
      '	mvPosition = batchingMatrix * mvPosition;',
      '',
      '#endif',
      ''
    ]

    const preInstancing = this.composeStageBlocks(
      'mvPosition',
      ctx,
      'pre-instancing'
    )
    if (preInstancing.length > 0) {
      lines.push(...preInstancing, '')
    }

    if (ctx.useInstancing) {
      lines.push(DEFAULT_INSTANCING_BLOCK.trim(), '')
    }

    lines.push(
      ...this.composeStageBlocks('mvPosition', ctx, 'post-instancing'),
      `gl_Position = ${projectionMatrix} * mvPosition;`
    )

    return `${lines.join('\n')}\n`
  }

  /**
   * 组合内联最终化块：假设 `mvPosition` 已由第三方材质准备好（如风摆），
   * 只应用 stage 变换并输出 clip 空间位置。
   *
   * Composes an inline finalization block assuming `mvPosition` was already
   * prepared by third-party material code (e.g. wind sway).
   */
  composeInlineFinalization(
    mvPosition = 'mvPosition',
    options: PositionPipelineComposeOptions = {}
  ): string {
    const ctx: PositionPipelineStageContext = {
      useInstancing: options.useInstancing ?? true
    }
    const projectionMatrix =
      options.projectionMatrix ?? this.resolveProjectionMatrix()

    return [
      ...this.composeStageBlocks(mvPosition, ctx, 'post-instancing'),
      `gl_Position = ${projectionMatrix} * ${mvPosition};`
    ].join('\n')
  }

  composeDeclarations(): string {
    return this.getOrderedStages()
      .map((stage) => stage.declarations?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n')
  }

  composeRequiredDefines(): string[] {
    const defines = new Set<string>()
    for (const stage of this.stages.values()) {
      stage.requiredDefines?.forEach((define) => defines.add(define))
    }
    return Array.from(defines)
  }

  /**
   * 把组合后的 position 管线注入材质。
   *
   * Injects the composed position pipeline into a material.
   */
  applyToMaterial(
    material: THREE.Material,
    sharedUniforms: Record<string, THREE.IUniform> = {},
    options: PositionPipelineApplyOptions = {}
  ): void {
    const originalOnBeforeCompile = material.onBeforeCompile?.bind(material)
    const declarations = this.composeDeclarations()
    const projectVertex = this.composeProjectVertex(options)
    const inlineFinalization = this.composeInlineFinalization('mvPosition', options)
    const requiredDefines = this.composeRequiredDefines()
    const enableFallback = options.enableCustomProjectVertexFallback ?? false

    material.onBeforeCompile = (shader, renderer) => {
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile(shader, renderer)
      }

      Object.assign(shader.uniforms, sharedUniforms)

      for (const define of requiredDefines) {
        shader.defines ??= {}
        shader.defines[define] = ''
      }

      if (
        declarations.length > 0 &&
        !shader.vertexShader.includes('attribute vec3 positionHigh;')
      ) {
        shader.vertexShader = shader.vertexShader.replace(
          /(\s*void\s+main\s*\(\s*\)\s*\{)/,
          `\n${declarations}\n$1`
        )
      }

      if (shader.vertexShader.includes('#include <project_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          projectVertex
        )
        return
      }

      if (!enableFallback) return

      if (!/instanceMatrix\s*\*\s*mvPosition/.test(shader.vertexShader)) {
        shader.vertexShader = shader.vertexShader.replace(
          /(mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;)/,
          `#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
$1`
        )
      }

      if (MODEL_VIEW_PROJECTION_PATTERN.test(shader.vertexShader)) {
        shader.vertexShader = shader.vertexShader.replace(
          MODEL_VIEW_PROJECTION_PATTERN,
          inlineFinalization
        )
      }
    }
    material.needsUpdate = true
  }

  private getOrderedStages() {
    return Array.from(this.stages.values()).sort(
      (left, right) => left.order - right.order
    )
  }

  private composeStageBlocks(
    mvPosition: string,
    ctx: PositionPipelineStageContext,
    phase: PositionPipelineStagePhase = 'post-instancing'
  ) {
    const blocks: string[] = []
    for (const stage of this.getOrderedStages()) {
      const stagePhase = stage.phase ?? 'post-instancing'
      if (stagePhase !== phase) continue
      const block = stage.transform(mvPosition, ctx).trim()
      if (block.length > 0) {
        blocks.push(block)
      }
    }
    return blocks
  }

  private resolveProjectionMatrix() {
    return this.hasStage(RTC_POSITION_STAGE_NAME)
      ? 'u_projectionMatrix'
      : 'projectionMatrix'
  }
}
