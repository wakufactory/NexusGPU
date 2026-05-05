import type { SdfSceneNode } from "../types";

export type CustomSdfFunctionCallSpec = {
  /** レンダラが割り当てたGPU側の安全な関数名。 */
  functionName: string;
  /** trueなら戻り値をSceneHitとしてそのまま使い、falseならf32距離としてSceneHitへ包む。 */
  returnsSceneHit: boolean;
  /** 関数呼び出しへobject.colorSmooth.rgbを渡すか。 */
  acceptsColor: boolean;
  /** 関数呼び出しへobject.colorSmooth.wを渡すか。 */
  acceptsSmoothness: boolean;
};

export type CustomSdfFunctionNameMap = ReadonlyMap<string, CustomSdfFunctionCallSpec>;

export type CustomSdfModifierFunctionCallSpec = {
  /** レンダラが割り当てたGPU側の安全な関数名。 */
  functionName: string;
  /** post modifierがSceneHitを直接返すか。pre modifierでは使わない。 */
  returnsSceneHit: boolean;
};

export type CustomSdfModifierFunctionNameMap = ReadonlyMap<string, CustomSdfModifierFunctionCallSpec>;

export type SdfModifierFunctionSource = {
  key: string;
  mode: "pre" | "post";
  source: string;
};

/** 出現順を保ったまま重複を取り除く。 */
export function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function uniqueModifierFunctionSources(sceneNodes: readonly SdfSceneNode[]): SdfModifierFunctionSource[] {
  const byKey = new Map<string, SdfModifierFunctionSource>();

  for (const modifierFunction of collectSdfModifierFunctionSources(sceneNodes)) {
    if (!byKey.has(modifierFunction.key)) {
      byKey.set(modifierFunction.key, modifierFunction);
    }
  }

  return [...byKey.values()];
}

export function collectSdfFunctionSources(sceneNodes: readonly SdfSceneNode[]): string[] {
  return sceneNodes.flatMap((node) => {
    if (node.type === "primitive") {
      return node.node.kind === "function" && node.node.sdfFunction ? [node.node.sdfFunction] : [];
    }

    return collectSdfFunctionSources(node.children);
  });
}

function collectSdfModifierFunctionSources(sceneNodes: readonly SdfSceneNode[]): SdfModifierFunctionSource[] {
  return sceneNodes.flatMap((node) => {
    if (node.type === "primitive") {
      return [];
    }

    if (node.type === "modifier") {
      const ownFunctions: SdfModifierFunctionSource[] = [];

      if (node.preModifierFunction) {
        ownFunctions.push({
          key: createSdfModifierFunctionKey("pre", node.preModifierFunction),
          mode: "pre",
          source: node.preModifierFunction,
        });
      }

      if (node.postModifierFunction) {
        ownFunctions.push({
          key: createSdfModifierFunctionKey("post", node.postModifierFunction),
          mode: "post",
          source: node.postModifierFunction,
        });
      }

      return [...ownFunctions, ...collectSdfModifierFunctionSources(node.children)];
    }

    return collectSdfModifierFunctionSources(node.children);
  });
}

export function createSdfModifierFunctionKey(mode: "pre" | "post", source: string) {
  return `${mode}:${source}`;
}

/** SdfFunctionの入力文字列を、renderer管理の関数名を持つWGSL関数へ正規化する。 */
export function createCustomSdfFunctionSource(source: string, functionName: string): CustomSdfFunctionCallSpec & { source: string } {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("SdfFunction requires a non-empty WGSL function string.");
  }

  const declaration = parseWgslFunctionDeclaration(trimmed);
  if (declaration) {
    // 関数全体が渡された場合は戻り値型と引数数を見て、SceneHit/color/smoothness対応を判定する。
    const renamedSource = trimmed.replace(
      new RegExp(`\\bfn\\s+${declaration.name}\\s*\\(`),
      `fn ${functionName}(`,
    );

    return {
      functionName,
      returnsSceneHit: declaration.returnType === "SceneHit",
      acceptsColor: declaration.parameterCount >= 5,
      acceptsSmoothness: declaration.parameterCount >= 6,
      source: renamedSource,
    };
  }

  const returnsSceneHit = /\bSceneHit\s*\(/.test(trimmed);
  const body = trimmed.includes(";") || /\breturn\b/.test(trimmed) ? trimmed : `return ${trimmed};`;
  const returnType = returnsSceneHit ? "SceneHit" : "f32";

  // body / 式形式は便利さ優先でcolorとsmoothnessを常に使えるラッパー関数にする。
  return {
    functionName,
    returnsSceneHit,
    acceptsColor: true,
    acceptsSmoothness: true,
    source: /* wgsl */ `
fn ${functionName}(point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>, color: vec3<f32>, smoothness: f32) -> ${returnType} {
  ${body}
}
`,
  };
}

/** SdfModifierの入力文字列を、pre/post別の固定シグネチャを持つWGSL関数へ正規化する。 */
export function createCustomSdfModifierFunctionSource(
  source: string,
  functionName: string,
  mode: "pre" | "post",
): CustomSdfModifierFunctionCallSpec & { source: string } {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("SdfModifier requires a non-empty WGSL function string.");
  }

  const declaration = parseWgslFunctionDeclaration(trimmed);
  if (declaration) {
    const renamedSource = trimmed.replace(
      new RegExp(`\\bfn\\s+${declaration.name}\\s*\\(`),
      `fn ${functionName}(`,
    );

    return {
      functionName,
      returnsSceneHit: declaration.returnType === "SceneHit",
      source: renamedSource,
    };
  }

  const body = trimmed.includes(";") || /\breturn\b/.test(trimmed) ? trimmed : `return ${trimmed};`;

  if (mode === "pre") {
    return {
      functionName,
      returnsSceneHit: false,
      source: /* wgsl */ `
fn ${functionName}(point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>) -> vec3<f32> {
  ${body}
}
`,
    };
  }

  const returnsSceneHit = /\bSceneHit\s*\(/.test(trimmed);
  const returnType = returnsSceneHit ? "SceneHit" : "f32";

  return {
    functionName,
    returnsSceneHit,
    source: /* wgsl */ `
fn ${functionName}(hit: SceneHit, point: vec3<f32>, data0: vec4<f32>, data1: vec4<f32>, data2: vec4<f32>) -> ${returnType} {
  ${body}
}
`,
  };
}

/** WGSL関数宣言から関数名、引数数、戻り値型だけを抜き出す。 */
function parseWgslFunctionDeclaration(source: string) {
  const match =
    source.match(/\bfn\s+(sdfFunction)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)/s) ??
    source.match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)/s);
  if (!match) {
    return null;
  }

  const parameters = match[2].trim();

  return {
    name: match[1],
    parameterCount: parameters ? parameters.split(",").length : 0,
    returnType: match[3],
  };
}
