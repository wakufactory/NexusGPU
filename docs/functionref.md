# NexusGPU Function Reference

`src/nexusgpu` 配下のファイルごとに、主要な constant / function / class / TypeScript type と簡単な用途をまとめたリファレンスです。WGSL文字列内の主要 `fn` は `WGSL fn` として併記しています。

## src/nexusgpu/WebGpuSdfRenderer.ts

- `CAMERA_FLOATS`: CameraUniformへ詰めるf32要素数。
- `CAMERA_BUFFER_SIZE`: camera uniform bufferのバイトサイズ。
- `LOG_SCENE_COMPILE_PROFILE`: scene shader compile profileをconsoleへ出すかのフラグ。
- `LOG_GENERATED_SHADER_SOURCE`: 生成WGSLの一部をconsoleへ出すかのフラグ。
- `DEFAULT_RENDER_SETTINGS`: UIから省略された描画品質設定の既定値。
- `class WebGpuSdfRenderer`: CanvasへWebGPU SDFレイマーチング結果を描画する低レベルレンダラ。
  - `create`: WebGPU adapter/deviceを取得してrendererを初期化する。
  - `setScene`: SceneSnapshotを受け取り、pipelineとobject bufferを更新する。
  - `setRenderSettings`: 描画品質設定を正規化し、必要ならcanvas解像度を更新する。
  - `setRenderingEnabled`: 連続描画ループの停止/再開を切り替える。
  - `destroy`: RAF、ResizeObserver、GPUBuffer、textureを解放する。
  - `setTextures`: texture bind group用のtexture/samplerを更新する。
- `normalizeRenderSettings`: render settingsをshaderが扱える安全な範囲へ丸める。
- `clamp`: 数値を指定範囲に制限する。
- `formatVec`: 数値配列をログ表示用文字列にする。
- `formatNumber`: 数値をログ表示用に短く丸める。
- `previewSource`: WGSLソースをログ表示用に1行へ圧縮する。
- `subtract`: 3Dベクトルの差を返す。
- `cross`: 3Dベクトルの外積を返す。
- `normalize`: 3Dベクトルを単位化し、ゼロ長ならfallbackを返す。

## src/nexusgpu/NexusCanvas.tsx

- `NexusCanvas`: Reactツリー、SceneStore、WebGpuSdfRendererを接続するルートコンポーネント。
- `resolveLighting`: lighting propsへ既定値を補う。
- `resolveBackground`: background propsへ既定値を補う。

## src/nexusgpu/SceneContext.ts

- `SceneContext`: NexusCanvas配下のコンポーネントへSceneStoreを渡すReact Context。
- `useSceneStore`: 現在のSceneStoreを取得し、NexusCanvas外では明示的に失敗する。
- `useFrame`: NexusCanvasのフレームループへcallbackを登録する。
- `useCamera`: scene componentからcameraを更新するAPIを返す。
- `useLighting`: scene componentからlightingを更新するAPIを返す。

## src/nexusgpu/SceneStore.ts

- `type SceneListener`: SceneSnapshot変更通知を受け取る購読callback。
- `class SceneStore`: React側のSDFノード、カメラ、ライティング、背景を保持するシーンストア。
  - `setCamera`: camera propsを反映して購読者へ通知する。
  - `setLighting`: lighting propsを反映して購読者へ通知する。
  - `setBackground`: background propsを反映して購読者へ通知する。
  - `upsertNode`: primitiveノードを追加または更新する。
  - `upsertSceneNode`: primitive/group/modifierを問わずroot scene nodeを更新する。
  - `removeNode`: primitiveノードを削除する。
  - `removeSceneNode`: scene nodeを削除する。
  - `subscribe`: SceneSnapshotの変更を購読する。
  - `subscribeFrame`: frame callbackを購読する。
  - `advanceFrame`: 登録済みframe callbackへ時刻情報を流す。
  - `snapshot`: 現在のシーン状態をrenderer向けの不変データへまとめる。
- `flattenSdfNodes`: scene treeからprimitive SdfNodeだけを再帰的に集める。

## src/nexusgpu/defaults.ts

- `DEFAULT_CAMERA`: camera未指定時の位置、注視点、FOV。
- `DEFAULT_LIGHTING`: lighting未指定時の平行光源方向。
- `DEFAULT_BACKGROUND`: background未指定時の上下グラデーション色。

