// アイテム所持数のlocalStorage保存キー
const ITEM_STOCK_STORAGE_KEY = "itemStock";
// 初めて見るアイテムに割り当てる初期所持数
const DEFAULT_ITEM_STOCK = 10;

// 保存済みの所持数マップ（アイテムID -> 個数）を読み込む
function loadItemStock() {
  try {
    return JSON.parse(localStorage.getItem(ITEM_STOCK_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// 初めて見るアイテムはここで所持数DEFAULT_ITEM_STOCKとして登録し、以後は保存済みの値を使う
export function getItemStockCount(itemId) {
  const stock = loadItemStock();
  if (!(itemId in stock)) {
    stock[itemId] = DEFAULT_ITEM_STOCK;
    localStorage.setItem(ITEM_STOCK_STORAGE_KEY, JSON.stringify(stock));
  }
  return stock[itemId];
}

// 指定したアイテムの所持数をdeltaだけ増減する（0未満にはならない）
export function changeItemStock(itemId, delta) {
  const stock = loadItemStock();
  const current = itemId in stock ? stock[itemId] : DEFAULT_ITEM_STOCK;
  const next = Math.max(0, current + delta);
  stock[itemId] = next;
  localStorage.setItem(ITEM_STOCK_STORAGE_KEY, JSON.stringify(stock));
  document.dispatchEvent(new CustomEvent("item-stock-changed", { detail: { itemId, stock: next } }));
  return next;
}

// 設定メニューのデバッグ機能。全アイテムの所持数を初期値に戻す
export function resetItemStock() {
  localStorage.removeItem(ITEM_STOCK_STORAGE_KEY);
  document.dispatchEvent(new CustomEvent("item-stock-reset"));
}
