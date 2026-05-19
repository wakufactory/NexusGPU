# NexusGPU Function Reference

`src/nexusgpu` 配下の主要な constant / function / class / TypeScript type と用途をまとめたリファレンスです。通常のscene作成で使う公開APIは `src/nexusgpu/index.ts` からexportされます。renderer / shaders / renderer 配下は内部実装向けです。WGSL文字列内の主要 `fn` は `WGSL fn` として併記します。

## Public API

`src/nexusgpu/index.ts` から公開されるAPIです。

- `NexusCanvas`: React childrenとして宣言したSDF sceneをWebGPU canvasへ描画するルートコンポーネント。
- `useFrame`: `NexusCanvas` 内で毎フレーム処理を購読するhook。
- `useCamera`: scene内からcamera設定を更新するhook。
- `useLighting`: scene内からlighting設定を更新するhook。
- `SdfSphere`: 球primitive。
- `SdfBox`: box primitive。`size` はフルサイズ指定。
- `SdfCylinder`: Y軸円柱primitive。
- `SdfCone`: Y軸円錐・円錐台primitive。
- `SdfCapsule`: 任意軸capsule / capped cylinder primitive。
- `SdfTorus`: XZ平面torus primitive。
- `SdfEllipsoid`: 楕円球primitive。
- `SdfTetrahedron`: 正四面体primitive。
- `SdfOctahedron`: 正八面体primitive。
- `SdfDodecahedron`: 正十二面体primitive。
- `SdfIcosahedron`: 正二十面体primitive。
- `SdfFunction`: WGSL文字列でSDFを定義するcustom primitive。
- `SdfGroup`: 子SDFをboolean演算で合成するgroup。
- `SdfNot`: `SdfGroup op="not"` のショートハンド。
- `SdfSubtract`: `SdfGroup op="subtract"` のショートハンド。
- `SdfMix`: 2つの子SDFをratioで線形補間するcomponent。
- `SdfModifier`: 子SDFの評価前後にWGSL modifierを差し込むcomponent。
- `SDF_PRIMITIVE_KIND_IDS`: built-in primitive名とGPU側kind IDの対応表。
- `type Vec3`, `Vec4`, `Quaternion`: 座標、色、GPU vec4、回転で使う基本tuple型。
- `type NexusCanvasProps`, `NexusCamera`, `NexusLighting`, `NexusLight`, `NexusLightType`, `NexusBackground`: canvas、camera、lighting、背景の公開props型。
- `type NexusRenderSettings`, `NexusRenderStats`, `NexusCanvasPixelSize`: 描画品質設定と観測値の型。
- `type NexusTextureSource`, `NexusTextureCrossOrigin`: scene texture指定の型。
- `type NexusMaterialPreset`, `NexusMaterialRef`: built-in / custom material指定の型。
- `type Sdf*Props`: 各SDF componentのprops型。
- `type SdfBooleanOperation`, `SdfMixProps`, `SdfModifierPreset`, `SdfPrimitiveKind`, `SdfBoundingSphere`, `SdfData`: scene graph / rendererが使うSDF関連型。

## src/nexusgpu/NexusCanvas.tsx

- `NexusCanvas`: Reactツリー、SceneStore、WebGpuSdfRendererを接続するルートコンポーネント。
  - canvas DOMを作成する。
  - `SceneStore` を作成し `SceneContext` でchildrenへ渡す。
  - `WebGpuSdfRenderer.create` でWebGPU rendererを初期化する。
  - scene snapshot、render settings、rendering enabled、texturesをrendererへ同期する。
  - `useOrbitCameraControls` でpointer / wheel / pinch操作をcamera更新へ接続する。
  - `requestAnimationFrame` で `useFrame` 購読者へ時刻を渡す。
  - WebGPU初期化失敗時はfallback DOMにerrorを表示する。
- `resolveBackground`: background propsへ `DEFAULT_BACKGROUND` を補う。

## src/nexusgpu/SceneContext.ts

- `SceneContext`: `NexusCanvas` 配下のcomponentへ `SceneStore` を渡すReact Context。
- `useSceneStore`: 現在の `SceneStore` を取得する内部向けhook。`NexusCanvas` 外では例外を投げる。
- `useFrame`: frame callbackを `SceneStore.subscribeFrame` に登録する。
- `useCamera`: `set(camera)` でcameraを動的更新するAPIを返す。
- `useLighting`: `set(lighting)` でlightingを動的更新するAPIを返す。

## src/nexusgpu/SceneStore.ts

