export const defaultMaterialShader = /* wgsl */ `
fn shadeMaterial(hit: SceneHit, rayOrigin: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let point = rayOrigin + direction * hit.distance;
  let normal = estimateNormal(point);
  let lightDirection = normalize(camera.lightInfo.xyz);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let rim = 0.0 * pow(max(0.0, 1.0 - dot(normal, -direction)), 3.0);
  let ambient = 0.54 + 0.1 * normal.y;
  let shadowsEnabled = camera.renderInfo.z > 0.5;
  var shadow = 1.0;

  if (shadowsEnabled) {
    let shadowPoint = point + normal * 0.015;
    let shadowHit = raymarch(shadowPoint, lightDirection);
    let shadowed = shadowHit.distance > 0.0 && shadowHit.distance < min(8.0, camera.renderInfo.y);
    shadow = select(1.0, 0.38, shadowed);
  }

  return hit.color * (ambient + diffuse * shadow) + rim * vec3<f32>(0.45, 0.75, 0.86);
}
`;
