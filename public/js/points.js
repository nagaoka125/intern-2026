// ポイントのlocalStorage保存キー
const POINTS_STORAGE_KEY = "points";

// 現在の保有ポイントを取得する
export function getPoints() {
  return Number(localStorage.getItem(POINTS_STORAGE_KEY)) || 0;
}

// ポイントを加算する（負の値を渡すと消費になる）。加算・消費のどちらも送信欄・抽選など
// 異なるスコープから呼ばれるため、常にlocalStorageを読み直してから書き戻し、
// 変化をイベントで通知する
export function addPoints(amount) {
  const points = getPoints() + amount;
  localStorage.setItem(POINTS_STORAGE_KEY, String(points));
  document.dispatchEvent(new CustomEvent("points-changed", { detail: { points } }));
  return points;
}

// ポイントを消費する（addPointsの符号反転のショートハンド）
export function spendPoints(amount) {
  return addPoints(-amount);
}
