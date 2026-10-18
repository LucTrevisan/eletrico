/**
 * Ponto único de importação do Babylon.js.
 *
 * Importar de "@babylonjs/core" (o "barril") traz a biblioteca inteira (~8 MB). Aqui só
 * entram os módulos realmente usados pelo app, com caminhos específicos, mais os imports
 * de efeito colateral que registram recursos na cena (picking, sombras, glow, .env...).
 * Se um recurso novo do Babylon for usado, adicione-o aqui.
 */

// Efeitos colaterais (registram funcionalidades)
import "@babylonjs/core/Culling/ray.js"; // scene.pick / picking de ponteiro
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Layers/effectLayerSceneComponent.js";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js"; // mapa de ambiente .env
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import "@babylonjs/core/Animations/animatable.js"; // scene.beginDirectAnimation

// Carregadores sob demanda: o leitor glTF e cada extensão só são baixados quando um modelo é carregado.
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic.js";
registerBuiltInLoaders();

// Modelos comprimidos com meshopt (npm run otimizar-modelo): decodificador servido pelo próprio site,
// sem depender da CDN do Babylon.
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
MeshoptCompression.Configuration = { decoder: { url: new URL("vendor/meshopt_decoder.js", document.baseURI).href } };

export { Engine } from "@babylonjs/core/Engines/engine.js";
export { Constants } from "@babylonjs/core/Engines/constants.js";
export { Scene } from "@babylonjs/core/scene.js";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
export { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
export { Ray } from "@babylonjs/core/Culling/ray.js";
export { Plane } from "@babylonjs/core/Maths/math.plane.js";
export { Curve3, Path3D } from "@babylonjs/core/Maths/math.path.js";
export { Axis, Space } from "@babylonjs/core/Maths/math.axis.js";
export { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
export { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture.js";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
export { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture.js";
export { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
export { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
export { Material } from "@babylonjs/core/Materials/material.js";
export { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
export { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
export { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
export { Mesh } from "@babylonjs/core/Meshes/mesh.js";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
export { Tools } from "@babylonjs/core/Misc/tools.js";
export { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
export { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
export { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
export { Animation } from "@babylonjs/core/Animations/animation.js";
export { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing.js";
// WebXR: importado direto em src/xr/xrExperience.js (carregado só em dispositivos com VR).
