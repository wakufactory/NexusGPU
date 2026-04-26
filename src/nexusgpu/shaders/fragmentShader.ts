export const fragmentShader = /* wgsl */ `
// ピクセルごとにレイを作り、SDFシーンの色を計算する。
@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = (position.xy / camera.resolution) * 2.0 - vec2<f32>(1.0);
  let aspect = camera.resolution.x / camera.resolution.y;
  let focal = 1.0 / tan(radians(camera.fov) * 0.5);
  let direction = normalize(
    camera.forward.xyz * focal +
    camera.right.xyz * uv.x * aspect +
    camera.up.xyz * uv.y
  );

  let hit = raymarch(camera.position.xyz, direction);
  var color = background(direction);

  if (hit.distance > 0.0) {
    let point = camera.position.xyz + direction * hit.distance;
    let normal = estimateNormal(point);
    let lightDirection = normalize(camera.lightInfo.xyz);
    let diffuse = max(dot(normal, lightDirection), 0.0);
    let rim = pow(max(0.0, 1.0 - dot(normal, -direction)), 3.0);
    let ambient = 0.24 + 0.1 * normal.y;
    let shadowPoint = point + normal * 0.015;
    let shadowHit = raymarch(shadowPoint, lightDirection);
    let shadowsEnabled = camera.renderInfo.z > 0.5;
    let shadowed = shadowsEnabled && shadowHit.distance > 0.0 && shadowHit.distance < min(8.0, camera.renderInfo.y);
    let shadow = select(1.0, 0.38, shadowed);
    color = hit.color * (ambient + diffuse * shadow) + rim * vec3<f32>(0.45, 0.75, 0.86) ;
  }

  let vignetteUv = position.xy / camera.resolution;
  let vignette = smoothstep(0.82, 0.22, distance(vignetteUv, vec2<f32>(0.5)));
  color = pow(color * vignette, vec3<f32>(0.92));

  return vec4<f32>(color, 1.0);
}
`;
