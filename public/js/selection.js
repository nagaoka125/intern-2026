// 選択中アイテムのID（null=未選択）。アイテムパネルと送信欄の双方が参照する共有状態
export let selectedItemId = null;

// 指定したアイテムを選択状態にする（nullを渡すと選択解除と同じ効果になる）
export function selectItem(itemId) {
  selectedItemId = itemId;
  document.dispatchEvent(new CustomEvent("item-selection-changed"));
}

// 選択を解除し、アイテムパネル側のボタンの見た目（selectedクラス）も合わせて外す
export function clearItemSelection() {
  selectedItemId = null;
  const selected = document.querySelector(".item-button.selected");
  if (selected) selected.classList.remove("selected");
  document.dispatchEvent(new CustomEvent("item-selection-changed"));
}
