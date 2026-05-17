export const fragmentShader = /* wgsl */ `
struct CameraRay {
  origin: vec3<f32>,
  direction: vec3<f32>,
};

fn cameraInverseProjection() -> mat4x4<f32> {
  return mat4x4<f32>(
    camera.inverseProjection0,
    camera.inverseProjection1,
    camera.inverseProjection2,
    camera.inverseProjection3
  );
}

fn createCameraRay(uv: vec2<f32>, aspect: f32, eyeSign: f32) -> CameraRay {
  let rayOrigin = camera.position.xyz + camera.right.xyz * eyeSign * camera.stereoInfo.y * 0.5;

  if (camera.projectionInfo.x > 0.5) {
    let clip = vec4<f32>(uv.x, uv.y, 1.0, 1.0);
    let viewPosition = cameraInverseProjection() * clip;
    let viewDirection = normalize(viewPosition.xyz / viewPosition.w);
    let direction = normalize(
      camera.right.xyz * viewDirection.x +
      camera.up.xyz * viewDirection.y -
      camera.forward.xyz * viewDirection.z
    );

    return CameraRay(rayOrigin, direction);
  }

  let focal = 1.0 / tan(radians(camera.fov) * 0.5);
  let direction = normalize(
    camera.forward.xyz * focal +
    camera.right.xyz * uv.x * aspect +
    camera.up.xyz * uv.y
  );

  return CameraRay(rayOrigin, direction);
}

// ピクセルごとにレイを作り、SDFシーンの色を計算する。
@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let screenUv = (position.xy - camera.projectionInfo.yz) / camera.resolution;
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
  let ray = createCameraRay(uv, aspect, eyeSign);

  let hit = raymarch(ray.origin, ray.direction);
  var color = background(ray.direction);

  if (hit.distance > 0.0) {
    color = shadeMaterial(hit, ray.origin, ray.direction);
  }

// let vignette = smoothstep(0.82, 0.22, distance(eyeScreenUv, vec2<f32>(0.5)));
//  color = pow(color * vignette, vec3<f32>(0.92));

  return vec4<f32>(color, 1.0);
}
`;
