# 2D CAD Webアプリ開発用 AI指示書

## 0. この指示書の目的

このドキュメントは、JavaScript / TypeScript 系の技術で、GitHub Pages 上に公開できる **2D CAD 機能付きWebアプリ** を開発するための AI コーディングエージェント向け指示書である。

AI開発エージェントは、本指示書を最上位仕様として扱い、曖昧な点がある場合は「建築の受圧面積を算定するための2DポリゴンCAD」という目的に沿って判断すること。

---

## 1. アプリの概要

### 1.1 目的

建築・構造・設計検討で利用する、2D平面上のポリゴン形状を作図・編集し、ブーリアン演算やナイフ分割を行ったうえで、面積を算定できるWebアプリを開発する。

主な用途は次のとおり。

- 受圧面積、投影面積、平面領域面積の算定
- 任意ポリゴンのCAD的な作図
- 頂点座標を数値入力で編集
- 複数ポリゴンの合成
- 円形・矩形・任意形状によるくり抜き
- ナイフ線による図形分割
- 面積の個別集計・選択集計・全体集計

### 1.2 公開形態

- GitHub Pages で公開する静的Webアプリとする。
- バックエンドサーバーは使わない。
- すべての作図、編集、幾何演算、保存処理はブラウザ上で完結させる。
- 保存は以下を基本とする。
  - `localStorage` または `IndexedDB` によるローカル保存
  - JSONファイルとしてエクスポート / インポート

---

## 2. 推奨技術スタック

### 2.1 基本構成

次の構成を第一候補とする。

- フロントエンド: React + TypeScript
- ビルドツール: Vite
- 描画: SVGベース
- 状態管理: Zustand または React Context + reducer
- 幾何演算: 専用アダプター層を作り、ライブラリ依存を閉じ込める
- テスト: Vitest
- E2Eテスト: Playwright もしくは Cypress

### 2.2 SVGを使う理由

このアプリは、CAD的な点・線・ポリゴン編集が中心であり、数百〜数千頂点規模の図形を精密に扱うことを想定する。初期実装では、CanvasよりもSVGを優先する。

SVGを優先する理由は次のとおり。

- 頂点ハンドル、辺、補助線、選択状態を表現しやすい。
- `viewBox` と変換行列でズーム・パンを実装しやすい。
- 図形単位でクリック・ホバー・選択イベントを扱いやすい。
- 後からSVGエクスポートに展開しやすい。

ただし、将来的に非常に大規模な図面を扱う場合は、Canvas/WebGLへの描画層差し替えを検討できるよう、モデルと描画を分離すること。

### 2.3 幾何演算ライブラリ候補

ブーリアン演算は自前実装ではなく、十分に実績のあるポリゴンクリッピングライブラリを利用する。

候補:

- `polygon-clipping`
  - union / difference / intersection / xor に対応するJavaScriptライブラリ。
  - MultiPolygonや穴あきポリゴンを扱いやすい。
- `clipper-lib` または Clipper 系ライブラリ
  - ポリゴンの union / intersection / difference / xor などに対応する。
  - 実装によっては整数座標スケーリングが必要になる。
- `martinez-polygon-clipping`
  - Martinez-Ruedaアルゴリズム系のポリゴンクリッピングライブラリ。

重要:

- アプリ全体から幾何演算ライブラリを直接呼ばないこと。
- `src/geometry/geometryEngine.ts` のようなアダプター層を作ること。
- 将来的にライブラリを差し替えられるようにすること。

---

## 3. 最重要機能要件

## 3.1 CAD作図機能

### 3.1.1 作図ツール

以下の作図ツールを実装する。

#### 選択ツール

- 図形をクリックして選択できる。
- Shiftクリックで複数選択できる。
- 矩形範囲選択を実装する。
- 選択図形はハイライト表示する。

#### パン・ズーム

- マウスホイールでズーム。
- スペースキー + ドラッグ、または専用パンツールで画面移動。
- ズーム時はマウス位置を中心に拡大縮小する。
- 「全体表示」ボタンを用意する。

#### ポリゴン作図ツール

