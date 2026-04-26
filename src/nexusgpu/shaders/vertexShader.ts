export const vertexShader = /* wgsl */ `
// 画面全体を覆う三角形を1枚だけ描く。実際の形状はFragment Shaderで計算する。
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>(3.0, 1.0),
    vec2<f32>(-1.0, 1.0)
  );

  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}
`;
