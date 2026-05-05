export const fragmentShader = /* wgsl */ `
// ピクセルごとにレイを作り、SDFシーンの色を計算する。
@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let screenUv = position.xy / camera.resolution;
  let stereoEnabled = camera.stereoInfo.x > 0.5;
  let inRightViewport = screenUv.x >= 0.5;
  var eyeScreenUv = screenUv;
  var eyeResolution = camera.resolution;
  var eyeSign = 0.0;

  if (stereoEnabled) {
    let localX = select(screenUv.x * 2.0, (screenUv.x - 0.5) * 2.0, inRightViewport);
    eyeScreenUv = vec2<f32>(localX, screenUv.y);
    eyeResolution = vec2<f32>(camera.resolution.x * 0.5, camera.resolution.y);
    eyeSign = select(-1.0, 1.0, inRightViewport);

    if (camera.stereoInfo.z > 0.5) {
      eyeSign = -eyeSign;
    }
  }

  let uv = vec2<f32>(eyeScreenUv.x * 2.0 - 1.0, 1.0 - eyeScreenUv.y * 2.0);
  let aspect = eyeResolution.x / eyeResolution.y;
  let focal = 1.0 / tan(radians(camera.fov) * 0.5);
  let rayOrigin = camera.position.xyz + camera.right.xyz * eyeSign * camera.stereoInfo.y * 0.5;
  let direction = normalize(
    camera.forward.xyz * focal +
    camera.right.xyz * uv.x * aspect +
    camera.up.xyz * uv.y
  );

  let hit = raymarch(rayOrigin, direction);
  var color = background(direction);

  if (hit.distance > 0.0) {
    color = shadeMaterial(hit, rayOrigin, direction);
  }

// let vignette = smoothstep(0.82, 0.22, distance(eyeScreenUv, vec2<f32>(0.5)));
//  color = pow(color * vignette, vec3<f32>(0.92));

  return vec4<f32>(color, 1.0);
}
`;