- `type SceneListener`: `SceneSnapshot` 変更通知を受け取る購読callback。
- `class SceneStore`: React側のscene graph、camera、lighting、background、frame listenerを保持するストア。
  - `setCamera`: camera propsをfallback込みで反映して通知する。
  - `setLighting`: lighting propsを `resolveLighting` で正規化して通知する。
  - `setBackground`: background propsをfallback込みで反映して通知する。
  - `upsertNode`: primitive nodeをscene graphへ追加または更新する互換API。
  - `upsertSceneNode`: primitive / group / modifierのroot scene nodeを追加または更新する。
  - `removeNode`: primitive nodeを削除する互換API。
  - `removeSceneNode`: root scene nodeを削除する。
  - `subscribe`: scene snapshot変更を購読する。登録直後にも現在値を渡す。
  - `subscribeFrame`: `useFrame` 用callbackを購読する。
  - `advanceFrame`: 登録済みframe callbackへ時刻情報を流す。
  - `snapshot`: rendererへ渡す不変 `SceneSnapshot` を作る。
  - `snapshot` 内では `collectSdfNodes` でscene treeからprimitive `SdfNode` だけを収集する。

## src/nexusgpu/sceneTraversal.ts

- `getSceneNodeChildren`: primitiveなら空配列、それ以外なら `children` を返す。
- `walkSceneNodesPreOrder`: `SdfSceneNode[]` を深さ優先pre-orderで走査する。
- `collectSceneNodesPreOrder`: pre-orderの `SdfSceneNode[]` を返す。
- `countSceneNodes`: scene tree内のnode数を数える。
- `collectSdfNodes`: scene treeからprimitive `SdfNode` だけを収集する。

## src/nexusgpu/primitives.tsx

- `DEFAULT_COLOR`: primitive未指定時の色。
- `DEFAULT_POSITION`: primitive / group未指定時の位置。
- `DEFAULT_ROTATION`: 回転未指定時のQuaternion。
- `DEFAULT_DATA`: `SdfFunction` / `SdfModifier` 用data vec4の既定値。
- `DEFAULT_MATERIAL_UNIFORM`: material uniformの既定値。
- `type SdfSceneNodeListener`: group / modifier registryが子ノード配列を通知するcallback。
- `type SdfSceneNodeTarget`: scene nodeを追加/更新/削除できる登録先interface。
- `type SdfPrimitiveNodeOptions`: `useSdfPrimitiveNode` へ渡すprimitive共通props。
- `type SdfPrimitiveNodeFields`: primitive固有の `data` / `sdfFunction`。
- `SdfSceneNodeTargetContext`: group / modifier配下の子ノード登録先を切り替えるContext。
- `SdfSphere`: React propsから球primitive nodeを登録する。
- `SdfBox`: React propsからbox primitive nodeを登録する。`size` は半径ベクトルへ変換される。
- `SdfCylinder`: React propsからY軸円柱primitive nodeを登録する。
- `SdfCone`: React propsからY軸円錐台primitive nodeを登録する。
- `SdfCapsule`: React propsから任意軸capsule / capped cylinder primitive nodeを登録する。
- `SdfTorus`: React propsからtorus primitive nodeを登録する。
- `SdfEllipsoid`: React propsからellipsoid primitive nodeを登録する。
- `SdfTetrahedron`, `SdfOctahedron`, `SdfDodecahedron`, `SdfIcosahedron`: 正多面体primitive nodeを登録する。
- `SdfRegularPolyhedronPrimitive`: 正多面体component共通の内部実装。
- `SdfFunction`: WGSL SDF関数文字列を持つcustom primitive nodeを登録する。
- `SdfGroup`: 子SDFをboolean演算単位にまとめる。transform、smoothness、material override、明示boundsも保持する。
- `SdfNot`: `SdfGroup op="not"` のショートハンド。
- `SdfSubtract`: `SdfGroup op="subtract"` のショートハンド。
- `SdfMix`: 2つの子SDFをratioで線形補間する。
- `SdfModifier`: 子SDFの評価前後にcustom / preset modifier WGSLを差し込む。
- `useStableId`: React再レンダーをまたいで同じsymbol IDを保つ。
- `useSdfSceneNodeTarget`: 現在の登録先をContextまたはSceneStoreから取得する。
- `useSdfPrimitiveNode`: primitive共通のID生成、props正規化、active判定、登録、解除を行う内部hook。
- `class SdfGroupRegistry`: group / modifier内の子ノードを集約して親へmicrotask単位で通知するregistry。
- `createSdfData`: `data0-2` を `SdfData` tupleへまとめる。
- `toHalfSize`: boxのfull size propsをSDF用半径ベクトルへ変換する。
- `createExplicitBounds`: `SdfFunction.bounds` / `SdfGroup.bounds` propを正規化し、枝刈り用bounding sphereを作る。
- `resolveSdfModifierFunctions`: presetと直接指定からpre / post modifier WGSLを解決する。
- `type SdfModifierPresetFunctions`: presetが提供するpre / post modifier WGSLの入れ物。
- `resolveSdfModifierPreset`: `twistY`, `preRepeat`, `preScale`, `postInflate`, `postOnion` をWGSL bodyへ変換する。`preRepeat`は`data0.w > 0.5`でmirror repeatに切り替える。
- `normalizeRadii`: ellipsoid radii propsを正規化する。