## src/nexusgpu/index.ts

- 公開APIのre-export専用ファイル。定数、関数、class、typeの直接定義はありません。

## src/nexusgpu/math.ts

- `normalizeVec3`: Vec3 propsを検証し、不正成分をfallbackで補う。
- `normalizeQuaternion`: Quaternion propsを検証・正規化し、不正値ならfallbackを使う。
- `clamp`: 数値を指定範囲に収める。
- `fract`: 小数部を返す。
- `simplexMod289`: simplex noise用の289周期modを返す。
- `simplexPermute`: simplex noise用のpermute値を返す。
- `simplexTaylorInvSqrt`: simplex noise用の近似逆平方根を返す。
- `dot3`: Vec3の内積を返す。
- `dot4`: Vec4の内積を返す。
- `scale4`: Vec4をスカラー倍する。
- `axisAngleToQuaternion`: 軸と角度からQuaternionを作る。
- `simplexGrad4`: 4D simplex noise用の勾配ベクトルを作る。
- `simplexNoise3d`: 3D simplex noise値を返す。
- `simplexNoise4d`: 4D simplex noise値を返す。
- `simplexNoise`: 3D simplex noiseの別名。
- `hsl2rgb`: HSL色をRGBへ変換する。

## src/nexusgpu/primitives.tsx

- `type SdfSceneNodeListener`: group/modifier registryが子ノード配列を通知するcallback。
- `type SdfSceneNodeTarget`: scene nodeを追加/更新/削除できる登録先interface。
- `DEFAULT_COLOR`: primitiveの既定色。
- `DEFAULT_POSITION`: primitive/groupの既定位置。
- `DEFAULT_ROTATION`: primitive/groupの既定Quaternion。
- `DEFAULT_DATA`: SdfFunction/Modifier用data vec4の既定値。
- `DEFAULT_MATERIAL_UNIFORM`: materialUniformの既定値。
- `EMPTY_GROUP_BOUNDS`: 有効なboundsを持たないgroupを表すsentinel。
- `SdfSceneNodeTargetContext`: group/modifier配下の子ノード登録先を切り替えるContext。
- `SdfSphere`: React propsからSDF球ノードを登録する。
- `SdfBox`: React propsからSDFボックスノードを登録する。
- `SdfCylinder`: React propsからSDF円柱ノードを登録する。
- `SdfTorus`: React propsからSDFトーラスノードを登録する。
- `SdfEllipsoid`: React propsからSDF楕円球ノードを登録する。
- `SdfFunction`: WGSL SDF関数文字列を使う汎用primitiveを登録する。
- `SdfGroup`: 子SDFをboolean演算単位にまとめる。
- `SdfNot`: `SdfGroup op="not"` のショートハンド。
- `SdfSubtract`: `SdfGroup op="subtract"` のショートハンド。
- `SdfModifier`: 子SDFの評価前後にWGSL modifierを差し込む。
- `useStableId`: React再レンダーをまたいで同じsymbol IDを保つ。
- `useSdfSceneNodeTarget`: 現在のノード登録先をContextまたはSceneStoreから取得する。
- `class SdfGroupRegistry`: group/modifier内の子ノードを集約して親へ通知するregistry。
- `createSdfData`: data0-2をSdfData tupleへまとめる。
- `toHalfSize`: boxのfull size propsをSDF用の半径ベクトルへ変換する。
- `createSphereBounds`: sphere用bounding sphereを作る。
- `createBoxBounds`: box用bounding sphereを作る。
- `createCylinderBounds`: cylinder用bounding sphereを作る。
- `createTorusBounds`: torus用bounding sphereを作る。
- `createEllipsoidBounds`: ellipsoid用bounding sphereを作る。
- `createFunctionBounds`: custom SDF用boundsをpropsまたはdata0から作る。
- `createGroupBounds`: boolean opと子boundsからgroup boundsを作る。
- `mergeBoundingSpheres`: 2つのbounding sphereを包含するsphereを作る。
- `inflateBounds`: bounds半径をsmoothness分だけ膨らませる。
- `createTransformedGroupBounds`: groupのposition/rotationをboundsへ反映する。
- `rotateVec3ByQuaternion`: Vec3をQuaternionで回転する。
- `createModifierBounds`: modifier用boundsを子boundsまたは明示propsから作る。
- `resolveSdfModifierFunctions`: presetと直接指定からpre/post modifier WGSLを解決する。
- `type SdfModifierPresetFunctions`: presetが提供するpre/post modifier WGSLの入れ物。
- `resolveSdfModifierPreset`: 組み込みmodifier presetをWGSL bodyへ変換する。
- `subtractVec3`: Vec3の差を返す。
- `lengthVec3`: Vec3の長さを返す。
- `normalizeRadii`: ellipsoid radiiを安全な正値へ正規化する。

