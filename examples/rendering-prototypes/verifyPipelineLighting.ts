import * as THREE from 'three'
import { Viewer } from '../../src/Viewer'
import { LOCAL_LIGHTING_LAYER } from '../../src/rendering/localLighting'

/** 用 alpha=1 的透明面与同位置不透明面比较自身光照和大气。 Compares transparent alpha-one surfaces with their opaque counterparts. */
export async function verifyPipelineLighting(options: { customShader?: boolean } = {}) {
  const container = document.createElement('div')
  container.style.cssText='width:600px;height:400px';document.body.append(container)
  const viewer = new Viewer(container, {useDefaultRenderLoop:false,
    clock:{currentTime:new Date('2026-03-20T12:00:00Z'),shouldAnimate:false},
    scene:{clouds:{show:false},atmosphere:{lighting:{mode:'post-process'}}},
    postProcess:{smaa:{enabled:false},dithering:{enabled:false}},
  })
  const root = new THREE.Group();root.matrixAutoUpdate=false
  root.matrix.copy(viewer.cartographicToMatrix4({longitude:0,latitude:0,height:200}))
  const geometry=new THREE.BoxGeometry(450,1200,450)
  const material=options.customShader ? new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,
    vertexShader:'in vec3 position;uniform mat4 projectionMatrix;uniform mat4 modelViewMatrix;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`precision highp float;
layout(location=0) out vec4 customColor;
float valueAfterMain(float x);
void main(void) {
  customColor=vec4(0.1,0.8,1.0,1.0);
  if(gl_FragCoord.x>300.0) return;
  customColor.r=valueAfterMain(customColor.r);
}
float valueAfterMain(float x) { return x*2.0; }`,
  }):new THREE.MeshBasicMaterial({color:0x22ffff})
  const mesh=new THREE.Mesh(geometry,material);mesh.position.y=600;root.add(mesh);viewer.scene.raw.add(root)
  viewer.flyToTarget({longitude:0,latitude:0,height:200},{offset:{heading:0,pitch:-3,distance:4000},duration:0})
  const renderer=viewer.renderer.raw as THREE.WebGLRenderer, gl=renderer.getContext()
  const internal=viewer as unknown as {
    atmosphere:{aerialPerspectiveEffect:{scatteringTexture:THREE.Texture|null}},
    postProcessing:{setHasLocalLighting(enabled:boolean):void}
  }
  const errors:string[]=[], results:object[]=[]
  renderer.debug.onShaderError=()=>{errors.push('shader error')}
  const capture=()=>{for(let i=0;i<3;i++)viewer.render();const p=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p}
  try {
    for(let i=0;i<600&&!internal.atmosphere.aerialPerspectiveEffect.scatteringTexture;i++){viewer.render();await new Promise(requestAnimationFrame)}
    if(!internal.atmosphere.aerialPerspectiveEffect.scatteringTexture)throw Error('LUT timeout')
    for(const mode of (options.customShader?['light-source'] as const:['post-process','light-source'] as const))for(const local of [false,true])for(const hour of [12,18,0]) {
      viewer.scene.atmosphere.lighting.mode=mode
      viewer.clock.currentTime=new Date(`2026-03-20T${String(hour).padStart(2,'0')}:00:00Z`)
      if(local)mesh.layers.enable(LOCAL_LIGHTING_LAYER);else mesh.layers.disable(LOCAL_LIGHTING_LAYER)
      internal.postProcessing.setHasLocalLighting(local)
      material.transparent=false;material.depthWrite=true;material.needsUpdate=true
      const opaque=capture()
      material.transparent=true;material.depthWrite=false;material.needsUpdate=true
      const transparent=capture()
      let max=0, over2=0
      for(let i=0;i<opaque.length;i++){const d=Math.abs(opaque[i]-transparent[i]);max=Math.max(max,d);if(d>2)over2++}
      results.push({mode,local,hour,max,over2,glError:gl.getError()})
    }
    return {results,errors,passed:!errors.length&&results.every(r=>!('over2'in r)||r.over2===0)}
  }finally{viewer.destroy();geometry.dispose();material.dispose();container.remove()}
}
