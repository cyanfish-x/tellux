import * as THREE from 'three'
import type {Viewer} from '../../src/Viewer'

/** 在真实高斯数据周围加入四个交叉透明面，用于完整帧验收。 Adds four crossing transparent surfaces around real Gaussian data for full-frame acceptance. */
export function installMixedTransparencyFixture(viewer:Viewer) {
  const scene=viewer.scene.raw,camera=viewer.camera.raw
  scene.updateMatrixWorld();camera.updateMatrixWorld()
  const bounds=new THREE.Box3()
  scene.traverseVisible(object=>{
    const splat=object as THREE.Object3D&{getBoundingBox?:()=>THREE.Box3}
    if(splat.userData.gaussianSplat&&splat.getBoundingBox)bounds.union(splat.getBoundingBox().clone().applyMatrix4(splat.matrixWorld))
  })
  if(bounds.isEmpty())throw Error('Mixed fixture requires loaded real Gaussian data')
  const center=bounds.getCenter(new THREE.Vector3()),radius=bounds.getSize(new THREE.Vector3()).length()*.25
  const entityRoot=(viewer as unknown as {entityRenderManager:{options:{root:THREE.Object3D}}}).entityRenderManager.options.root
  entityRoot.updateWorldMatrix(true,false)
  const direction=camera.getWorldDirection(new THREE.Vector3()),rotation=camera.getWorldQuaternion(new THREE.Quaternion())
  const geometry=new THREE.PlaneGeometry(radius,radius),objects:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[]=[]
  for(let i=0;i<4;i++){
    const parent=i%2?entityRoot:scene
    const material=new THREE.MeshBasicMaterial({color:[0xff4040,0x4040ff,0xffff40,0x40ffff][i],transparent:true,opacity:.3,depthWrite:false})
    const object=new THREE.Mesh(geometry,material)
    object.position.copy(parent.worldToLocal(center.clone().addScaledVector(direction,(i-1.5)*radius*.12)))
    object.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation))
    object.rotateY(i%2?-.45:.45);parent.add(object);objects.push(object)
  }
  return {center:center.toArray(),radius,surfaces:objects.length}
}

/** 将真实数据移到地平线并加入镂空遮挡物；只供验收。 Moves real data across the horizon with a cutout occluder, for acceptance only. */
export function installHorizonFixture(viewer:Viewer) {
  const scene=viewer.scene.raw,camera=viewer.camera.raw,state=viewer.camera.getState()
  viewer.camera.setView({...state,destination:{...state.destination,height:200},orientation:{...state.orientation,pitch:0}})
  scene.updateMatrixWorld();camera.updateMatrixWorld()
  const bounds=new THREE.Box3(),roots=new Set<THREE.Object3D>()
  scene.traverseVisible(object=>{
    const splat=object as THREE.Object3D&{getBoundingBox?:()=>THREE.Box3}
    if(!splat.userData.gaussianSplat||!splat.getBoundingBox)return
    bounds.union(splat.getBoundingBox().clone().applyMatrix4(splat.matrixWorld))
    let root:THREE.Object3D=object;while(root.parent&&root.parent!==scene)root=root.parent;roots.add(root)
  })
  if(bounds.isEmpty()||roots.size!==1)throw Error('Horizon fixture requires one real Gaussian tileset root')
  const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()).length()
  const distance=extent*4,direction=camera.getWorldDirection(new THREE.Vector3()),position=camera.position.clone().addScaledVector(direction,distance)
  const root=[...roots][0],delta=position.clone().sub(center)
  root.position.add(delta);root.updateMatrix();root.updateMatrixWorld(true)
  const map=new THREE.DataTexture(new Uint8Array([255,0,255,255,255,255,255,255,255,255,255,255,255,0,255,255]),2,2);map.needsUpdate=true
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(extent*.3,extent*.6),new THREE.MeshBasicMaterial({color:0xffffff,alphaMap:map,alphaTest:.5}))
  wall.position.copy(camera.position).addScaledVector(direction,distance*.75)
  wall.quaternion.copy(camera.quaternion);scene.add(wall)
  return {distance,extent,center:position.toArray(),occluder:'Opaque alphaTest checker; no translucent cloud intersection claim'}
}