## src/nexusgpu/sdfKinds.ts

- `SDF_PRIMITIVE_KIND_IDS`: built-in primitive名とGPU側kind IDの対応表。
- `CUSTOM_SDF_PRIMITIVE_KIND_START`: custom SDFへ割り当てるkind IDの開始値。
- `SDF_OPERATION_KIND_IDS`: GPU命令列用のgroup begin/end ID。
- `SDF_BOOLEAN_OPERATION_IDS`: boolean演算名と数値IDの対応表。
- `type BuiltinSdfPrimitiveKind`: built-in primitive名のunion型。
- `type SdfPrimitiveKind`: built-in primitiveまたはcustom `function` を表すprimitive種別。

## src/nexusgpu/sdfShader.ts

- `MAX_SDF_OBJECTS`: Storage Bufferへ載せるSDF object最大数。
- `sdfShader`: 既定の最大object数で組み立てたWGSL shader全体。

## src/nexusgpu/types.ts

- `type Vec3`: 3次元ベクトル。座標、色、サイズで共通利用する。
- `type Vec4`: 4次元ベクトル。GPUのvec4境界に揃えたSDF拡張データで使う。
- `type SdfData`: SDF primitiveごとのdata0/data1/data2 tuple。
- `type SdfBoundingSphere`: 枝刈りやbounds指定に使う保守的なbounding sphere。
- `type SdfBooleanOperation`: SDFノード同士のboolean合成演算。
- `type Quaternion`: 回転を `[x, y, z, w]` で表すQuaternion。
- `type NexusCamera`: SDFシーンを眺めるcamera props。
- `type NexusLighting`: シーン全体の平行光源設定。
- `type NexusMaterialPreset`: built-in material名のunion型。
- `type NexusMaterialRef`: built-in material名またはcustom WGSL material定義。
- `type NexusTextureCrossOrigin`: texture image読み込み時のcrossOrigin指定。
- `type NexusTextureSource`: texture URLまたはsampler設定付きtexture source。
- `type NexusBackground`: 未ヒット時に表示する上下2色の背景設定。
- `type NexusRenderSettings`: max steps、解像度、shadowなどの描画品質設定。
- `type NexusCanvasPixelSize`: WebGPU backing storeの実ピクセルサイズ。
- `type NexusRenderStats`: NexusCanvasからUIへ返す描画統計。
- `type NexusFrameState`: NexusCanvas frame loopから渡される時刻情報。
- `type NexusFrameCallback`: `useFrame` で毎フレーム呼ばれるcallback。
- `type SdfPrimitiveProps`: SDF primitive共通のReact props。
- `type SdfSphereProps`: sphere primitive用props。
- `type SdfBoxProps`: box primitive用props。
- `type SdfCylinderProps`: cylinder primitive用props。
- `type SdfTorusProps`: torus primitive用props。
- `type SdfEllipsoidProps`: ellipsoid primitive用props。
- `type SdfFunctionProps`: custom WGSL SDF primitive用props。
- `type SdfGroupProps`: SdfGroupコンポーネント用props。
- `type SdfModifierPreset`: built-in modifier preset名のunion型。
- `type SdfModifierProps`: SdfModifierコンポーネント用props。
- `type NexusCanvasProps`: NexusCanvasが受け取る公開props。
- `type SdfNode`: SceneStoreが保持しGPUへアップロードする正規化済みprimitiveデータ。
- `type SdfPrimitiveSceneNode`: scene tree内のprimitive node。
- `type SdfGroupSceneNode`: scene tree内のgroup node。
- `type SdfModifierSceneNode`: scene tree内のmodifier node。
- `type SdfSceneNode`: primitive/group/modifier nodeのunion型。
- `type SceneSnapshot`: SceneStoreからrendererへ渡す一貫したシーン状態。