## src/nexusgpu/types.ts

- `type Vec3`: 3次元ベクトル。座標、色、サイズで共通利用する。
- `type Vec4`: 4次元ベクトル。GPUのvec4境界に揃えた追加データで使う。
- `type SdfData`: primitive / modifierごとの `data0`, `data1`, `data2` tuple。
- `type SdfBoundingSphere`: bounds指定やgroup bounds計算に使う保守的なbounding sphere。
- `type SdfBooleanOperation`: `"or" | "and" | "subtract" | "not"`。
- `type Quaternion`: 回転を `[x, y, z, w]` で表すQuaternion。
- `type NexusCamera`: `position`, `target`, `fov` を持つcamera props。
- `type NexusLightType`: `"directional" | "point" | "spot"`。
- `type NexusLight`: 1つのlight設定。`type`, `direction`, `position`, `color`, `intensity`, `range` を持つ。
- `type NexusLighting`: 旧来のtop-level light指定に加え、`lights` 配列を持てるlighting props。
- `type ResolvedNexusLight`, `ResolvedNexusLighting`: fallback適用後の内部lighting型。
- `type NexusMaterialPreset`: `"default" | "normal" | "pbr" | "texture0Color" | "texture0Matcap"`。
- `type NexusMaterialRef`: built-in material名またはcustom WGSL material `{ wgsl, key? }`。
- `type NexusTextureCrossOrigin`: texture imageのcrossOrigin指定。
- `type NexusTextureSource`: texture URLまたはsampler設定付きtexture source。
- `type NexusBackground`: 未ヒット時に表示する上下2色の背景設定。
- `type NexusRenderSettings`: `maxFps`, `resolutionScale`, `maxSteps`, `maxDistance`, `shadows`, `normalEpsilon`, `surfaceEpsilon`, `stereoSbs`, `stereoBase`, `stereoSwapEyes`, `hitInteriorSurfaces` を持つ描画品質設定。
- `type NexusCanvasPixelSize`: WebGPU backing storeの実ピクセルサイズ。
- `type NexusRenderStats`: `fps` と `canvasPixelSize` の観測値。
- `type NexusFrameState`: frame callbackへ渡す `time`, `elapsed`, `delta`。
- `type NexusFrameCallback`: `useFrame` で毎フレーム呼ばれるcallback。
- `type SdfPrimitiveProps`: primitive共通props。`active`, `position`, `rotation`, `color`, `smoothness`, `material`, `materialUniform`。
- `type SdfSphereProps`, `SdfBoxProps`, `SdfCylinderProps`, `SdfConeProps`, `SdfCapsuleProps`, `SdfTorusProps`, `SdfEllipsoidProps`, `SdfRegularPolyhedronProps`, `SdfFunctionProps`: 各primitive props。
- `type SdfGroupProps`: group component props。
- `type SdfMixProps`: mix component props。
- `type SdfModifierPreset`: built-in modifier preset名。
- `type SdfModifierProps`: modifier component props。
- `type NexusCanvasProps`: `NexusCanvas` が受け取る公開props。
- `type SdfNode`: rendererへ渡す正規化済みprimitiveデータ。
- `type SdfPrimitiveSceneNode`, `SdfGroupSceneNode`, `SdfModifierSceneNode`, `SdfSceneNode`: scene tree node型。
- `type SceneSnapshot`: `SceneStore` からrendererへ渡す一貫したscene状態。

## src/nexusgpu/sdfKinds.ts

