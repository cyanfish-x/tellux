/**
 * 仅在实验副本中增加一次原步进的累计贡献输出；不改原输出和步进公式。
 * Adds a prefix attachment in an experiment without editing original outputs or march formulas.
 */
export function captureCloudPrefixShader(source: string, attachment: number) {
  const rayAnchor = 'float rayDistanceToScene = getRayDistanceToScene(rayDirection, sceneViewZ);'
  const integrationAnchor = 'transmittanceSum += transmittanceIntegral;'
  for (const anchor of [rayAnchor, integrationAnchor, 'vec4 marchClouds(', 'void main() {', 'outputColor = color;',
    'float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));', 'frontDepth = transmittanceSum > 0.0 ?']) {
    if (!source.includes(anchor)) throw new Error(`Cloud prefix capture anchor changed: ${anchor}`)
  }
  return source
    .replace('vec4 marchClouds(', `layout(location = ${attachment}) out vec4 telluxPrefix;
uniform sampler2D telluxQueryDepthBuffer;
float telluxQueryDistance;
vec4 telluxCaptured;
vec4 marchClouds(`)
    .replace('void main() {', 'void main() { telluxPrefix = vec4(0.0); telluxCaptured = vec4(0.0);')
    .replace(rayAnchor, `${rayAnchor}
float telluxQueryDepth = readDepthValue(telluxQueryDepthBuffer, vUv * targetUvScale + temporalJitter);
telluxQueryDistance = telluxQueryDepth >= 1.0 ? 1e30 :
  -getViewZ(reverseLogDepth(telluxQueryDepth, cameraNear, cameraFar)) / dot(rayDirection, vCameraDirection);`)
    .replace('float maxRayDistance = rayNearFar.y - rayNearFar.x;', `bool telluxRecorded = false;
float maxRayDistance = rayNearFar.y - rayNearFar.x;`)
    .replace('float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));', `if (!telluxRecorded && rayNearFar.x + rayDistance > telluxQueryDistance) {
  telluxCaptured = vec4(radianceIntegral, remapClamped(transmittanceIntegral, 1.0, minTransmittance));
  telluxRecorded = true;
}
float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));`)
    .replace('frontDepth = transmittanceSum > 0.0 ?', `if (!telluxRecorded) telluxCaptured = vec4(radianceIntegral, remapClamped(transmittanceIntegral, 1.0, minTransmittance));
frontDepth = transmittanceSum > 0.0 ?`)
    .replace('outputColor = color;', 'outputColor = color; telluxPrefix = telluxCaptured;')
}