- クリックで頂点を追加する。
- Enterキーで確定する。
- Escapeキーでキャンセルする。
- 始点付近をクリックすると閉じる。
- 3点未満では確定できない。
- 作図中は仮線を表示する。
- 自己交差が発生する場合は警告する。

#### 矩形ツール

- 2点指定で矩形を作成する。
- Shiftキー押下中は正方形に制約できる。
- 作成後は通常のポリゴンとして扱う。

#### 円ツール

- 中心点と半径で円を作図する。
- 円は内部的には多角形近似したポリゴンとして扱う。
- 初期分割数は64または96を目安とする。
- 設定で円近似の分割数を変更できるようにする。
- 円形くり抜き時も同じ形式で差分演算に渡す。

#### 補助線ツール 任意

- 水平線、垂直線、任意線を補助線として配置できる。
- 補助線は面積計算対象外とする。

---

## 3.2 頂点編集機能

### 3.2.1 頂点ハンドル

- 選択したポリゴンの頂点にハンドルを表示する。
- 頂点ハンドルをドラッグして座標移動できる。
- 複数頂点を選択して同時移動できる。
- 頂点を移動したら面積を即時再計算する。

### 3.2.2 座標数値編集

右側のプロパティパネルに、選択ポリゴンの頂点座標一覧を表示する。

表示例:

| No. | X | Y |
|---:|---:|---:|
| 1 | 0.000 | 0.000 |
| 2 | 1000.000 | 0.000 |
| 3 | 1000.000 | 500.000 |

要件:

- X, Y の値を数値入力で編集できる。
- Enterまたはフォーカスアウトで確定する。
- 無効な値は反映しない。
- 座標変更後、ポリゴンの自己交差・面積ゼロ・重複点を検査する。
- 編集により不正形状になる場合は警告を表示し、必要に応じて変更を取り消す。

### 3.2.3 頂点追加・削除

- 辺をクリックして頂点を追加できる。
- 頂点を選択してDeleteキーで削除できる。
- 外周リングは3点未満にできない。
- 穴リングも3点未満にできない。

---

## 3.3 スナップ・グリッド機能

### 3.3.1 グリッド

- 背景にグリッドを表示する。
- グリッド間隔は設定可能とする。
- ズーム倍率に応じてグリッド表示を調整する。

### 3.3.2 スナップ

最低限、以下のスナップを実装する。

- グリッドスナップ
- 既存頂点スナップ
- 辺上スナップ
- 中点スナップ
- 水平・垂直拘束 任意

スナップ中は、スナップ先を視覚的に表示する。

---

## 3.4 ブーリアン演算機能

### 3.4.1 対応する演算

以下の演算を実装する。

#### Union / 和集合

複数のポリゴンを選択し、重なり部分を統合して1つまたは複数のポリゴンにする。

例:

- 2つの矩形が重なっている場合、外周が統合された1つのポリゴンになる。
- 離れた複数領域の場合は MultiPolygon として扱い、必要に応じて複数の `PolygonEntity` に分割保存する。

#### Difference / 差分・くり抜き

選択した対象ポリゴンから、別のポリゴンまたは円形を差し引く。

例:

- 大きな矩形から円を差し引き、円形の穴を作る。
- 大きなポリゴンから小さな矩形をくり抜く。
- 複数のカッター図形をまとめて差し引く。

#### Intersection / 共通部分 任意

必須ではないが、実装しておくと後の拡張に有用。

#### XOR 任意

必須ではないが、幾何演算エンジンでは関数定義だけ用意してもよい。

### 3.4.2 UI仕様

ツールバーに以下のボタンを設ける。

- 結合 Union
- くり抜き Difference
- 交差 Intersection 任意
- 排他的論理和 XOR 任意

Differenceの操作方式:

1. 対象ポリゴンを選択する。
2. カッター図形を追加選択する、またはくり抜き専用ツールで円・矩形を描く。
3. Differenceを実行する。
4. 対象ポリゴンからカッター形状を差し引いた結果を表示する。
5. カッター図形を残すか削除するかをユーザーが選べるようにする。初期設定は「削除」。