- `SDF_PRIMITIVE_KIND_IDS`: built-in primitive名とGPU側kind IDの対応表。`sphere`, `box`, `cylinder`, `torus`, `ellipsoid`, `cone`, `capsule`, `tetrahedron`, `octahedron`, `dodecahedron`, `icosahedron` を含む。
- `CUSTOM_SDF_PRIMITIVE_KIND_START`: custom SDF / modifierへ割り当てるkind IDの開始値。
- `SDF_OPERATION_KIND_IDS`: GPU record上のgroup begin/end用ID。
- `SDF_BOOLEAN_OPERATION_IDS`: boolean演算名と数値IDの対応表。
- `type BuiltinSdfPrimitiveKind`: built-in primitive名のunion型。
- `type SdfPrimitiveKind`: built-in primitiveまたはcustom `"function"` を表すprimitive種別。

## src/nexusgpu/defaults.ts

- `DEFAULT_CAMERA`: camera未指定時の位置、注視点、FOV。
- `DEFAULT_LIGHTING`: lighting未指定時のresolved main light。
- `DEFAULT_BACKGROUND`: background未指定時の上下グラデーション色。

## src/nexusgpu/lighting.ts

- `LIGHT_TYPE_IDS`: resolved light typeとshaderへ渡す数値IDの対応表。
- `resolveLighting`: `NexusLighting` を `ResolvedNexusLighting` へ正規化する。`lights` 配列があれば先頭をmain lightにし、なければtop-level指定をmain directional lightとして扱う。
- `getLightTypeId`: resolved light typeをshader用IDへ変換する。
- `resolveLight`: 1つのlightへfallback値を補う。

## src/nexusgpu/math.ts

- `normalizeVec3`: Vec3 propsを検証し、不正成分をfallbackで補う。
- `normalizeQuaternion`: Quaternion propsを検証・正規化し、不正値ならfallbackを使う。
- `clamp`: 数値を指定範囲に収める。
- `subtractVec3`: 2つのVec3の差を返す。
- `lengthVec3`: Vec3の長さを返す。
- `crossVec3`: 2つのVec3の外積を返す。
- `normalizeDirectionVec3`: Vec3を単位ベクトル化し、ゼロ長ならfallbackを返す。
- `rotateVec3ByQuaternion`: Vec3をQuaternionで回転する。
- `fract`: 小数部を返す。
- `simplexMod289`, `simplexPermute`, `simplexTaylorInvSqrt`: simplex noise用helper。
- `dot3`, `dot4`, `scale4`: vector演算helper。
- `axisAngleToQuaternion`: 軸と角度からQuaternionを作る。
- `simplexGrad4`: 4D simplex noise用勾配ベクトルを作る。
- `simplexNoise3d`: 3D simplex noise値を返す。
- `simplexNoise4d`: 4D simplex noise値を返す。
- `simplexNoise`: 3D simplex noiseの別名。
- `hsl2rgb`: HSL色をRGBへ変換する。

## src/nexusgpu/useOrbitCameraControls.ts

- `type OrbitCameraState`: orbit操作中のtarget、fov、radius、yaw、pitchなどの内部状態。
- `type OrbitCameraControlsOptions`: orbit controls hookへ渡すcanvas ref、camera、enabled、store設定。
- `MIN_POLAR_ANGLE`, `MAX_POLAR_ANGLE`: orbit cameraのpitch制限。
- `ORBIT_ROTATE_SPEED`: pointer移動量からyaw / pitchへ変換する係数。
- `ORBIT_ZOOM_SPEED`: wheel deltaからzoom倍率へ変換する係数。
- `useOrbitCameraControls`: pointer drag、wheel、pinchをcamera更新へ変換するReact hook。
- `resolveCamera`: camera propsへ既定値を補う。
- `getPointerDistance`: 2本指pointer間の距離を返す。
- `createOrbitCameraState`: camera位置からorbit内部状態を作る。
- `createCameraFromOrbitState`: orbit内部状態からcamera propsを復元する。

## src/nexusgpu/WebGpuSdfRenderer.ts

- `CAMERA_FLOATS`: CameraUniformへ詰めるf32要素数。
- `CAMERA_BUFFER_SIZE`: camera uniform bufferのバイトサイズ。
- `DEFAULT_RENDER_SETTINGS`: UIから省略された描画品質設定の既定値。
- `class WebGpuSdfRenderer`: CanvasへWebGPU SDF raymarch結果を描画する低レベルrenderer。
  - `create`: WebGPU adapter / deviceを取得してrendererを初期化する。
  - `setScene`: `SceneSnapshot` を受け取り、pipelineとobject bufferを更新する。
  - `setRenderSettings`: 描画品質設定を正規化し、必要ならcanvas解像度を更新する。
  - `setRenderingEnabled`: 連続描画ループの停止/再開を切り替える。
  - `destroy`: RAF、ResizeObserver、GPUBuffer、textureを解放する。
  - `setTextures`: scene texture / samplerを更新する。
