export function createShaderConstants(maxObjects: number) {
  return /* wgsl */ `
const MAX_OBJECTS: u32 = ${maxObjects}u;
const MAX_STEPS_CAP: i32 = 160;
`;
}