### 3.4.3 幾何演算エンジンAPI

`src/geometry/geometryEngine.ts` に以下のようなAPIを用意する。

```ts
export type Point = { x: number; y: number };
export type Ring = Point[];

export type PolygonGeometry = {
  outer: Ring;
  holes: Ring[];
};

export type MultiPolygonGeometry = PolygonGeometry[];

export type BooleanOperation = 'union' | 'difference' | 'intersection' | 'xor';

export interface GeometryEngine {
  union(input: MultiPolygonGeometry): MultiPolygonGeometry;
  difference(subject: MultiPolygonGeometry, cutters: MultiPolygonGeometry): MultiPolygonGeometry;
  intersection(input: MultiPolygonGeometry): MultiPolygonGeometry;
  xor(input: MultiPolygonGeometry): MultiPolygonGeometry;
  area(input: MultiPolygonGeometry): number;
  normalize(input: MultiPolygonGeometry): MultiPolygonGeometry;
  validate(input: MultiPolygonGeometry): GeometryValidationResult;
}
```

### 3.4.4 正規化ルール

ブーリアン演算後は必ず以下を行う。

- 重複頂点を削除する。
- ほぼ同一点をEPSで丸める。
- 面積がゼロに近いリングを削除する。
- 外周リングと穴リングを整理する。
- 外周は反時計回り、穴は時計回りに統一する。
- MultiPolygonの結果は、アプリ内では複数の `PolygonEntity` として保存してもよい。

---

## 3.5 ナイフ分割機能

### 3.5.1 概要

ナイフツールは、ユーザーが引いた線または折れ線によって、選択ポリゴンを複数のポリゴンに分割する機能である。

ユーザー操作:

1. 分割したいポリゴンを選択する。
2. ナイフツールを選ぶ。
3. ポリゴンを横切る線または折れ線を描く。
4. Enterで確定する。
5. ポリゴンが分割され、複数のポリゴンエンティティとして保存される。

### 3.5.2 MVPで必須の仕様

初期実装で必ず対応するケース:

- 1つの単純ポリゴンを1本の直線で分割する。
- ナイフ線が外周境界とちょうど2回交差する場合、2つのポリゴンに分割する。
- 分割後の各ポリゴンの面積合計は、分割前の面積と一致する。
- ナイフ線がポリゴンを横切っていない場合は、何も変更せず警告を出す。

### 3.5.3 推奨アルゴリズム

#### MVPアルゴリズム: 2交点直線分割

1. 選択ポリゴンの外周リングを取得する。
2. ナイフ線分と外周リング各辺の交点を計算する。
3. 交点が2つでない場合は、MVPでは分割不可として警告する。
4. 交点を外周リングの該当辺に挿入する。
5. 外周リング上で、交点Aから交点Bへ向かう2通りの経路を作る。
6. 経路1 + ナイフ線B→A でポリゴン1を作る。
7. 経路2 + ナイフ線A→B でポリゴン2を作る。
8. 各ポリゴンを正規化し、面積がEPSより大きいものだけ採用する。
9. 元ポリゴンを削除し、分割後ポリゴンを追加する。
10. Undo履歴に操作を記録する。

#### 拡張アルゴリズム: 折れ線・複数交点対応

将来的には以下の方法で対応する。

1. ポリゴン境界、穴境界、ナイフ折れ線をすべて線分集合として扱う。
2. 全交点を求めて線分を分割する。
3. ポリゴン内部にあるナイフ線分だけを残す。
4. 境界線分とナイフ線分から平面グラフを構築する。
5. グラフの閉路をトレースして面を抽出する。
6. 抽出した面の代表点が元ポリゴン内部にあるものだけ採用する。
7. 面積EPS以下の面を除去する。

### 3.5.4 ナイフ機能の受け入れ条件

以下のテストケースを満たすこと。

- 1000 x 1000 の正方形を対角線で分割すると、同面積の三角形2つになる。
- 1000 x 1000 の正方形を中央の垂直線で分割すると、500 x 1000 の矩形2つになる。
- L字ポリゴンを有効な直線で分割すると、面積合計が元面積と一致する。
- ナイフ線がポリゴン内部で終わる場合は、分割しない。
- ナイフ線がポリゴンに接するだけの場合は、分割しない。