- `normalizeRenderSettings`: render settingsをshaderが扱える安全な範囲へ丸める。

## src/nexusgpu/renderer/debugFlags.ts

- `DEBUG_SCENE_COMPILE_PROFILE`: pipeline再生成時にscene compile profileをconsoleへ出すかのフラグ。
- `DEBUG_SCENE_OBJECTS_DUMP`: pipeline再生成時にStorage Buffer詰め順のscene objects dumpをconsoleへ出すかのフラグ。
- `DEBUG_GENERATED_SHADER_SOURCE`: 結合後のWGSL shader全体をconsoleへ出すかのフラグ。
- `DEBUG_GENERATED_SCENE_MAPPING`: 展開済みscene mapping WGSLをconsoleへ出すかのフラグ。

## src/nexusgpu/renderer/sceneDebugDump.ts

- `type GetSdfKindId`: `SdfNode` からGPU側kind IDを返すcallback。
- `logSceneCompileProfile`: `SceneCompileProfile` をJSON文字列としてconsoleへ出す。
- `logSceneObjectsDump`: `SceneSnapshot.sceneNodes` をpre-orderで走査し、Storage Bufferへ詰める順序のobject dumpをconsoleへ出す。
- `createSceneObjectDump`: scene treeをdebug dump用row配列へ変換する。
- `appendSceneObjectDumpRow`: 1つのscene nodeをdebug dump rowへ変換する。
- `formatVec`, `formatNumber`, `previewSource`: debug dump用formatter。

## src/nexusgpu/sdfShader.ts

- `MAX_SDF_OBJECTS`: Storage Bufferへ載せるSDF object最大数。
- `sdfShader`: 既定の最大object数で組み立てたWGSL shader全体。

## src/nexusgpu/renderer/customWgslFunctions.ts

- `type CustomSdfFunctionCallSpec`: custom SDF関数のrenderer管理名、戻り値種別、引数対応を表す。
- `type CustomSdfFunctionNameMap`: SDF関数sourceからcall specを引くmap。
- `type CustomSdfModifierFunctionCallSpec`: custom modifier関数のrenderer管理名と戻り値種別を表す。
- `type CustomSdfModifierFunctionNameMap`: modifier keyからcall specを引くmap。
- `type SdfModifierFunctionSource`: pre / post種別、key、sourceを持つmodifier WGSL情報。
- `unique`: 出現順を保ったまま文字列配列の重複を取り除く。
- `uniqueModifierFunctionSources`: scene tree内のmodifier WGSLをkey単位で重複排除する。
- `collectSdfFunctionSources`: `walkSceneNodesPreOrder` でscene tree内の `SdfFunction` WGSLソースを集める。
- `collectSdfModifierFunctionSources`: `walkSceneNodesPreOrder` でscene tree内のmodifier pre / post WGSLソースを集める。
- `createSdfModifierFunctionKey`: pre / post種別とsourceから一意keyを作る。
- `createCustomSdfFunctionSource`: `SdfFunction` 入力をrenderer管理名のWGSL関数へ正規化する。
- `createCustomSdfModifierFunctionSource`: `SdfModifier` 入力をpre / post固定シグネチャのWGSL関数へ正規化する。
- `parseWgslFunctionDeclaration`: WGSL関数宣言から関数名、引数数、戻り値型を抽出する。

## src/nexusgpu/renderer/materialShaderCompiler.ts

- `DEFAULT_MATERIAL_ID`: default materialのID。
- `NORMAL_MATERIAL_ID`, `PBR_MATERIAL_ID`, `TEXTURE0_COLOR_MATERIAL_ID`, `TEXTURE0_MATCAP_MATERIAL_ID`: built-in material ID。
- `CUSTOM_MATERIAL_ID_START`: custom material IDの開始値。
- `type MaterialShaderPlan`: material shader文字列、signature、custom material ID表をまとめた計画。
- `type CustomMaterial`: custom materialのkey、source、割り当てID。
- `createMaterialShaderPlan`: scene treeからmaterial shader断片、signature、custom ID表を作る。
- `getBuiltinMaterialId`: built-in material名を固定IDへ変換する。
- `getCustomMaterialKey`: custom materialの安定keyを返す。
- `collectCustomMaterials`: `walkSceneNodesPreOrder` でscene tree内のcustom materialを集める。
- `addCustomMaterial`: nodeのcustom material WGSLをmapへ追加する。
- `createMaterialShader`: built-in / custom materialをdispatchするWGSLを生成する。
- `renameMaterialFunction`: custom material関数名をrenderer管理名へ差し替える。
- `WGSL fn shadeMaterialById`: material IDに応じてmaterial関数を選ぶ。
- `WGSL fn shadeMaterial`: `RaymarchHit` から `MaterialInput` を作り、最終色を計算する。

