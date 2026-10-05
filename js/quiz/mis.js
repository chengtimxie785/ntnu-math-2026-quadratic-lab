// 迷思代碼 → 中文說明（作答紀錄、老師端統計、大螢幕看板共用）
export const MIS = {
  not_recognize: '認不出標準形式的二次函數',
  product_form: '沒有展開乘積就判斷',
  paren_neg: '看到負號或括號就以為不是二次函數',
  no_simplify: '沒有化簡就判斷（x² 項會被消掉）',
  const_square: '把常數的平方當成 x² 項',
  a_zero: '忽略 a ≠ 0 的條件',
  cubic: '沒有看最高次數',
  sign_open: 'a 的正負與開口方向搞反',
  max_min: '最高點與最低點搞混',
  vertex_swap: '坐標的 x、y 順序寫反',
  vertex_sign: 'k 的正負弄錯',
  vertex_a: '把 a 當成最高（低）點的坐標',
  a_not_abs: '用 a（含正負號）比較開口，沒有看 |a|',
  size_reverse: '以為 |a| 愈大、開口愈大（關係弄反）',
  abs_size: '開口大小（|a|）判斷錯誤',
  shift_dir: '上下平移的方向搞反',
  k_to_a: '把 k 加到 x² 的係數上',
  shift_axis: '把上下平移當成左右平移',
  no_shift: '以為平移後最高（低）點不變',
  other: '其他',
};

export const LEVELS = [
  { id: 1, name: '是不是二次函數？', topic: '主題 1' },
  { id: 2, name: '看式子想圖形', topic: '主題 2' },
  { id: 3, name: '開口誰比較大', topic: '主題 2' },
  { id: 4, name: '平移', topic: '主題 2' },
  { id: 5, name: '看圖選式子', topic: '主題 2 綜合' },
];