---

## 3.6 面積算定機能

### 3.6.1 面積計算方法

面積はShoelace formulaで計算する。

ポリゴンの外周面積から穴の面積を差し引く。

```ts
function signedRingArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function polygonArea(poly: PolygonGeometry): number {
  const outerArea = Math.abs(signedRingArea(poly.outer));
  const holesArea = poly.holes.reduce((acc, hole) => acc + Math.abs(signedRingArea(hole)), 0);
  return outerArea - holesArea;
}
```

### 3.6.2 単位

初期設定:

- 内部座標単位: mm
- 表示面積: m²
- 面積変換: `m² = mm² / 1,000,000`

設定画面で次を変更可能にする。

- 座標単位: mm / cm / m
- 表示小数桁数
- グリッド間隔
- 円近似分割数

### 3.6.3 面積表示

以下を表示する。

- 選択図形の面積
- 選択複数図形の合計面積
- レイヤーごとの面積 任意
- 全図形の合計面積
- 穴を差し引いた実面積

プロパティパネル例:

```text
選択図形: Polygon-001
外周面積: 12.500 m²
穴面積: 1.250 m²
実面積: 11.250 m²
頂点数: 8
穴数: 1
```

### 3.6.4 面積検証

以下の単体テストを必ず作成する。

- 1000mm x 1000mm の矩形 = 1.000 m²
- 2000mm x 500mm の矩形 = 1.000 m²
- 外周 1000mm x 1000mm、穴 500mm x 500mm = 0.750 m²
- 正方形2つのUnion後の面積が期待値と一致
- 円近似ポリゴンの面積が `πr²` に十分近い

---

## 4. データモデル

### 4.1 Project

```ts
export type Project = {
  id: string;
  name: string;
  version: string;
  unit: 'mm' | 'cm' | 'm';
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  layers: Layer[];
  entities: Entity[];
};
```

### 4.2 ProjectSettings

```ts
export type ProjectSettings = {
  gridSize: number;
  snapEnabled: boolean;
  snapToGrid: boolean;
  snapToVertex: boolean;
  snapToEdge: boolean;
  snapTolerancePx: number;
  areaPrecision: number;
  coordinatePrecision: number;
  circleSegments: number;
};
```

### 4.3 Layer

```ts
export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
};
```

### 4.4 Entity

```ts
export type Entity = PolygonEntity | GuideLineEntity;
```

### 4.5 PolygonEntity

```ts
export type PolygonEntity = {
  id: string;
  type: 'polygon';
  name: string;
  layerId: string;
  geometry: PolygonGeometry;
  style: EntityStyle;
  locked: boolean;
  visible: boolean;
  metadata?: {
    sourceShape?: 'polygon' | 'rectangle' | 'circle' | 'boolean-result' | 'knife-result';
    createdByOperation?: 'draw' | 'union' | 'difference' | 'knife';
  };
};
```

### 4.6 PolygonGeometry

```ts
export type Point = {
  x: number;
  y: number;
};

export type Ring = Point[];

export type PolygonGeometry = {
  outer: Ring;
  holes: Ring[];
};
```

ルール:

- `outer` は閉じ点を重複保存しない。
- 例えば四角形は4点で保存する。最後に始点を繰り返さない。
- 表示や演算時に必要なら一時的に閉じ点を追加する。
- 外周は反時計回り、穴は時計回りに正規化する。

### 4.7 GuideLineEntity 任意

```ts
export type GuideLineEntity = {
  id: string;
  type: 'guide-line';
  layerId: string;
  points: Point[];
  locked: boolean;
  visible: boolean;
};
```

---

## 5. 座標系・表示変換

### 5.1 ワールド座標

- データモデル上の座標はCAD的なワールド座標とする。
- Xは右方向を正、Yは上方向を正とする。
- SVG画面はYが下方向を正なので、描画時に変換する。

### 5.2 変換関数

以下の関数を用意する。

