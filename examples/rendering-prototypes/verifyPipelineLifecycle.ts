import * as THREE from 'three'
import { Viewer } from '../../src/Viewer'

/** 两个独立 Viewer 的开关、尺寸、昼夜及释放回归。 Regression for two Viewers, toggles, size, day/night and disposal. */
export async function verifyPipelineLifecycle(options: { sharedMaterial?: boolean } = {}) {
  const containers: HTMLDivElement[] = []
  const viewers: Viewer[] = []
  const resources: Array<{ dispose(): void }> = []
  const errors: string[] = []
  const results: object[] = []
  const meshes: THREE.Mesh[] = []
  let sharedMaterial: THREE.MeshStandardMaterial | undefined
  try {
    for (let i = 0; i < 2; i++) {
      const container = document.createElement('div')
      container.style.cssText = 'width:400px;height:300px;display:inline-block'
      document.body.append(container); containers.push(container)
      const viewer = new Viewer(container, {
        useDefaultRenderLoop: false,
        clock: { currentTime: new Date('2026-03-20T12:00:00Z'), shouldAnimate: false },
        camera: { destination: { longitude: 0, latitude: 0, height: 4000 } },
        scene: { atmosphere: { lighting: { mode: 'light-source' } }, clouds: { show: false } },
        postProcess: { smaa: { enabled: false }, dithering: { enabled: false } },
      })
      viewers.push(viewer)
      const renderer = viewer.renderer.raw as THREE.WebGLRenderer
      renderer.debug.onShaderError = gl => { errors.push(`viewer ${i}: shader error ${gl.getError()}`) }
      const root = new THREE.Group()
      root.matrixAutoUpdate = false
      root.matrix.copy(viewer.cartographicToMatrix4({ longitude: 0, latitude: 0, height: 200 }))
      const geometry = new THREE.BoxGeometry(450, 1200, 450)
      const material = sharedMaterial ?? new THREE.MeshStandardMaterial({ color: i ? 0xff8844 : 0x22ffff, transparent: true, opacity: 0.65, depthWrite: false })
      if (options.sharedMaterial) sharedMaterial = material
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = 600; root.add(mesh)
      meshes.push(mesh)
      resources.push(geometry, material)
      viewer.scene.raw.add(root)
      viewer.flyToTarget({ longitude: 0, latitude: 0, height: 200 }, { offset: { heading: 0, pitch: -3, distance: 4000 }, duration: 0 })
    }
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const internals = (v: Viewer) => v as unknown as {
      atmosphere: { aerialPerspectiveEffect: { scatteringTexture: THREE.Texture | null } }
      postProcessing: { sceneSubmission: { hasPointNormalMask: boolean }; opaqueNormalAdapter: { render: (...args: unknown[]) => void } }
    }
    for (let i = 0; i < 600; i++) {
      viewers.forEach(v => v.render())
      if (viewers.every(v => internals(v).atmosphere.aerialPerspectiveEffect.scatteringTexture)) break
      await frame()
      if (i === 599) throw new Error('LUT readiness timeout')
    }
    for (const hour of [12, 18, 0]) {
      for (const [index, viewer] of viewers.entries()) {
        viewer.clock.currentTime = new Date(`2026-03-20T${String(hour).padStart(2, '0')}:00:00Z`)
        const renderer = viewer.renderer.raw as THREE.WebGLRenderer, gl = renderer.getContext()
        const capture = () => {
          viewer.render()
          const pixels = new Uint8Array(renderer.domElement.width * renderer.domElement.height * 4)
          gl.readPixels(0, 0, renderer.domElement.width, renderer.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          return pixels
        }
        for(let i=0;i<3;i++)viewer.render()
        const baseline = capture()
        const manager = internals(viewer).postProcessing
        const render = manager.opaqueNormalAdapter.render
        manager.opaqueNormalAdapter.render = (...args) => {
          manager.sceneSubmission.hasPointNormalMask = true; render(...args)
        }
        let control: Uint8Array
        try { for(let i=0;i<3;i++)viewer.render(); control = capture() }
        finally { manager.opaqueNormalAdapter.render = render }
        let max = 0
        for(let i=0;i<baseline.length;i++)max=Math.max(max,Math.abs(baseline[i]-control[i]))
        results.push({ index, hour, normalDifference: max, glError: gl.getError() })
        if(max>1)throw new Error(`Normal-pass omission changes viewer ${index} at ${hour}: ${max}`)
      }
    }
    if(options.sharedMaterial) {
      // Alternate owners with deliberately different clocks, then compare each shared-material
      // draw with an independent material in the same renderer. This checks uniform ownership.
      viewers[0].clock.currentTime=new Date('2026-03-20T12:00:00Z')
      viewers[1].clock.currentTime=new Date('2026-03-20T00:00:00Z')
      const capture=(index:number)=>{
        const v=viewers[index],r=v.renderer.raw as THREE.WebGLRenderer,g=r.getContext()
        for(let i=0;i<3;i++)v.render()
        const p=new Uint8Array(r.domElement.width*r.domElement.height*4)
        g.readPixels(0,0,r.domElement.width,r.domElement.height,g.RGBA,g.UNSIGNED_BYTE,p);return p
      }
      for(let turn=0;turn<6;turn++) {
        const index=turn%2,shared=capture(index),clone=sharedMaterial!.clone()
        meshes[index].material=clone
        let reference:Uint8Array
        try{reference=capture(index)}finally{meshes[index].material=sharedMaterial!;clone.dispose()}
        let max=0
        for(let i=0;i<shared.length;i++)max=Math.max(max,Math.abs(shared[i]-reference[i]))
        results.push({sharedUniformTurn:turn,index,max})
        if(max>1)throw Error(`Shared material uniforms differ at turn ${turn}: ${max}`)
      }
    }
    for (const [index, viewer] of viewers.entries()) {
      const renderer = viewer.renderer.raw as THREE.WebGLRenderer, gl = renderer.getContext()
      for (const scale of [1.5, 0.75, 1]) {
        viewer.renderer.resolutionScale = scale
        for (const clouds of [true, false]) {
          viewer.scene.clouds.show = clouds
          for(const atmosphere of [false,true]) {
            viewer.scene.atmosphere.show = atmosphere
            viewer.postProcess.smaa.enabled = atmosphere
            for(let i=0;i<3;i++){viewer.render();await frame()}
            results.push({index,scale,clouds,atmosphere,width:renderer.domElement.width,height:renderer.domElement.height,glError:gl.getError()})
          }
        }
      }
    }
    // Destroy one owner while the second is still rendering.
    viewers[0].destroy()
    for(let i=0;i<5;i++)viewers[1].render()
    results.push({survivorGlError:(viewers[1].renderer.raw as THREE.WebGLRenderer).getContext().getError()})
    return { sharedMaterial: !!options.sharedMaterial, passed: !errors.length && results.every(r => !('glError' in r) || r.glError === 0), results, errors }
  } finally {
    viewers.forEach(v => v.destroy())
    resources.forEach(r => r.dispose())
    containers.forEach(c => c.remove())
  }
}
