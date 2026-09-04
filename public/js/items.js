// アイテム一覧取得API（アイテムサーバー）のURL
const ITEMS_URL = "https://intern-comment-server.intern-comment-server.deno.net/items";
// アイテム一覧を再取得する間隔（アイテムパネルを開いている間のポーリング用）
export const ITEMS_POLL_INTERVAL_MS = 15000;

// アイテム一覧はアイテムパネル表示・送信時のポイント計算・抽選対象の決定など複数箇所で
// 共有するため、フェッチ結果をこのモジュールで保持し、他のモジュールからimportして参照する
export let knownItems = [];
// アイテムID -> アイテム情報。IDから即座に引けるように一覧と並行して保持する
export const itemsById = new Map();

// アイテム一覧の取得はアイテムパネル（開いたとき）と抽選（プールが空のとき）の
// 両方から呼ばれるため、状態更新とイベント通知をここに集約する
export async function fetchItems() {
  try {
    const response = await fetch(ITEMS_URL);
    const { items } = await response.json();
    knownItems = items;
    for (const item of items) {
      itemsById.set(item.id, item);
    }
    document.dispatchEvent(new CustomEvent("items-fetched", { detail: { items } }));
  } catch (error) {
    console.error("アイテム一覧の取得に失敗しました", error);
  }
}

// コスト帯は実データの5段階（10/50/150/400/1000）がちょうど3区分に分かれる。
// アイテムパネルの絞り込み・ポイント計算・抽選の重み付けの複数箇所で共有する
export function costBandOf(cost) {
  if (cost <= 100) return "low";
  if (cost <= 500) return "mid";
  return "high";
}