```ts
type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function worldToScreen(p: Point, view: ViewTransform): Point;
function screenToWorld(p: Point, view: ViewTransform): Point;
```

### 5.3 精度

- 幾何演算では `EPS = 1e-9` 程度を基準とする。
- UI表示では小数桁数を設定可能にする。
- ブーリアン演算前後で過度に丸めすぎないこと。
- 表示丸めと内部値丸めを分けること。

---

## 6. 画面構成

## 6.1 基本レイアウト

```text
+--------------------------------------------------------------+
| Header / Project name / Undo / Redo / Export / Import        |
+-------------------+------------------------------------------+
| Toolbar           | Drawing Canvas                           |
| - Select          |                                          |
| - Pan             |                                          |
| - Polygon         |                                          |
| - Rect            |                                          |
| - Circle          |                                          |
| - Knife           |                                          |
| - Union           |                                          |
| - Difference      |                                          |
+-------------------+-------------------------+----------------+
| Status Bar: cursor x,y / unit / snap / area | Property Panel |
+---------------------------------------------+----------------+
```

### 6.2 ヘッダー

- アプリ名
- プロジェクト名
- 新規
- 開く
- 保存
- エクスポート
- インポート
- Undo
- Redo
- GitHub Pages上で動作していることを考慮し、ファイル保存はダウンロード形式とする。

### 6.3 ツールバー

最低限のボタン:

- 選択
- パン
- ポリゴン
- 矩形
- 円
- ナイフ
- 結合
- くり抜き
- 頂点編集
- 全体表示
- グリッドON/OFF
- スナップON/OFF

### 6.4 プロパティパネル

選択状態に応じて表示内容を変える。

#### 図形未選択

- 全体面積
- 図形数
- レイヤー一覧
- プロジェクト設定

#### 1図形選択

- 図形名
- レイヤー
- 面積
- 外周面積
- 穴面積
- 頂点数
- 頂点座標テーブル
- 削除ボタン

#### 複数図形選択

- 選択図形数
- 合計面積
- Unionボタン
- Differenceボタン
- 削除ボタン

### 6.5 ステータスバー

- カーソル座標
- 現在の単位
- スナップ状態
- 作図中の操作ガイド
- 選択面積

例:

```text
X: 1200.000 mm, Y: 450.000 mm | Snap: Grid + Vertex | Tool: Polygon | Enterで確定 / Escで取消
```

---

## 7. 操作仕様

## 7.1 キーボードショートカット

| 操作 | キー |
|---|---|
| 選択ツール | V |
| パンツール | H |
| ポリゴン | P |
| 矩形 | R |
| 円 | C |
| ナイフ | K |
| 確定 | Enter |
| キャンセル | Escape |
| 削除 | Delete / Backspace |
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z |
| 全体表示 | F |
| グリッド切替 | G |
| スナップ切替 | S |

## 7.2 Undo / Redo

必ずUndo / Redoを実装する。

対象操作:

- 図形作成
- 図形削除
- 頂点移動
- 頂点追加
- 頂点削除
- Union
- Difference
- Knife split
- インポート

実装方針:

- 初期実装ではプロジェクト状態のスナップショット方式でよい。
- 大規模化した場合はCommand patternに移行する。
- Undo履歴数は初期値50件程度とする。

---

## 8. 保存・読み込み・出力

## 8.1 ローカル保存

- プロジェクト状態を `localStorage` または `IndexedDB` に保存する。
- 自動保存を実装する。
- 保存失敗時はエラーメッセージを表示する。

## 8.2 JSONエクスポート

- プロジェクト全体をJSONファイルとしてダウンロードできる。
- ファイル名例: `cad-project-YYYYMMDD-HHMM.json`

## 8.3 JSONインポート

- JSONファイルを読み込み、プロジェクトを復元できる。
- バージョン情報を確認する。
- 不正なJSONや未知の形式は警告する。

## 8.4 SVGエクスポート 任意

- 作図内容をSVGとして出力できる。
- 面積表示や補助線を含めるかどうかを選択可能にする。

## 8.5 CSV出力 任意

面積一覧をCSVで出力できる。

