import {
  EnvironmentNode,
  type Node,
  type NodeBuilder
} from 'three/webgpu'
import {
  cameraViewMatrix,
  materialEnvIntensity,
  normalView,
  positionViewDirection,
  pow4,
  roughness
} from 'three/tsl'

/**
 * Samples a PMREM only into the physical material's specular-radiance path.
 * AtmosphereLight already owns diffuse sky irradiance in this example, so the
 * stock EnvironmentNode irradiance branch would light the water twice.
 */
export class WaterAreaEnvironmentNode extends EnvironmentNode {
  constructor(environmentNode: Node) {
    super(environmentNode)
  }

  override setup(builder: NodeBuilder): void {
    let reflectionDirection: Node | null = null
    const radiance = this.envNode
      .context({
        getUV: () => {
          if (reflectionDirection === null) {
            reflectionDirection = positionViewDirection
              .negate()
              .reflect(normalView)
            reflectionDirection = pow4(roughness)
              .mix(reflectionDirection, normalView)
              .normalize()
              .transformDirection(cameraViewMatrix)
          }
          return reflectionDirection
        },
        getTextureLevel: () => roughness
      })
      .mul(materialEnvIntensity)

    builder.context.radiance.addAssign(radiance)
  }
}
