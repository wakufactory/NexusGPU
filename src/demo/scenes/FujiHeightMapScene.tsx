import { NexusCanvas, type NexusTextureSource, SdfFunction } from "../../nexusgpu";
import { defineSceneParameterControls, defineSceneRenderSettings } from "./types";
import type { NexusSceneCanvasProps } from "./types";

export const initialRenderSettings = defineSceneRenderSettings({
  maxSteps: 220,
  maxDistance: 110,
  shadows: true,
  normalEpsilon: 0.015,
  surfaceEpsilon: 0.004,
});

export const { initialParameters, parameterControls } = defineSceneParameterControls(
  {
    heightScale: 1.,
    slopeGuard: 1.25,
    lightElevation: 55,
    lightAzimuth: 130,
    surface: 0,
  },
  [
    {
      key: "heightScale",
      name: "Height scale",
      min: 0.1,
      max: 5,
      step: 0.05,
      precision: 2,
    },
    {
      key: "slopeGuard",
      name: "Slope guard",
      min: 1,
      max: 20,
      step: 0.25,
      precision: 2,
    },
    {
      key: "lightElevation",
      name: "Light elevation",
      min: 0,
      max: 90,
      step: 1,
    },
    {
      key: "lightAzimuth",
      name: "Light azimuth",
      min: 0,
      max: 360,
      step: 1,
    },
    {
      key: "surface",
      name: "surface mode",
      min: 0,
      max: 5,
      step: 1,
    },
  ],
);

export type FujiHeightMapSceneParameters = typeof initialParameters;

type FujiHeightMapSceneProps = {
  parameters: FujiHeightMapSceneParameters;
  canvasProps: NexusSceneCanvasProps;
};

const HEIGHT_MAP_TEXTURES: NexusTextureSource[] = [
  {
    src: `${import.meta.env.BASE_URL}assets/fuji-gsj-z13-20km.png`,
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "nearest",
    minFilter: "nearest",
  },
  {
    src: `${import.meta.env.BASE_URL}assets/fuji-std-z13-20km.png`,
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  },
  {
    src: `${import.meta.env.BASE_URL}assets/fuji-gsp-z13-20km.jpg`,
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  },
];

