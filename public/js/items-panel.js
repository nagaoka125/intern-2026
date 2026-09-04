import { ITEMS_POLL_INTERVAL_MS, fetchItems, costBandOf } from "./items.js";
import { selectedItemId, selectItem, clearItemSelection } from "./selection.js";
import { getItemStockCount } from "./item-stock.js";

// アイテムパネル（一覧・フィルタ・選択・所持数表示）の配線
document.addEventListener("DOMContentLoaded", () => {
  const itemPanelToggle = document.querySelector(".item-panel-toggle");
  const itemPanelWrapper = document.querySelector(".item-panel-wrapper");
  const itemList = document.querySelector(".item-list");
  const groupFilterEl = document.querySelector('.filter-group[data-filter="group"]');
  const costFilterEl = document.querySelector('.filter-group[data-filter="cost"]');
  const animationFilterEl = document.querySelector('.filter-group[data-filter="animation"]');
  if (!itemList) return;

  // id -> { item, button }。フィルタ再適用や新規グループチップの追加のために保持する
  const renderedItems = new Map();
  const knownGroups = new Set();
  const activeGroups = new Set();
  const activeCostBands = new Set();
  let animationFilterValue = "all";

  // アイテム一覧の取得は、実際にパネルを開くまで遅延させる（ページ読み込み直後の
  // 無駄なリクエストを避ける）。2回目以降の開閉ではポーリングが既に動いているため
  // 再取得しない
  let itemsFetchStarted = false;

  document.addEventListener("items-fetched", (event) => {
    renderNewItems(event.detail.items);
  });

  itemPanelToggle.addEventListener("click", () => {
    const isOpen = itemPanelWrapper.classList.toggle("open");
    itemPanelToggle.setAttribute("aria-expanded", String(isOpen));

    if (isOpen && !itemsFetchStarted) {
      itemsFetchStarted = true;
      fetchItems();
      setInterval(fetchItems, ITEMS_POLL_INTERVAL_MS);
    }
  });

  // アイテムが現在のグループ・コスト帯・アニメーション有無フィルタに合致するか判定する
  const itemMatchesFilters = (item) => {
    if (activeGroups.size > 0 && !activeGroups.has(item.group)) return false;
    if (activeCostBands.size > 0 && !activeCostBands.has(costBandOf(item.cost))) return false;
    if (animationFilterValue === "has" && !item.animationUrl) return false;
    if (animationFilterValue === "none" && item.animationUrl) return false;
    return true;
  };

  // フィルタで隠れた選択中アイテムは選択解除する（見えないアイテムが送信対象のまま残るのを防ぐ）
  const applyFilters = () => {
    for (const { item, button } of renderedItems.values()) {
      const visible = itemMatchesFilters(item);
      button.hidden = !visible;
      if (!visible && selectedItemId === item.id) {
        clearItemSelection();
      }
    }
  };

  // グループフィルタのチップをアイテム一覧から動的に追加する
  const addGroupChip = (group) => {
    if (knownGroups.has(group)) return;
    knownGroups.add(group);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "filter-chip";
    chip.textContent = group;
    chip.addEventListener("click", () => {
      if (activeGroups.has(group)) {
        activeGroups.delete(group);
        chip.classList.remove("is-active");
      } else {
        activeGroups.add(group);
        chip.classList.add("is-active");
      }
      applyFilters();
    });
    groupFilterEl.appendChild(chip);
  };

  for (const chip of costFilterEl.querySelectorAll(".filter-chip")) {
    const band = chip.dataset.costBand;
    chip.addEventListener("click", () => {
      if (activeCostBands.has(band)) {
        activeCostBands.delete(band);
        chip.classList.remove("is-active");
      } else {
        activeCostBands.add(band);
        chip.classList.add("is-active");
      }
      applyFilters();
    });
  }

  // アニメーション有無フィルタは3択の単一選択（複数同時選択は「すべて」と等価なため不要）
  for (const chip of animationFilterEl.querySelectorAll(".filter-chip")) {
    chip.addEventListener("click", () => {
      animationFilterValue = chip.dataset.animation;
      for (const c of animationFilterEl.querySelectorAll(".filter-chip")) {
        c.classList.toggle("is-active", c === chip);
      }
      applyFilters();
    });
  }

  // アイテム選択はトグル式。別のアイテムを選ぶと前の選択は自動的に外れる
  const toggleItemSelection = (itemId, button) => {
    const currentlySelected = itemList.querySelector(".item-button.selected");
    if (currentlySelected) {
      currentlySelected.classList.remove("selected");
    }

    if (selectedItemId === itemId) {
      selectItem(null);
    } else {
      selectItem(itemId);
      button.classList.add("selected");
    }
  };

  // アイテムボタンの残り所持数表示と選択可否を更新する。送信・抽選で所持数が
  // 変化するたびに呼ばれる（item-stock-changed経由）ほか、初回描画時にも呼ぶ
  const updateStockDisplay = (itemId) => {
    const entry = renderedItems.get(itemId);
    if (!entry) return;
    const stock = getItemStockCount(itemId);
    entry.stockEl.textContent = `所持数：${stock}個`;
    entry.button.disabled = stock <= 0;
    if (stock <= 0 && selectedItemId === itemId) {
      clearItemSelection();
    }
  };

  document.addEventListener("item-stock-changed", (event) => {
    updateStockDisplay(event.detail.itemId);
  });

  document.addEventListener("item-stock-reset", () => {
    for (const itemId of renderedItems.keys()) {
      updateStockDisplay(itemId);
    }
  });

  // 新規アイテムだけをDocumentFragmentにまとめて1回のDOM操作で追加する
  // （大量のアイテムが一度に増えてもリフローが1回で済む）
  const renderNewItems = (items) => {
    const newItems = items.filter((item) => !renderedItems.has(item.id));
    if (newItems.length === 0) return;

    const fragment = document.createDocumentFragment();
    for (const item of newItems) {
      addGroupChip(item.group);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "item-button";
      button.title = item.name;
      button.addEventListener("click", () => toggleItemSelection(item.id, button));

      const stock = document.createElement("span");
      stock.className = "item-stock";
      button.appendChild(stock);

      const icon = document.createElement("img");
      icon.className = "item-icon";
      icon.src = item.iconUrl;
      icon.alt = item.name;
      button.appendChild(icon);

      const cost = document.createElement("span");
      cost.className = "item-cost";
      cost.textContent = `${item.cost}円`;
      button.appendChild(cost);

      button.hidden = !itemMatchesFilters(item);

      fragment.appendChild(button);
      renderedItems.set(item.id, { item, button, stockEl: stock });
      updateStockDisplay(item.id);
    }
    itemList.appendChild(fragment);
  };
});