## src/nexusgpu/renderer/sceneBuffers.ts

- `OBJECT_STRIDE_FLOATS`: 1 `SdfObject` recordあたりのf32数。
- `OBJECT_BUFFER_SIZE`: SDF object storage bufferのバイトサイズ。
- `type SdfRecord`: GPU bufferへ詰める1 object分の数値配列。
- `type GetSdfKindId`: `SdfNode` からGPU側kind IDを返すcallback。
- `type GetMaterialId`: primitive / group nodeからmaterial IDを返すcallback。
- `compileSceneObjectRecords`: scene treeをStorage Buffer用record列へ変換する。
- `countSceneObjectRecords`: scene tree展開後のrecord数を数える。
- `createSceneObjectRecord`: 1つのscene nodeをStorage Buffer用recordへ変換する。
- `createPrimitiveRecord`: primitive `SdfNode` を固定長f32 recordへ詰める。
- `createModifierRecord`: modifier dataを補助recordへ詰める。
- `createMixRecord`: mix ratioを補助recordへ詰める。
- `createGroupRecord`: group transform / smoothness / materialを補助recordへ詰める。

## src/nexusgpu/renderer/scenePipelineCompiler.ts

- `type SceneShaderPlan`: pipeline再生成に必要なshader断片、signature、ID表、profileをまとめた計画。
- `createSceneShaderPlan`: `SceneSnapshot` からpipeline再生成に必要な可変shader部品を作る。
- `getMaterialIdFromPlan`: material refをplan内のbuilt-in / custom material IDへ変換する。

## src/nexusgpu/renderer/sceneShaderCompiler.ts

- `type ExpandedSceneCompileState`: object indexと一時変数indexを持つscene展開状態。
- `type SceneCompileMode`: 距離のみ評価か詳細評価かを表すcompile mode。
- `type ExpandedSceneCompileResult`: 生成WGSL、hit変数名、smoothness式をまとめた結果。
- `type BuiltinPrimitiveShaderSpec`: built-in primitiveのdistance式とgradient式を作る関数ペア。
- `BUILTIN_PRIMITIVE_SHADER_SPECS`: built-in primitive kindごとのWGSL distance / gradient式テーブル。
- `type SceneCompileProfile`: scene shader展開のprimitive / group / modifier / gradient統計。
- `createExpandedMapSceneBody`: scene treeを `mapSceneDistance` / `mapSceneEval` / `mapScene` WGSL bodyへ展開する。
- `createEmptyMapSceneBody`: scene未設定時の空 `mapScene*` WGSL bodyを作る。
- `createSceneCompileProfile`: scene shader展開の統計情報を作る。
- `accumulateSceneCompileProfile`: 1 node分のprofile値を加算する。tree走査は `walkSceneNodesPreOrder` が担当する。
- `compileExpandedSceneNode`: 1つのscene nodeを評価するWGSL片へ再帰コンパイルする。
- `compileExpandedModifierNode`: modifier nodeのpre / post評価をWGSL片へコンパイルする。
- `createImplicitUnionGroup`: modifier配下の複数childrenを暗黙union groupに包む。
- `createLocalPointExpression`: primitive用local point変換式を作る。
- `createGroupLocalPointExpression`: group用local point変換式を作る。
- `createPrimitiveHitExpression`: built-in / custom primitiveのhit評価式を作る。
- `createSceneTopologySignature`: pipeline再生成判定用にscene tree形状を文字列化する。
- `createSceneNodeTopologySignature`: 1 nodeをtopology signature断片へ変換する。
- `nextTempName`, `nextGroupMaterialHitName`, `nextGroupTransformHitName`: 生成WGSL内の一時変数名を発行する。
- `createGroupTransformLines`: group回転後のgradient補正WGSL行を作る。
- `createGroupMaterialOverrideLines`: group material override用WGSL行を作る。
- `formatWgslFloat`: JS numberをWGSL f32 literalへ整形する。
- `formatSdfDataArgs`: `SdfObject` の `data0-2` 引数列を作る。