const FUJI_HEIGHT_MAP_SDF = /* wgsl */ `
// data0:
//   x = 地形の半幅。XZは -halfSize .. +halfSize の正方形になる。
//   y = 高さ倍率。RGB高度をscene unitへ変換した後に掛ける。
//   z = 地形下面の深さ。上面だけでは厚みがないため、下側に薄い立体を作る。
//   w = slopeGuard。距離を保守的に小さくする下限係数。
// data1:
//   x = surface mode。0: 写真色, 1: 地図色ブレンド, その他: 高度色。
let halfSize = data0.x;
let heightScale = data0.y;
let baseDepth = data0.z;
let slopeGuard = data0.w;

// SdfFunctionのlocal point.xzを0..1のUVへ変換する。
// point.xz = (-halfSize, -halfSize) が uv=(0,0)、(+halfSize,+halfSize) が uv=(1,1)。
let uv = clamp(point.xz / (halfSize * 2.0) + vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(1.0));

// ハイトマップ画像の向きとscene座標の向きを合わせる。
// ここでX/Yを反転しているため、画像上の勾配は後段でscene空間用に符号反転する。
let flippedUv = vec2<f32>(1.0 - uv.x, 1.0 - uv.y);

// RGB高度はチャンネルごとに桁を持つ24bit値なので、RGBをlinear sampleしてからdecodeすると
// byte境界で偽の段差が出る。そこで4近傍ピクセルをtextureLoadで個別に読み、各ピクセルを
// 高度値へdecodeしてから、高度値としてbilinear補間する。
let textureSize = vec2<f32>(textureDimensions(texture0));
let pixelPoint = flippedUv * (textureSize - vec2<f32>(1.0));
let pixel0 = vec2<i32>(floor(pixelPoint));
let pixel1 = min(pixel0 + vec2<i32>(1), vec2<i32>(textureDimensions(texture0)) - vec2<i32>(1));
let pixelBlend = fract(pixelPoint);

// texture0はheight map。rgba8unormなので、読み出し値は0..1。
// round相当の floor(x * 255 + 0.5) で元の0..255整数RGBへ戻す。
let texel00 = textureLoad(texture0, pixel0, 0);
let texel10 = textureLoad(texture0, vec2<i32>(pixel1.x, pixel0.y), 0);
let texel01 = textureLoad(texture0, vec2<i32>(pixel0.x, pixel1.y), 0);
let texel11 = textureLoad(texture0, pixel1, 0);
let rgb00 = floor(texel00.rgb * 255.0 + vec3<f32>(0.5));
let rgb10 = floor(texel10.rgb * 255.0 + vec3<f32>(0.5));
let rgb01 = floor(texel01.rgb * 255.0 + vec3<f32>(0.5));
let rgb11 = floor(texel11.rgb * 255.0 + vec3<f32>(0.5));

// 高度エンコード式:
//   meters = (65536 * R + 256 * G + B) * 0.01
// 各近傍を先にmetersへ戻してから補間する。
let height00 = (65536.0 * rgb00.r + 256.0 * rgb00.g + rgb00.b) * 0.01;
let height10 = (65536.0 * rgb10.r + 256.0 * rgb10.g + rgb10.b) * 0.01;
let height01 = (65536.0 * rgb01.r + 256.0 * rgb01.g + rgb01.b) * 0.01;
let height11 = (65536.0 * rgb11.r + 256.0 * rgb11.g + rgb11.b) * 0.01;
let heightMeters = mix(
  mix(height00, height10, pixelBlend.x),
  mix(height01, height11, pixelBlend.x),
  pixelBlend.y
);

// alphaはheight mapの有効領域マスクとして使う。
// alphaが0側なら後段で水色に固定する。形状自体は現在は同じheight fieldとして扱う。
let alpha = mix(
  mix(texel00.a, texel10.a, pixelBlend.x),
  mix(texel01.a, texel11.a, pixelBlend.x),
  pixelBlend.y
);

// meters -> scene unit。20km/40kmなどの水平スケールに合わせ、1m=0.001 scene unitとして扱う。
// heightScaleはその後に掛ける垂直 exaggeration。
let height = heightMeters * 0.001 * heightScale;

// 近傍高度差から画像texel空間での高度差分を作る。
// pixelBlendの反対軸でmixしているのは、bilinear補間後の局所差分に近づけるため。
let heightDxMeters = mix(height10 - height00, height11 - height01, pixelBlend.y);
let heightDzMeters = mix(height01 - height00, height11 - height10, pixelBlend.x);

// texelあたりの高度差をscene unitあたりの勾配 dheight/dx, dheight/dz へ変換する。
let texelsPerSceneUnit = (textureSize.x - 1.0) / (halfSize * 2.0);
let heightTextureGradient = vec2<f32>(heightDxMeters, heightDzMeters) * 0.001 * heightScale * texelsPerSceneUnit;

// flippedUvでX/Yを反転しているため、texture空間の勾配をscene空間へ戻すと符号が逆になる。
let heightGradient = -heightTextureGradient;

// 高さ場の厳密な符号付き距離ではなく、point.y - height の高さ差を勾配長で割った近似距離。
// sqrt(1 + |grad|^2) は高さ場 surface の勾配長。slopeGuardはそれよりさらに保守的にしたい場合の下限。
let localSlopeGuard = max(slopeGuard, sqrt(1.0 + dot(heightGradient, heightGradient)));

// 地形上面、下面、矩形の外周をmaxで合成して、有限サイズで厚みのあるheight fieldにする。
// topDistance <= 0 かつ bottomDistance <= 0 かつ edgeDistance <= 0 が地形内部。
let topDistance = (point.y - height) / localSlopeGuard;
let bottomDistance = -point.y - baseDepth;
let edgeDistance = max(abs(point.x) - halfSize, abs(point.z) - halfSize);
let distance = max(max(topDistance, bottomDistance), edgeDistance);

// SceneEval用の解析的gradient。
// 上面では F = (y - h(x,z)) / guard なので grad(F)=(-dh/dx, 1, -dh/dz)/guard。
// max合成で下面または側面が選ばれた場合は、その面のgradientへ切り替える。
var grad = vec3<f32>(-heightGradient.x / localSlopeGuard, 1.0 / localSlopeGuard, -heightGradient.y / localSlopeGuard);
if (bottomDistance > topDistance && bottomDistance > edgeDistance) {
  grad = vec3<f32>(0.0, -1.0, 0.0);
} else if (edgeDistance > topDistance && edgeDistance > bottomDistance) {
  if (abs(point.x) > abs(point.z)) {
    grad = vec3<f32>(select(-1.0, 1.0, point.x >= 0.0), 0.0, 0.0);
  } else {
    grad = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, point.z >= 0.0));
  }
}

// 高度に応じた簡易地形色。textureを使わないsurface modeのfallbackにもなる。
let lowColor = vec3<f32>(0.16, 0.36, 0.22);
let midColor = vec3<f32>(0.50, 0.48, 0.34);
let highColor = vec3<f32>(0.88, 0.86, 0.78);
let snowColor = vec3<f32>(0.96, 0.97, 0.94);
let normalizedHeight = clamp(heightMeters / 3800.0, 0.0, 1.0);
let mountainColor = mix(
  mix(lowColor, midColor, smoothstep(0.08, 0.45, normalizedHeight)),
  mix(highColor, snowColor, smoothstep(0.72, 1.0, normalizedHeight)),
  smoothstep(0.45, 0.86, normalizedHeight)
);

// alphaが0の領域は海やデータ外領域として水色に固定する。
let waterColor = vec3<f32>(0.20, 0.72, 0.88);
let surfaceColor = select(waterColor, mountainColor, alpha > 0.5);

// texture1: 標準地図色、texture2: 写真/衛星系色。
// こちらは表示色なので通常のtextureSampleLevelでよい。height decodeには使わない。
let mapcolor = textureSampleLevel(texture1, sampler1, vec2<f32>(1.0-uv.x, 1.0 - uv.y), 0) ;
let photocolor = textureSampleLevel(texture2, sampler2, vec2<f32>(1.0-uv.x, 1.0 - uv.y), 0) ;

// SceneEvalを返すことで、hit後のnormal計算で有限差分ではなく上で計算したgradInfoを使える。
// materialId=2.0は組み込みPBR material。materialUniformはこのscene用のPBR係数。
// data1.xのsurface mode:
//   0 -> photocolor
//   1 -> surfaceColor * mapcolor
//   other -> surfaceColor
return SceneEval(
  distance,
  select(select(photocolor.xyz,surfaceColor,data1.x==0.), surfaceColor*mapcolor.xyz*1.2, data1.x == 1.),
  smoothness,
  point,
  vec4<f32>(grad, 1.0),
  2.0,
  vec4<f32>(0.0, 0.98, 0.0, 0.2)
);
`;