## src/nexusgpu/useOrbitCameraControls.ts

- `type OrbitCameraState`: orbit操作中のtarget、radius、yaw、pitchなどの内部状態。
- `type OrbitCameraControlsOptions`: orbit controls hookへ渡すcanvas、camera、store設定。
- `MIN_POLAR_ANGLE`: orbit cameraの最小pitch。
- `MAX_POLAR_ANGLE`: orbit cameraの最大pitch。
- `ORBIT_ROTATE_SPEED`: pointer移動量からyaw/pitchへ変換する係数。
- `ORBIT_ZOOM_SPEED`: wheel deltaからzoom倍率へ変換する係数。
- `useOrbitCameraControls`: pointer drag、wheel、pinchをcamera更新へ変換するReact hook。
- `resolveCamera`: camera propsへ既定値を補う。
- `getPointerDistance`: 2本指pointer間の距離を返す。
- `createOrbitCameraState`: camera位置からorbit内部状態を作る。
- `createCameraFromOrbitState`: orbit内部状態からcamera propsを復元する。

## src/nexusgpu/renderer/customWgslFunctions.ts

- `type CustomSdfFunctionCallSpec`: custom SDF関数のrenderer管理名、戻り値種別、引数対応を表す。
- `type CustomSdfFunctionNameMap`: SDF関数sourceからcall specを引くmap。
- `type CustomSdfModifierFunctionCallSpec`: custom modifier関数のrenderer管理名と戻り値種別を表す。
- `type CustomSdfModifierFunctionNameMap`: modifier keyからcall specを引くmap。
- `type SdfModifierFunctionSource`: pre/post種別、key、sourceを持つmodifier WGSL情報。
- `unique`: 出現順を保ったまま文字列配列の重複を取り除く。
- `uniqueModifierFunctionSources`: scene tree内のmodifier WGSLをkey単位で重複排除する。
- `collectSdfFunctionSources`: scene tree内のSdfFunction WGSLソースを集める。
- `collectSdfModifierFunctionSources`: scene tree内のmodifier pre/post WGSLソースを集める。
- `createSdfModifierFunctionKey`: pre/post種別とsourceから一意keyを作る。
- `createCustomSdfFunctionSource`: SdfFunction入力をrenderer管理名のWGSL関数へ正規化する。
- `createCustomSdfModifierFunctionSource`: SdfModifier入力をpre/post固定シグネチャのWGSL関数へ正規化する。
- `parseWgslFunctionDeclaration`: WGSL関数宣言から関数名、引数数、戻り値型を抽出する。

## src/nexusgpu/renderer/materialShaderCompiler.ts

- `type MaterialShaderPlan`: material shader文字列、signature、custom material ID表をまとめた計画。
- `type CustomMaterial`: custom materialのkey、source、割り当てID。
- `DEFAULT_MATERIAL_ID`: default materialのID。
- `NORMAL_MATERIAL_ID`: normal可視化materialのID。
- `PBR_MATERIAL_ID`: PBR materialのID。
- `TEXTURE0_COLOR_MATERIAL_ID`: texture0 color materialのID。
- `TEXTURE0_MATCAP_MATERIAL_ID`: texture0 matcap materialのID。
- `CUSTOM_MATERIAL_ID_START`: custom material IDの開始値。
- `createMaterialShaderPlan`: scene treeからmaterial shader断片、signature、custom ID表を作る。
- `getBuiltinMaterialId`: built-in material名を固定IDへ変換する。
- `getCustomMaterialKey`: custom materialの安定keyを返す。
- `collectCustomMaterials`: scene tree内のcustom materialを集める。
- `collectCustomMaterialsFromNode`: 1つのscene node以下からcustom materialを再帰収集する。
- `addCustomMaterial`: nodeのcustom material WGSLをmapへ追加する。
- `createMaterialShader`: built-in/custom materialをdispatchするWGSLを生成する。
- `renameMaterialFunction`: custom material関数名をrenderer管理名へ差し替える。
- `WGSL fn shadeMaterialById`: material IDに応じてmaterial関数を選ぶ。
- `WGSL fn shadeMaterial`: RaymarchHitからMaterialInputを作り、最終色を計算する。

## src/nexusgpu/renderer/sceneBuffers.ts