## src/nexusgpu/renderer/sceneTextures.ts

- `MAX_SCENE_TEXTURES`: shaderへbindするscene texture最大数。
- `SCENE_SAMPLER_BINDING_START`: sampler binding番号の開始位置。
- `SCENE_TEXTURE_BINDING_START`: texture binding番号の開始位置。
- `type NormalizedTextureSource`: texture sourceとsampler設定を内部形式へ揃えた型。
- `type TextureLoadResult`: 非同期読み込み後のtexture slot indexとGPUTexture。
- `class SceneTextureBindings`: scene texture / sampler slotを管理し、bind group entriesを作る。
  - `setTextures`: texture sourceを正規化し、非同期load後にslotを差し替える。
  - `createBindGroupEntries`: sampler / textureのbind group entriesを返す。
  - `destroy`: load世代を無効化し、GPUTextureを破棄する。
- `normalizeTextureSource`: stringまたはobject指定のtexture sourceを内部形式へ正規化する。
- `loadTexture`: HTMLImageElementからGPUTextureを作る。
- `createFallbackTexture`: 未設定 / 読み込み中用の1x1白textureを作る。

## src/nexusgpu/shaders/index.ts

- `type CustomSdfFunctionShader`: shaderへ連結するcustom SDF / modifier関数のID、関数名、source。
- `shaderSectionsBeforeMapping`: scene mappingより前に連結する固定shaderセクション。
- `assembleSdfShader`: shader constants、layout、SDF関数、custom関数、scene mapping、material、entry pointを連結してWGSLを作る。
- `type ShaderChunkLibrary`: `shaderLibrary.ts` からre-exportされるinclude chunk辞書型。

## src/nexusgpu/shaders/shaderConstants.ts

- `createShaderConstants`: 最大object数などのWGSL定数セクションを生成する。
- `WGSL const MAX_OBJECTS`: shader内で参照するSDF object最大数。
- `WGSL const MAX_STEPS_CAP`: raymarch loopの上限step数。

## src/nexusgpu/shaders/shaderLayout.ts

- `shaderLayout`: `CameraUniform`, `SdfObject`, `SceneHit`, `SceneDistance`, `SceneEval`, `RaymarchHit`, `MaterialInput` とbind group宣言を含むWGSL layout。

## src/nexusgpu/shaders/sdfPrimitivesShader.ts

- `sdfPrimitivesShader`: built-in SDF、quaternion、noise、color helperのinclude集。

## src/nexusgpu/shaders/shaderLibrary.ts

- `type ShaderChunkLibrary`: include chunk名からWGSL sourceへ引く辞書型。
- `INCLUDE_PATTERN`: `#include <chunk>` 行を検出する正規表現。
- `shaderChunkLibrary`: WGSL include chunk名とsourceの対応表。
- `resolveShaderIncludes`: shader source内のincludeを再帰展開し、循環と未知chunkを検出する。
- `WGSL fn sdSphere`, `sdSphereGrad`: 球SDFとgradient。
- `WGSL fn sdBox`, `sdBoxGrad`: box SDFとgradient。
- `WGSL fn sdCylinder`, `sdCylinderGrad`: Y軸円柱SDFとgradient。
- `WGSL fn sdCone`, `sdConeGrad`: Y軸円錐台SDFとgradient。
- `WGSL fn sdCapsule`, `sdCapsuleGrad`: 任意軸capsule / capped cylinder SDFとgradient。
- `WGSL fn sdTorus`, `sdTorusGrad`: torus SDFとgradient。
- `WGSL fn sdEllipsoid`, `sdEllipsoidGrad`: ellipsoid近似SDFとgradient。
- `WGSL const POLY_PHI`, `POLY_INV_PHI`, `POLY_INV_SQRT3`, `POLY_ICOS_DODEC_INRADIUS_RATIO`: 正多面体SDF用定数。
- `WGSL fn sdTetrahedron`, `sdOctahedron`, `sdDodecahedron`, `sdIcosahedron`, `sdPolyhedronGrad`: 正多面体SDFとgradient。
- `WGSL fn smoothMin`: 2つの距離を滑らかに結合する。
- `WGSL fn rotateByQuaternion`: Vec3をQuaternionで回転する。
- `WGSL fn simplexMod289Vec3`, `simplexMod289Vec4`, `simplexPermute`, `simplexTaylorInvSqrt`, `simplexGrad4`, `simplexNoise3d`, `simplexNoise4d`, `simplexNoise`: simplex noise helper。
- `WGSL fn materialDefault`: 既定のdiffuse / ambient / shadow / rim material色を返す。`materialUniform.x`でambient、`materialUniform.y`でrim強度を調整する。
- `WGSL fn materialNormal`: normalをRGBとして可視化する。
- `WGSL fn materialPbrFresnelSchlick`, `materialPbrDistributionGgx`, `materialPbrGeometrySchlickGgx`, `materialPbrGeometrySmith`, `materialPbr`: 軽量Cook-Torrance風material。
- `WGSL fn materialTexture0Color`: texture0をlocalPoint.xzでsampleして色に使う。
- `WGSL fn materialTexture0Matcap`: view-space normalからmatcap textureをsampleする。
- `WGSL fn hsl2rgb`: HSL色をRGBへ変換する。

