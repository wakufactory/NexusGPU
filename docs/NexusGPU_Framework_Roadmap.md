# WebGPU専用フレームワーク「NexusGPU」開発ロードマップ

Three.jsが「WebGLの資産をWebGPUに橋渡しする」ものであるのに対し、NexusGPUは**「GPUの演算能力（Compute）を直接記述し、3D表現を再定義する」**ための次世代フレームワークです。

## 1. フレームワーク概要

### コアコンセプト
- **Hybrid Rendering**: 「3DGS（実写・環境）」と「SDF（数式・硬質オブジェクト）」を基本プリミティブとし、ポリゴンを補助的な存在へ。
- **GPU Driven Logic**: シーングラフ走査、カリング、物理演算のすべてをCompute Shaderで実行し、CPU負荷を最小化。
- **React-Native DX**: Reactの宣言的UIで記述した「状態」を、直接GPUのStorage Buffer（SoA構造）へシンクロさせる。

---

## 2. 開発ステップ（フェーズ別）

### フェーズ1：最小構成の「React × WebGPU」レンダラー
まずはポリゴンを捨て、SDF（レイマーチング）を表示する基盤を構築します。
- **Reconcilerの実装**: `react-reconciler` を使い、ReactのPropsをGPUバッファに書き込む最小の仕組みを構築。
- **静的SDFレンダラ**: 数種類の基本形状（Sphere, Box）をレイマーチングで表示するFragment Shaderを実装。
- **目標**: Reactで `<SdfSphere radius={1} />` と書くだけで画面に完全な球体を描画。

### フェーズ2：Compute Shaderによる「GPU駆動」の導入
GPUの並列性能を最大限に活用し、大量のオブジェクトを扱えるようにします。
- **Uniform Bufferの自動管理**: Propsの変更を検知し、GPU側のバッファへ部分書き込みする最適化。
- **空間加速構造 (BVH) の自動構築**: レイマーチングの「空振り」を抑制するため、GPU上でBVHを構築。
- **目標**: 数千個のSDFオブジェクトが相互に干渉（Smooth Union等）しながら動くシーンを低負荷で実現。

### フェーズ3：3D Gaussian Splatting (3DGS) の統合
現実世界の複雑なテクスチャや空気感を取り込めるようにします。
- **GPU Radix Sortの実装**: Compute Shaderを用いた超高速なSplatソートエンジンの搭載。
- **Tiled Compositor**: Splatの半透明要素とSDFの硬質な深度をピクセル単位で正しく合成するハイブリッドパイプライン。
- **目標**: 実写スキャンされた背景と、SDFで生成された動的な物体が完璧に融合。

### フェーズ4：AI生成最適化とエコシステム
AIが3Dシーンをコードベースで生成しやすくするための整備を行います。
- **Schema / DSLの定義**: AIがコンポーネント構造を理解しやすいよう、厳格なTypeScript型定義とDSLを提供。
- **WebGPUデバッガー**: GPU内部のバッファやSDFの距離場を視覚化するツール。
- **目標**: 自然言語プロンプトから、物理演算を含む複雑な3DシーンのReactコードを出力・実行。

---

## 3. なぜ「SDF + 3DGS + React」なのか

1. **ピクセルパーフェクトな表現力**: SDFは数学的に滑らかであり、ズームしてもカクつきません。3DGSはポリゴンでは不可能な「実写の空気感」を再現します。
2. **AIとの相性**: 命令型の描画コードをAIに書かせるのは困難ですが、宣言的な「構造」と「数式」の組み合わせはAIが最も得意とする分野です。
3. **WebGPUネイティブ**: Three.jsの制約に縛られず、Render BundlesやCompute Shader、Storage Bufferを前提とした設計により、10倍以上のパフォーマンスを狙えます。
