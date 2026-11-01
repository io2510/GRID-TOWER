// ============================================================
// チュートリアルステップ定義 (tutorial_data.py 由来)
// ============================================================
const TUTORIAL_STEPS = [
  { step: 1, text: "画面の見方を確認しましょう。\n中央がゲームエリア、左パネルにスコアとHP、\n右パネルに現在の階層（FLOOR）が表示されます。", condition_type: "wait_input", allowed_keys: ["f"], highlight: "ui" },
  { step: 2, text: "プレイヤーの移動\n「A」キーで左、「D」キーで右に動かせます。\n実際に左右へ移動してみましょう。", condition_type: "player_move", allowed_keys: ["a", "d"], highlight: "player" },
  { step: 3, text: "ジャンプ\n「Space」キーでジャンプします。\nブロックの上に乗ったり、落下を避けるのに使います。", condition_type: "player_jump", allowed_keys: ["a", "d", "space"], highlight: "player" },
  { step: 4, text: "しゃがみ\n「S」キーを押している間、体が低くなり\n狭い隙間をくぐれるようになります（移動速度は少し下がります）。\n実際にしゃがんでみましょう。", condition_type: "player_crouch", allowed_keys: ["a", "d", "space", "s"], highlight: "player" },
  { step: 5, text: "ブロックの左右移動\n「←」「→」キー、またはマウスの左右クリックで\n落下中のブロックを左右に動かせます。", condition_type: "block_move", allowed_keys: ["a", "d", "space", "s", "left", "right"], highlight: "block" },
  { step: 6, text: "ブロックの回転\n「Q」キーで左回転、「E」キーで右回転します。\n実際に回転させてみましょう。", condition_type: "block_rotate", allowed_keys: ["a", "d", "space", "s", "left", "right", "q", "e"], highlight: "block" },
  { step: 7, text: "落下速度アップ\n「↓」キーまたはマウスの中クリックを押している間、ブロックが速く落ちます。\n押し続けて速度アップを体験してみましょう。", condition_type: "block_speed", allowed_keys: ["a", "d", "space", "s", "left", "right", "q", "e", "down"], highlight: "block" },
  { step: 8, text: "ハードドロップ\n「↑」キーを押すと、ブロックがその場から即座に落下・固定されます。\n実際に「↑」キーを押してみましょう。", condition_type: "hard_drop", allowed_keys: ["a", "d", "space", "s", "left", "right", "q", "e", "down", "up"], highlight: "block" },
  { step: 9, text: "ラインを消す\n横一列をブロックで埋めるとラインが消え、スコアと階層が上がります。\n最下段の空いている2マスを埋めて、1ライン消去してみましょう。", condition_type: "line_clear", allowed_keys: ["all"], highlight: "none" },
  { step: 10, text: "コンボ＆コンボブロック\n連続してライン消去すると「コンボ」になり、コンボ数に応じて階層がさらに上昇します。\nコンボ中に貯まった「コンボブロック」は「W」キーで盤面の隙間に割り込み設置できます。\n実際に「W」キーを押してコンボブロックを使ってみましょう。", condition_type: "combo_use", allowed_keys: ["all"], highlight: "none" },
  { step: 11, text: "ビームの回避\n一定周期でプレイヤーを狙うビームが降ってきます。\n画面上部に「WARNING」が出たら、赤い範囲から逃げてください。\nビームを受けずに回避するとクリアです。", condition_type: "beam_evade", allowed_keys: ["all"], highlight: "warning" },
  { step: 12, text: "チュートリアル完了！\n基本操作はすべて習得しました。\nブロックを積み上げて、できるだけ高い階層を目指しましょう！", condition_type: "wait_input", allowed_keys: ["f"], highlight: "none" }
];