function FujiHeightMapSceneContent({ parameters }: { parameters: FujiHeightMapSceneParameters }) {
  return (
    <SdfFunction
      sdfFunction={FUJI_HEIGHT_MAP_SDF}
      data0={[20, parameters.heightScale, 0.18, parameters.slopeGuard]}
      data1={[parameters.surface, 0, 0, 0]}
      data2={[0, 0, 0, 0]}
      color={[1, 1, 1]}
      material="pbr"
      materialUniform={[0.0, 0.98, 0.0, 0.2]}
    />
  );
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getLightDirection(elevationDegrees: number, azimuthDegrees: number): [number, number, number] {
  const elevation = degreesToRadians(elevationDegrees);
  const azimuth = degreesToRadians(azimuthDegrees);
  const horizontal = Math.cos(elevation);

  return [
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal,
  ];
}

export function Scene({ parameters, canvasProps }: FujiHeightMapSceneProps) {
  return (
    <NexusCanvas
      {...canvasProps}
      camera={{ position: [9.5, 6.2, 12.5], target: [0, 1.15, 0], fov: 45 }}
      lighting={{
        direction: getLightDirection(parameters.lightElevation, parameters.lightAzimuth),
        color: [1.0, 0.96, 0.88],
        intensity: 1.0,
      }}
      background={{ yPositive: [0.56, 0.72, 0.88], yNegative: [0.18, 0.25, 0.27] }}
      orbitControls
      textures={HEIGHT_MAP_TEXTURES}
    >
      <FujiHeightMapSceneContent parameters={parameters} />
    </NexusCanvas>
  );
}