## src/nexusgpu/shaders/sceneMappingShader.ts

- `createSceneMappingShader`: scene評価補助関数とmapScene bodyを結合したWGSLを作る。
- `createEmptyMapSceneBody`: 空シーン用の `mapScene*` WGSL bodyを作る。
- `sceneMappingShader`: 空シーンbodyで生成した既定scene mapping WGSL。
- `WGSL fn sceneHitFromEval`: `SceneEval` を互換用 `SceneHit` へ変換する。
- `WGSL fn sceneHitFromDistance`: `SceneDistance` とlocalPointから `SceneHit` を作る。
- `WGSL fn sceneDistance`: 距離とsmoothnessから `SceneDistance` を作る。
- `WGSL fn sceneDistanceFromHit`, `sceneDistanceFromEval`: 詳細評価から距離評価だけを取り出す。
- `WGSL fn sceneEvalFromHit`, `sceneEvalFromHitWithMaterial`: `SceneHit` を `SceneEval` へ変換する。
- `WGSL fn sceneEvalWithGrad`, `sceneEvalNoGrad`: gradient有無に応じた `SceneEval` を作る。
- `WGSL fn invalidateSceneEvalGrad`: `SceneEval` のgradient信頼フラグを無効化する。
- `WGSL fn rotateSceneEvalGrad`: `SceneEval` のgradientをQuaternionで回転する。
- `WGSL fn sceneEvalWithMaterial`: `SceneEval` のmaterial情報を差し替える。
- `WGSL fn chooseMaterialId`, `chooseMaterialUniform`: smooth blend重みに応じてmaterial情報を選ぶ。
- `WGSL fn unionDistance`, `intersectDistance`, `subtractDistance`, `notDistance`: 距離評価のboolean合成。
- `WGSL fn unionHit`, `intersectHit`, `subtractHit`, `notHit`: 詳細評価のboolean合成。
- `WGSL fn mapSceneDistance`: 空シーン用に遠方距離を返す。
- `WGSL fn mapSceneEval`: 空シーン用の既定詳細評価を返す。
- `WGSL fn mapScene`: `SceneEval` を `SceneHit` へ変換して返す互換関数。

## src/nexusgpu/shaders/raymarchShader.ts

- `raymarchShader`: SDF距離場をraymarchするWGSL。
- `WGSL fn raymarch`: rayを進めてsurface hitを探し、`RaymarchHit` を返す。

## src/nexusgpu/shaders/lightingShader.ts

- `lightingShader`: 法線推定と背景色計算のWGSL。
- `WGSL fn estimateNormal`: pointの `SceneEval` から法線を推定する。
- `WGSL fn estimateNormalFromHit`: `RaymarchHit` のgradInfoから法線を推定する。
- `WGSL fn estimateNormalFromGradInfo`: 解析的gradientがあれば使い、なければ有限差分で法線を近似する。
- `WGSL fn background`: 未ヒット時の上下グラデーション背景色を返す。

## src/nexusgpu/shaders/fragmentShader.ts

- `fragmentShader`: pixelごとのray生成とshade処理を含むWGSL fragment shader。
- `WGSL fn fragmentMain`: screen座標からrayを作り、raymarch結果または背景色を返す。stereo SBS設定にも対応する。

## src/nexusgpu/shaders/vertexShader.ts

- `vertexShader`: fullscreen triangleを描くWGSL vertex shader。
- `WGSL fn vertexMain`: vertex indexからfullscreen triangleのclip-space座標を返す。