- `type SdfRecord`: GPU bufferへ詰める1 object分の数値配列。
- `type GetSdfKindId`: SdfNodeからGPU側kind IDを返すcallback。
- `type GetMaterialId`: primitive/group nodeからmaterial IDを返すcallback。
- `OBJECT_STRIDE_FLOATS`: 1 SdfObject recordあたりのf32数。
- `OBJECT_BUFFER_SIZE`: SDF object storage bufferのバイトサイズ。
- `compileSceneObjectRecords`: scene treeをStorage Buffer用record列へ変換する。
- `countSceneObjectRecords`: scene tree展開後のrecord数を数える。
- `appendSceneObjectRecord`: nodeを深さ優先でrecord配列へ追加する。
- `createPrimitiveRecord`: primitive SdfNodeを固定長f32 recordへ詰める。
- `createModifierRecord`: modifier dataを補助recordへ詰める。
- `createGroupRecord`: group transform/smoothness/materialを補助recordへ詰める。

## src/nexusgpu/renderer/scenePipelineCompiler.ts

- `type SceneShaderPlan`: pipeline再生成に必要なshader断片、signature、ID表、profileをまとめた計画。
- `createSceneShaderPlan`: SceneSnapshotからpipeline再生成に必要な可変shader部品を作る。
- `getMaterialIdFromPlan`: material refをplan内のbuilt-in/custom material IDへ変換する。

## src/nexusgpu/renderer/sceneShaderCompiler.ts

- `type ExpandedSceneCompileState`: object indexと一時変数indexを持つscene展開状態。
- `type SceneCompileMode`: 距離のみ評価か詳細評価かを表すcompile mode。
- `type ExpandedSceneCompileResult`: 生成WGSL、hit変数名、smoothness式をまとめた結果。
- `type SceneCompileProfile`: scene shader展開のprimitive/group/modifier/gradient統計。
- `createExpandedMapSceneBody`: scene treeを `mapSceneDistance` / `mapSceneEval` WGSL bodyへ展開する。
- `createEmptyMapSceneBody`: scene未設定時の空 `mapScene*` WGSL bodyを作る。
- `createSceneCompileProfile`: scene shader展開の統計情報を作る。
- `accumulateSceneCompileProfile`: 1 node以下のprofile値を再帰的に加算する。
- `compileExpandedSceneNode`: 1つのscene nodeを評価するWGSL片へ再帰コンパイルする。
- `compileExpandedModifierNode`: modifier nodeのpre/post評価をWGSL片へコンパイルする。
- `createImplicitUnionGroup`: modifier配下の複数childrenを暗黙union groupに包む。
- `createLocalPointExpression`: primitive用local point変換式を作る。
- `createGroupLocalPointExpression`: group用local point変換式を作る。
- `createPrimitiveHitExpression`: built-in/custom primitiveのhit評価式を作る。
- `createSceneTopologySignature`: pipeline再生成判定用にscene tree形状を文字列化する。
- `createSceneNodeTopologySignature`: 1 nodeをtopology signature断片へ変換する。
- `nextTempName`: 生成WGSL内の一時変数名を発行する。
- `nextGroupMaterialHitName`: material override用一時変数名を必要時だけ発行する。
- `nextGroupTransformHitName`: group gradient回転用一時変数名を必要時だけ発行する。
- `createGroupTransformLines`: group回転後のgradient補正WGSL行を作る。
- `createGroupMaterialOverrideLines`: group material override用WGSL行を作る。
- `formatWgslFloat`: JS numberをWGSL f32 literalへ整形する。
- `formatSdfDataArgs`: SdfObjectのdata0-2引数列を作る。

## src/nexusgpu/renderer/sceneTextures.ts

- `type NormalizedTextureSource`: texture sourceとsampler設定を内部形式へ揃えた型。
- `type TextureLoadResult`: 非同期読み込み後のtexture slot indexとGPUTexture。
- `MAX_SCENE_TEXTURES`: shaderへbindするscene texture最大数。
- `SCENE_SAMPLER_BINDING_START`: sampler binding番号の開始位置。
- `SCENE_TEXTURE_BINDING_START`: texture binding番号の開始位置。
- `class SceneTextureBindings`: scene texture/sampler slotを管理し、bind group entriesを作る。
  - `setTextures`: texture sourceを正規化し、非同期load後にslotを差し替える。
  - `createBindGroupEntries`: sampler/textureのbind group entriesを返す。
  - `destroy`: load世代を無効化し、GPUTextureを破棄する。