列例:

```csv
id,name,layer,area_m2,outer_area_m2,hole_area_m2,vertex_count,hole_count
```

---

## 9. 実装ディレクトリ構成

以下の構成を推奨する。

```text
src/
  app/
    App.tsx
    appStore.ts
    commands.ts
  components/
    layout/
      Header.tsx
      Toolbar.tsx
      StatusBar.tsx
      PropertyPanel.tsx
    cad/
      CadViewport.tsx
      SvgScene.tsx
      Grid.tsx
      SelectionOverlay.tsx
      VertexHandles.tsx
      ToolPreview.tsx
  geometry/
    types.ts
    geometryEngine.ts
    polygonClippingEngine.ts
    area.ts
    normalize.ts
    intersections.ts
    knifeSplit.ts
    snap.ts
    validation.ts
  tools/
    ToolController.ts
    selectTool.ts
    panTool.ts
    polygonTool.ts
    rectangleTool.ts
    circleTool.ts
    vertexEditTool.ts
    knifeTool.ts
  persistence/
    projectSerializer.ts
    localProjectStore.ts
    importExport.ts
  styles/
    global.css
  tests/
    area.test.ts
    boolean.test.ts
    knifeSplit.test.ts
    validation.test.ts
```

---

## 10. 幾何関連の実装詳細

## 10.1 Ringの正規化

`normalizeRing(ring)` を実装する。

処理:

- 連続する同一点を削除する。
- 最後の点が最初の点と同じ場合、最後の点を削除する。
- 頂点数が3未満の場合は無効。
- 面積がEPS以下なら無効。

## 10.2 ポリゴンの検証

`validatePolygon(poly)` を実装する。

検証項目:

- 外周が3点以上ある。
- 穴がある場合、各穴が3点以上ある。
- 外周が自己交差していない。
- 穴が自己交差していない。
- 穴が外周の内側にある。
- 穴同士が交差していない。
- 面積がEPSより大きい。

## 10.3 点がポリゴン内部にあるか

`pointInPolygon(point, polygon)` を実装する。

用途:

- ナイフ分割の候補面判定
- スナップ補助
- 図形クリック判定
- 穴の検証

## 10.4 線分交差

`segmentIntersection(a1, a2, b1, b2)` を実装する。

返り値には以下を含める。

```ts
type SegmentIntersectionResult =
  | { type: 'none' }
  | { type: 'point'; point: Point; tA: number; tB: number }
  | { type: 'overlap'; points: [Point, Point] };
```

ナイフMVPでは `type: 'point'` を主に扱い、重なりは警告または未対応としてよい。

---

## 11. 状態管理

### 11.1 AppState

```ts
export type AppState = {
  project: Project;
  selectedEntityIds: string[];
  selectedVertexRefs: VertexRef[];
  activeTool: ToolName;
  view: ViewTransform;
  clipboard?: Entity[];
  history: HistoryState;
  ui: UIState;
};
```

### 11.2 ToolName

```ts
export type ToolName =
  | 'select'
  | 'pan'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'vertex-edit'
  | 'knife';
```

### 11.3 VertexRef

```ts
export type VertexRef = {
  entityId: string;
  ringType: 'outer' | 'hole';
  holeIndex?: number;
  vertexIndex: number;
};
```

---

## 12. エラーハンドリング

以下のようなケースでは、必ずユーザーにわかるメッセージを表示する。

- 3点未満のポリゴンを確定しようとした。
- 自己交差するポリゴンを作成しようとした。
- ブーリアン演算結果が空になった。
- Differenceで対象またはカッターが選択されていない。
- ナイフ線がポリゴンを分割していない。
- JSONインポートに失敗した。
- 保存に失敗した。

エラーメッセージは短く、次の行動がわかる文にする。

例:

```text
ナイフ線が図形を横切っていません。外周を2点で横切る線を指定してください。
```

---

## 13. テスト要件

## 13.1 単体テスト

必須テスト:

- 面積計算
- Ring正規化
- ポリゴン検証
- 線分交差
- 円のポリゴン近似
- Union
- Difference
- ナイフMVP分割

