import { SDF_PRIMITIVE_KIND_IDS } from "../sdfKinds";

export const sceneMappingShader = /* wgsl */ `
// シーン内の全SDFオブジェクトを走査し、指定点から最も近い表面距離を返す。
fn mapScene(point: vec3<f32>) -> SceneHit {
  var bestDistance = camera.renderInfo.y;
  var bestColor = vec3<f32>(0.72, 0.82, 0.9);

  for (var i = 0u; i < MAX_OBJECTS; i = i + 1u) {
    if (f32(i) >= camera.objectInfo.x) {
      break;
    }

    let object = objects[i];
    let localPoint = rotateByQuaternion(point - object.positionKind.xyz, vec4<f32>(-object.rotation.xyz, object.rotation.w));
    let kind = u32(object.positionKind.w + 0.5);
    var distance = 0.0;

    if (kind == ${SDF_PRIMITIVE_KIND_IDS.sphere}u) {
      distance = sdSphere(localPoint, object.data0.x);
    } else if (kind == ${SDF_PRIMITIVE_KIND_IDS.box}u) {
      distance = sdBox(localPoint, object.data0.xyz);
    } else {
      distance = camera.renderInfo.y;
    }

    let smoothness = object.colorSmooth.w;
    let merged = smoothMin(bestDistance, distance, smoothness);
    let blend = smoothstep(0.0, max(0.001, smoothness + 0.001), abs(bestDistance - distance));

    if (distance < bestDistance) {
      if (smoothness <= 0.0001) {
        bestColor = object.colorSmooth.rgb;
      } else {
        let colorBlend = 1.0 - smoothstep(
          0.0,
          smoothness,
          abs(bestDistance - distance)
        );

        bestColor = mix(object.colorSmooth.rgb, bestColor, colorBlend * 0.3);
      }
    }

    bestDistance = merged;
  }

  return SceneHit(bestDistance, bestColor);
}
`;