- `normalizeTextureSource`: stringまたはobject指定のtexture sourceを内部形式へ正規化する。
- `loadTexture`: HTMLImageElementからGPUTextureを作る。
- `createFallbackTexture`: 未設定/読み込み中用の1x1白textureを作る。

## src/nexusgpu/shaders/fragmentShader.ts

- `fragmentShader`: pixelごとのray生成とshade処理を含むWGSL fragment shader。
- `WGSL fn fragmentMain`: screen座標からrayを作り、raymarch結果または背景色を返す。

## src/nexusgpu/shaders/index.ts

- `type CustomSdfFunctionShader`: shaderへ連結するcustom SDF/modifier関数のID、関数名、source。
- `shaderSectionsBeforeMapping`: scene mappingより前に連結する固定shaderセクション。
- `assembleSdfShader`: shader constants、layout、SDF関数、custom関数、scene mapping、material、entry pointを連結してWGSLを作る。

## src/nexusgpu/shaders/lightingShader.ts

- `lightingShader`: 法線推定と背景色計算のWGSL。
- `WGSL fn estimateNormal`: pointのSceneEvalから法線を推定する。
- `WGSL fn estimateNormalFromHit`: RaymarchHitのgradInfoから法線を推定する。
- `WGSL fn estimateNormalFromGradInfo`: 解析的gradientがあれば使い、なければ有限差分で法線を近似する。
- `WGSL fn background`: 未ヒット時の上下グラデーション背景色を返す。

## src/nexusgpu/shaders/raymarchShader.ts

- `raymarchShader`: SDF距離場をraymarchするWGSL。
- `WGSL fn raymarch`: rayを進めてsurface hitを探し、RaymarchHitを返す。

## src/nexusgpu/shaders/sceneMappingShader.ts

- `createSceneMappingShader`: scene評価補助関数とmapScene bodyを結合したWGSLを作る。
- `createEmptyMapSceneBody`: 空シーン用の `mapScene*` WGSLを作る。
- `sceneMappingShader`: 空シーンbodyで生成した既定scene mapping WGSL。
- `WGSL fn sceneHitFromEval`: SceneEvalを互換用SceneHitへ変換する。
- `WGSL fn sceneHitFromDistance`: SceneDistanceとlocalPointからSceneHitを作る。
- `WGSL fn sceneDistance`: 距離とsmoothnessからSceneDistanceを作る。
- `WGSL fn sceneDistanceFromHit`: SceneHitから距離評価だけを取り出す。
- `WGSL fn sceneDistanceFromEval`: SceneEvalから距離評価だけを取り出す。
- `WGSL fn sceneEvalFromHit`: SceneHitをmaterialなしのSceneEvalへ変換する。
- `WGSL fn sceneEvalFromHitWithMaterial`: SceneHitにmaterial情報を付けてSceneEvalへ変換する。
- `WGSL fn sceneEvalWithGrad`: 解析的gradientありのSceneEvalを作る。
- `WGSL fn sceneEvalNoGrad`: gradientなしのSceneEvalを作る。
- `WGSL fn invalidateSceneEvalGrad`: SceneEvalのgradient信頼フラグを無効化する。
- `WGSL fn rotateSceneEvalGrad`: SceneEvalのgradientをQuaternionで回転する。
- `WGSL fn sceneEvalWithMaterial`: SceneEvalのmaterial情報を差し替える。
- `WGSL fn chooseMaterialId`: smooth blend重みに応じてmaterial IDを選ぶ。
- `WGSL fn chooseMaterialUniform`: smooth blend重みに応じてmaterialUniformを選ぶ。
- `WGSL fn unionDistance`: 2つの距離評価を和集合として合成する。
- `WGSL fn intersectDistance`: 2つの距離評価を積集合として合成する。
- `WGSL fn subtractDistance`: 距離評価aからbを差し引く。
- `WGSL fn notDistance`: 距離評価の内外を反転する。
- `WGSL fn unionHit`: 2つの詳細評価を和集合として合成する。
- `WGSL fn intersectHit`: 2つの詳細評価を積集合として合成する。
- `WGSL fn subtractHit`: 詳細評価aからbを差し引く。
- `WGSL fn notHit`: 詳細評価の内外とgradient方向を反転する。
- `WGSL fn mapSceneDistance`: 空シーン用に遠方距離を返す。
- `WGSL fn mapSceneEval`: 空シーン用の既定詳細評価を返す。
- `WGSL fn mapScene`: SceneEvalをSceneHitへ変換して返す互換関数。