## 13.2 E2Eテスト

最低限、以下のシナリオをテストする。

1. 矩形を作図する。
2. 面積が表示される。
3. 円を作図する。
4. 矩形から円をくり抜く。
5. 面積が減少する。
6. JSONエクスポートする。
7. ページをリロードする。
8. JSONインポートで復元できる。

## 13.3 数値誤差の許容

面積比較では完全一致を求めない。

```ts
expect(actual).toBeCloseTo(expected, 6);
```

のように許容誤差を設定する。

---

## 14. GitHub Pages デプロイ要件

## 14.1 Vite設定

リポジトリページ `https://<username>.github.io/<repo>/` に公開する場合、`vite.config.ts` の `base` を `/<repo>/` に設定する。

例:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
});
```

ユーザーまたは組織のルートページ `https://<username>.github.io/` に公開する場合は、`base: '/'` とする。

## 14.2 GitHub Actions例

`.github/workflows/deploy.yml` を用意する。

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## 14.3 注意点

- ルーティングはSPAルーティングを避けるか、HashRouterを使う。
- 画像・CSS・JSのパスは `base` を考慮する。
- サーバーAPI前提の処理を書かない。
- 永続化はブラウザローカルまたはダウンロードファイルで行う。

---

## 15. 実装フェーズ

## Phase 1: プロジェクト初期化

- Vite + React + TypeScript をセットアップする。
- GitHub Pages用のビルド設定を入れる。
- 基本レイアウトを作る。
- ツールバー、描画領域、プロパティパネル、ステータスバーを配置する。

完了条件:

- `npm run dev` で起動する。
- `npm run build` が成功する。
- 空のCAD画面が表示される。

## Phase 2: 基本作図・表示

- SVGビューポートを実装する。
- グリッドを表示する。
- パン・ズームを実装する。
- ポリゴン作図を実装する。
- 矩形作図を実装する。
- 円作図を実装する。

完了条件:

- 複数の図形を作図できる。
- 図形を選択できる。
- 面積が表示される。

## Phase 3: 頂点編集・座標編集

- 頂点ハンドルを表示する。
- 頂点ドラッグを実装する。
- 座標テーブルを実装する。
- 頂点追加・削除を実装する。
- Undo / Redo を実装する。

完了条件:

- 座標値を入力して図形を変形できる。
- 変更後に面積が更新される。
- Undo / Redo が動作する。

## Phase 4: ブーリアン演算

- `geometryEngine` を実装する。
- Unionを実装する。
- Differenceを実装する。
- 円形くり抜きを実装する。
- ブーリアン後の正規化を実装する。

完了条件:

- 重なった矩形を結合できる。
- 矩形から円をくり抜ける。
- 演算後の面積が正しい。

## Phase 5: ナイフ分割

- 線分交差を実装する。
- MVPの2交点直線分割を実装する。
- ナイフツールUIを実装する。
- 分割後の面積検証を行う。

完了条件:

- 正方形を線で2つに分割できる。
- 分割前後の面積合計が一致する。

## Phase 6: 保存・出力

- localStorage保存を実装する。
- JSONエクスポートを実装する。
- JSONインポートを実装する。
- CSV面積出力を任意で実装する。

完了条件:

- 作成した図形をファイルとして保存できる。
- ファイルから復元できる。

## Phase 7: 品質向上

- テストを追加する。
- UIを整える。
- エラーメッセージを整える。
- GitHub Pagesにデプロイする。
- READMEを作成する。

---

## 16. 受け入れ基準

完成版は以下を満たすこと。

### 16.1 作図

- ポリゴン、矩形、円を作図できる。
- 作図中のプレビューが表示される。
- 不正なポリゴンは作成できない。

### 16.2 編集

- 図形を選択できる。
- 頂点をドラッグ移動できる。
- 頂点座標を数値編集できる。
- 頂点を追加・削除できる。

### 16.3 ブーリアン

- 複数ポリゴンを結合できる。
- 円形・矩形・任意ポリゴンでくり抜ける。
- 演算後の形状が画面に反映される。
- 演算後の面積が更新される。

### 16.4 ナイフ

- 単純ポリゴンを直線で2分割できる。
- 分割前後の面積合計が一致する。
- 分割できない操作では警告が出る。

### 16.5 面積

- 各図形の面積が表示される。
- 選択図形の合計面積が表示される。
- 穴がある場合、穴面積を差し引いた面積が表示される。
- 単位変換が正しく行われる。

### 16.6 公開

- GitHub Pagesで動作する。
- ページをリロードしても保存データを復元できる。
- JSONエクスポート / インポートが動作する。

---

## 17. AI開発エージェントへの作業ルール

AI開発エージェントは、以下のルールを守ること。

1. まずプロジェクトを静的Webアプリとして構成する。
2. 形状モデル、幾何演算、描画、UI状態を分離する。
3. 幾何演算ライブラリを直接UIコンポーネントから呼ばない。
4. 面積計算、線分交差、ナイフ分割は必ず単体テストを書く。
5. ブーリアン演算後は必ず正規化・検証を行う。
6. 座標系と単位を混同しない。
7. 内部座標と表示丸めを分ける。
8. Undo / Redo 対象の操作を漏らさない。
9. GitHub Pagesでの公開を前提に、サーバー依存コードを書かない。
10. 完成後、READMEに使い方とデプロイ方法を書く。

---

## 18. READMEに記載すべき内容

READMEには以下を含める。

- アプリ概要
- 主な機能
- 開発環境の起動方法
- ビルド方法
- GitHub Pagesへのデプロイ方法
- 操作方法
- ショートカット一覧
- 面積単位の説明
- JSONエクスポート / インポート方法
- 既知の制限

---

## 19. 既知の制限として明記する内容

初期版では以下を既知の制限として扱ってよい。

- ナイフ機能は最初、単純ポリゴンを1本の直線で2分割するケースに限定する。
- 自己交差ポリゴンはサポートしない。
- 円は真円データではなく、多角形近似として扱う。
- 非常に小さな辺や重複点がある形状では、ブーリアン演算前に正規化が必要になる。
- 3D CADやBIM連携は対象外とする。

---

## 20. 参考情報

実装時は、以下のドキュメントやライブラリ仕様を確認すること。

- GitHub Pages 公式ドキュメント
  - https://pages.github.com/
  - https://docs.github.com/en/pages
- Vite 静的サイトデプロイ / GitHub Pages
  - https://vite.dev/guide/static-deploy
  - https://ja.vite.dev/guide/static-deploy
- polygon-clipping
  - https://github.com/mfogel/polygon-clipping
- clipper-lib
  - https://github.com/junmer/clipper-lib
- Martinez polygon clipping
  - https://github.com/w8r/martinez

---

## 21. 開発開始時にAIへ渡す短縮プロンプト

以下をAIコーディングエージェントに渡して実装を開始してよい。

```text
React + Vite + TypeScriptで、GitHub Pagesに公開できる2D CAD Webアプリを実装してください。
目的は建築の受圧面積のような2Dポリゴン面積算定です。

必須機能:
- SVGベースのCAD画面
- パン・ズーム・グリッド・スナップ
- ポリゴン、矩形、円の作図
- 図形選択、複数選択
- 頂点ドラッグ編集
- 頂点座標の数値編集
- 頂点追加・削除
- Unionによるポリゴン結合
- Differenceによる円形・矩形・任意形状のくり抜き
- ナイフツールによる単純ポリゴンの直線2分割
- 面積算定 m²表示、穴面積差し引き対応
- Undo / Redo
- JSONエクスポート / インポート
- localStorage保存
- GitHub Pagesデプロイ設定

設計方針:
- 図形データ、描画、UI状態、幾何演算を分離してください。
- 幾何演算はgeometryEngineアダプター層に閉じ込めてください。
- ブーリアン演算はpolygon-clipping等の実績あるライブラリを使用してください。
- 面積計算、線分交差、ナイフ分割、ブーリアン結果は単体テストを作成してください。
- GitHub Pagesで動く静的SPAにしてください。バックエンドは使わないでください。
```