## src/nexusgpu/shaders/sdfPrimitivesShader.ts

- `sdfPrimitivesShader`: built-in SDF、quaternion、noise、color helperのinclude集。

## src/nexusgpu/shaders/shaderConstants.ts

- `createShaderConstants`: 最大object数などのWGSL定数セクションを生成する。
- `WGSL const MAX_OBJECTS`: shader内で参照するSDF object最大数。
- `WGSL const MAX_STEPS_CAP`: raymarch loopの上限step数。

## src/nexusgpu/shaders/shaderLayout.ts

- `shaderLayout`: CameraUniform、SdfObject、SceneHit、SceneDistance、SceneEval、RaymarchHit、MaterialInputとbind group宣言を含むWGSL layout。

## src/nexusgpu/shaders/shaderLibrary.ts

- `type ShaderChunkLibrary`: include chunk名からWGSL sourceへ引く辞書型。
- `INCLUDE_PATTERN`: `#include <chunk>` 行を検出する正規表現。
- `shaderChunkLibrary`: WGSL include chunk名とsourceの対応表。
- `resolveShaderIncludes`: shader source内のincludeを再帰展開し、循環と未知chunkを検出する。
- `WGSL fn sdSphere`: 球のSDF距離を返す。
- `WGSL fn sdSphereGrad`: 球の解析的gradientを返す。
- `WGSL fn sdBox`: 軸平行boxのSDF距離を返す。
- `WGSL fn sdBoxGrad`: boxの解析的gradientを返す。
- `WGSL fn sdCylinder`: Y軸円柱のSDF距離を返す。
- `WGSL fn sdCylinderGrad`: 円柱の解析的gradientを返す。
- `WGSL fn sdTorus`: XZ平面torusのSDF距離を返す。
- `WGSL fn sdTorusGrad`: torusの解析的gradientを返す。
- `WGSL fn sdEllipsoid`: ellipsoidの近似SDF距離を返す。
- `WGSL fn sdEllipsoidGrad`: ellipsoidの解析的gradientを返す。
- `WGSL fn smoothMin`: 2つの距離を滑らかに結合する。
- `WGSL fn rotateByQuaternion`: Vec3をQuaternionで回転する。
- `WGSL fn simplexMod289Vec3`: 3D simplex noise用mod補助。
- `WGSL fn simplexMod289Vec4`: 4D simplex noise用mod補助。
- `WGSL fn simplexPermute`: simplex noise用permute補助。
- `WGSL fn simplexTaylorInvSqrt`: simplex noise用逆平方根近似。
- `WGSL fn simplexGrad4`: 4D simplex noise用gradientを作る。
- `WGSL fn simplexNoise3d`: 3D simplex noise値を返す。
- `WGSL fn simplexNoise4d`: 4D simplex noise値を返す。
- `WGSL fn simplexNoise`: 3D simplex noiseの別名。
- `WGSL fn materialDefault`: 既定のdiffuse/ambient/shadow material色を返す。
- `WGSL fn materialNormal`: normalをRGBとして可視化する。
- `WGSL fn materialPbrFresnelSchlick`: PBR Fresnel項を計算する。
- `WGSL fn materialPbrDistributionGgx`: GGX法線分布項を計算する。
- `WGSL fn materialPbrGeometrySchlickGgx`: Schlick-GGX geometry項を計算する。
- `WGSL fn materialPbrGeometrySmith`: Smith geometry項を計算する。
- `WGSL fn materialPbr`: 軽量Cook-Torrance風material色を返す。
- `WGSL fn materialTexture0Color`: texture0をlocalPoint.xzでsampleして色に使う。
- `WGSL fn materialTexture0Matcap`: view-space normalからmatcap textureをsampleする。
- `WGSL fn hsl2rgb`: HSL色をRGBへ変換する。

## src/nexusgpu/shaders/vertexShader.ts

- `vertexShader`: fullscreen triangleを描くWGSL vertex shader。
- `WGSL fn vertexMain`: vertex indexからfullscreen triangleのclip-space座標を返す。
