const STREAM_URL = "https://intern-hls-server.tdmi0e341.workers.dev/stream.m3u8";
const COMMENT_EVENTS_URL = "https://intern-comment-server.intern-comment-server.deno.net/events";
const COMMENT_MESSAGES_URL = "https://intern-comment-server.intern-comment-server.deno.net/messages";
const ITEMS_URL = "https://intern-comment-server.intern-comment-server.deno.net/items";
const ITEMS_POLL_INTERVAL_MS = 15000;
const MAX_COMMENT_LENGTH = 200;

// 通常時、送信のたびに送信ボタンを無効化しておく時間
const SEND_COOLDOWN_MS = 3000;
// この時間内に BURST_LIMIT 回送信したら連続送信ロックをかける（詳細は CONTEXT.md の「連続送信ロック」参照）
const BURST_WINDOW_MS = 10000;
const BURST_LIMIT = 3;
// 連続送信ロックがかかったときに送信不可にする時間
const BURST_LOCK_MS = 20000;

// コスト強度の正規化基準。実データの5段階(10/50/150/400/1000)に直接依存させず、
// アイテムサーバー側で将来コスト値が増減しても見た目が破綻しないよう余裕を持たせた
// 固定範囲を対数スケールで使う（詳細は CONTEXT.md の「コスト強度」を参照）
const COST_INTENSITY_MIN_COST = 1;
const COST_INTENSITY_MAX_COST = 1500;

// ポイント・アイテム所持数はサーバー側にユーザー識別の仕組みがないため、テーマ設定と
// 同じく各ブラウザの localStorage にのみ保存する（docs/adr/0005 参照）
const POINTS_STORAGE_KEY = "points";
const ITEM_STOCK_STORAGE_KEY = "itemStock";
const DEFAULT_ITEM_STOCK = 10;

// コメント1件・アイテム付き送信（コスト帯別、基本の1ptは含まない）で得られるポイント
const COMMENT_POINTS = 1;
const ITEM_POINTS_BY_COST_BAND = { low: 5, mid: 15, high: 40 };

// 抽選1回の消費ポイントと、コスト帯単位の当選重み（詳細は CONTEXT.md の「抽選」参照）
const LOTTERY_COST_POINTS = 100;
const LOTTERY_BAND_WEIGHTS = { low: 0.65, mid: 0.27, high: 0.08 };

// 抽選演出（スロット）の設定。REEL_LENGTH枚を並べ、最後の1枚を当選アイテムにして
// ウィンドウ中央（VISIBLE_COUNTが奇数なのでちょうど真ん中）で止める
const LOTTERY_REEL_LENGTH = 30;
const LOTTERY_REEL_VISIBLE_COUNT = 5;
const LOTTERY_REEL_DURATION_MS = 2500;

// コスト帯は実データの5段階（10/50/150/400/1000）がちょうど3区分に分かれる。
// アイテムパネルの絞り込み・ポイント計算・抽選の重み付けの複数箇所で共有する
function costBandOf(cost) {
  if (cost <= 100) return "low";
  if (cost <= 500) return "mid";
  return "high";
}

// 一度に選択できるアイテムは1つだけ。アイテム一覧の描画と送信処理の両方から参照する
let selectedItemId = null;

// 設定メニューで切り替えるオプション。デフォルトはどちらもオフ
let enterToSendEnabled = false;
let keepSelectionAfterSend = false;

// アイテム一覧はアイテムパネル表示・送信時のポイント計算・抽選対象の決定など複数箇所で
// 共有するため、フェッチ結果をここでグローバルに保持する
let knownItems = [];
const itemsById = new Map();

// 総コメント数・アイテム数はコメントサーバーに過去ログ取得手段がなく、SSE接続後に
// 受信したイベントしか分からないため、ページを開いてからの累計をここで保持するだけに
// とどめる（永続化しない・リロードで0に戻る。詳細は docs/adr/0006 参照）
let totalCommentCount = 0;
let totalItemCount = 0;

// アイテム数は総コメント数の内数（アイテムが添付されていた送信だけを数えるサブセット）
function recordViewerStats({ item } = {}) {
  totalCommentCount += 1;
  if (item) totalItemCount += 1;

  const commentsValue = document.querySelector(".viewer-stat-comments-value");
  const itemsValue = document.querySelector(".viewer-stat-items-value");
  if (commentsValue) commentsValue.textContent = String(totalCommentCount);
  if (itemsValue) itemsValue.textContent = String(totalItemCount);
}

function clearItemSelection() {
  selectedItemId = null;
  const selected = document.querySelector(".item-button.selected");
  if (selected) selected.classList.remove("selected");
  document.dispatchEvent(new CustomEvent("item-selection-changed"));
}

// アイテム一覧の取得はアイテムパネル（開いたとき）と抽選（プールが空のとき）の
// 両方から呼ばれるため、グローバルな状態更新とイベント通知をここに集約する
async function fetchItems() {
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

function getPoints() {
  return Number(localStorage.getItem(POINTS_STORAGE_KEY)) || 0;
}

// 加算・消費のどちらも送信欄・抽選など異なるスコープから呼ばれるため、常に
// localStorage を読み直してから書き戻し、変化をイベントで通知する
function addPoints(amount) {
  const points = getPoints() + amount;
  localStorage.setItem(POINTS_STORAGE_KEY, String(points));
  document.dispatchEvent(new CustomEvent("points-changed", { detail: { points } }));
  return points;
}

function spendPoints(amount) {
  return addPoints(-amount);
}

function loadItemStock() {
  try {
    return JSON.parse(localStorage.getItem(ITEM_STOCK_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// 初めて見るアイテムはここで所持数 DEFAULT_ITEM_STOCK として登録し、以後は保存済みの値を使う
function getItemStockCount(itemId) {
  const stock = loadItemStock();
  if (!(itemId in stock)) {
    stock[itemId] = DEFAULT_ITEM_STOCK;
    localStorage.setItem(ITEM_STOCK_STORAGE_KEY, JSON.stringify(stock));
  }
  return stock[itemId];
}

function changeItemStock(itemId, delta) {
  const stock = loadItemStock();
  const current = itemId in stock ? stock[itemId] : DEFAULT_ITEM_STOCK;
  const next = Math.max(0, current + delta);
  stock[itemId] = next;
  localStorage.setItem(ITEM_STOCK_STORAGE_KEY, JSON.stringify(stock));
  document.dispatchEvent(new CustomEvent("item-stock-changed", { detail: { itemId, stock: next } }));
  return next;
}

// 設定メニューのデバッグ機能。全アイテムの所持数を初期値に戻す
function resetItemStock() {
  localStorage.removeItem(ITEM_STOCK_STORAGE_KEY);
  document.dispatchEvent(new CustomEvent("item-stock-reset"));
}

// コスト帯単位の重み付けでどの帯から出すかを決め、その帯に属するアイテムから
// 均等な確率で1つを選ぶ（2段階抽選）。将来アイテムサーバー側の都合である帯が
// 空になっても抽選自体は成立するよう、候補が存在する帯だけを対象にする
function pickLotteryItem(items) {
  const bands = { low: [], mid: [], high: [] };
  for (const item of items) {
    bands[costBandOf(item.cost)].push(item);
  }

  const availableBands = Object.keys(LOTTERY_BAND_WEIGHTS).filter((band) => bands[band].length > 0);
  const totalWeight = availableBands.reduce((sum, band) => sum + LOTTERY_BAND_WEIGHTS[band], 0);

  let remaining = Math.random() * totalWeight;
  let chosenBand = availableBands[availableBands.length - 1];
  for (const band of availableBands) {
    remaining -= LOTTERY_BAND_WEIGHTS[band];
    if (remaining <= 0) {
      chosenBand = band;
      break;
    }
  }

  const candidates = bands[chosenBand];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function createReelIcon(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "lottery-reel-icon";
  const icon = document.createElement("img");
  icon.src = item.iconUrl;
  icon.alt = item.name;
  wrapper.appendChild(icon);
  return wrapper;
}

// 当選アイテムをウィンドウ中央で停止させるスロット演出。当選アイテムを列の最後に
// 置き、アイコン1枚分の実測幅から中央位置までの移動量を逆算してtransformで動かす
function playLotteryReel(reel, items, winner) {
  return new Promise((resolve) => {
    reel.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < LOTTERY_REEL_LENGTH - 1; i++) {
      fragment.appendChild(createReelIcon(items[Math.floor(Math.random() * items.length)]));
    }
    fragment.appendChild(createReelIcon(winner));
    reel.appendChild(fragment);

    const iconWidth = reel.firstChild.getBoundingClientRect().width;
    const centerIndex = Math.floor(LOTTERY_REEL_VISIBLE_COUNT / 2);
    const offset = (LOTTERY_REEL_LENGTH - 1 - centerIndex) * iconWidth;

    reel.style.transition = "none";
    reel.style.transform = "translateX(0)";
    void reel.offsetWidth; // transitionを効かせるためのreflow
    reel.style.transition = `transform ${LOTTERY_REEL_DURATION_MS}ms cubic-bezier(0.15, 0.7, 0.2, 1)`;
    reel.style.transform = `translateX(-${offset}px)`;

    setTimeout(resolve, LOTTERY_REEL_DURATION_MS);
  });
}

// テーマは localStorage に保存し、次回訪問時も選択を復元する。未設定時はダークがデフォルト
const THEME_STORAGE_KEY = "theme";

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "dark");

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("video");
  if (!video) return;

  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(STREAM_URL);
    hls.attachMedia(video);

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hls.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hls.recoverMediaError();
          break;
        default:
          hls.destroy();
          break;
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = STREAM_URL;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.querySelector(".app-container");
  const commentToggle = document.querySelector(".comment-toggle");
  const sendAreaToggle = document.querySelector(".send-area-toggle");
  const enterToSendCheckbox = document.querySelector(".settings-enter-to-send-checkbox");
  const keepSelectionCheckbox = document.querySelector(".settings-keep-selection-checkbox");
  const settingsToggle = document.querySelector(".settings-toggle");
  const settingsMenu = document.querySelector(".settings-menu");
  const settingsRoot = document.querySelector(".settings");
  const themeOptions = document.querySelectorAll(".theme-option");
  const resetStockButton = document.querySelector(".settings-reset-stock-button");
  if (!appContainer || !commentToggle) return;

  // コメント欄・送信欄の表示/非表示は、ヘッダーのスイッチボタンのみで切り替える
  const setCommentVisible = (visible) => {
    appContainer.classList.toggle("comment-hidden", !visible);
    commentToggle.setAttribute("aria-expanded", String(visible));
    commentToggle.setAttribute("aria-checked", String(visible));
  };

  commentToggle.addEventListener("click", () => {
    const isVisible = commentToggle.getAttribute("aria-expanded") === "true";
    setCommentVisible(!isVisible);
  });

  const setSendAreaVisible = (visible) => {
    appContainer.classList.toggle("send-hidden", !visible);
    if (sendAreaToggle) {
      sendAreaToggle.setAttribute("aria-expanded", String(visible));
      sendAreaToggle.setAttribute("aria-checked", String(visible));
    }
  };

  if (sendAreaToggle) {
    sendAreaToggle.addEventListener("click", () => {
      const isVisible = sendAreaToggle.getAttribute("aria-expanded") === "true";
      setSendAreaVisible(!isVisible);
    });
  }

  if (resetStockButton) {
    resetStockButton.addEventListener("click", () => {
      resetItemStock();
    });
  }

  if (enterToSendCheckbox) {
    enterToSendEnabled = enterToSendCheckbox.checked;
    enterToSendCheckbox.addEventListener("change", () => {
      enterToSendEnabled = enterToSendCheckbox.checked;
    });
  }

  if (keepSelectionCheckbox) {
    keepSelectionAfterSend = keepSelectionCheckbox.checked;
    keepSelectionCheckbox.addEventListener("change", () => {
      keepSelectionAfterSend = keepSelectionCheckbox.checked;
    });
  }

  if (settingsToggle && settingsMenu && settingsRoot) {
    settingsToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = settingsMenu.classList.toggle("open");
      settingsToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // メニューの外側をクリックしたら閉じる
    document.addEventListener("click", (event) => {
      if (!settingsRoot.contains(event.target)) {
        settingsMenu.classList.remove("open");
        settingsToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
  for (const option of themeOptions) {
    option.classList.toggle("is-active", option.dataset.themeChoice === currentTheme);
    option.addEventListener("click", () => {
      const theme = option.dataset.themeChoice;
      applyTheme(theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      for (const o of themeOptions) {
        o.classList.toggle("is-active", o === option);
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const commentArea = document.querySelector(".comment-area");
  if (!commentArea) return;

  const eventSource = new EventSource(COMMENT_EVENTS_URL);
  eventSource.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    addComment(commentArea, payload);
  };
});

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
      selectedItemId = null;
    } else {
      selectedItemId = itemId;
      button.classList.add("selected");
    }
    document.dispatchEvent(new CustomEvent("item-selection-changed"));
  };

  // アイテムボタンの残り所持数表示と選択可否を更新する。送信・抽選で所持数が
  // 変化するたびに呼ばれる（item-stock-changed 経由）ほか、初回描画時にも呼ぶ
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

  // 新規アイテムだけを DocumentFragment にまとめて1回のDOM操作で追加する
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

document.addEventListener("DOMContentLoaded", () => {
  const sendArea = document.querySelector(".send-area");
  if (!sendArea) return;

  const input = sendArea.querySelector(".send-input");
  const sendButton = sendArea.querySelector(".send-button");
  const errorEl = sendArea.querySelector(".send-error");

  // 送信中・通常クールダウン・連続送信ロックは別々の理由で送信ボタンを止める
  // 独立した状態なので、それぞれ保持して updateSendButtonState で合成する。
  // isSending が無いと、送信リクエスト待ち中に入力欄へ文字を打っただけで
  // input イベント経由の再計算がボタンを再度有効化してしまう（クールダウンが
  // 実際に効き始めるのは fetch 完了後のため）
  let isSending = false;
  let isCoolingDown = false;
  let isBurstLocked = false;
  let recentSendTimestamps = [];

  const showSendError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  const hideSendError = () => {
    errorEl.hidden = true;
    errorEl.textContent = "";
  };

  // 入力欄が空かつアイテム未選択のときは押せないようにする（クールダウン・
  // 連続送信ロックとは独立した条件なので OR で合成する）
  const updateSendButtonState = () => {
    const hasContent = Boolean(input.value.trim()) || Boolean(selectedItemId);
    sendButton.disabled = !hasContent || isSending || isCoolingDown || isBurstLocked;
  };

  input.addEventListener("input", updateSendButtonState);
  document.addEventListener("item-selection-changed", updateSendButtonState);
  updateSendButtonState();

  // 直近 BURST_WINDOW_MS 以内の送信回数が BURST_LIMIT に達したら、通常の
  // クールダウンとは別に BURST_LOCK_MS の間ロックする（連打対策）
  const registerSendAttempt = () => {
    const now = Date.now();
    recentSendTimestamps = recentSendTimestamps.filter((t) => now - t < BURST_WINDOW_MS);
    recentSendTimestamps.push(now);

    if (recentSendTimestamps.length >= BURST_LIMIT) {
      isBurstLocked = true;
      recentSendTimestamps = [];
      setTimeout(() => {
        isBurstLocked = false;
        updateSendButtonState();
      }, BURST_LOCK_MS);
    }
  };

  const sendComment = async () => {
    const text = input.value.trim().slice(0, MAX_COMMENT_LENGTH);
    const itemId = selectedItemId;

    const payload = {};
    if (text) payload.text = text;
    if (itemId) payload.itemId = itemId;

    try {
      const response = await fetch(COMMENT_MESSAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // ポイント加算・所持数の消費は送信が成功した場合のみ行う（失敗時は変化させない）
      if (itemId) {
        const item = itemsById.get(itemId);
        addPoints(ITEM_POINTS_BY_COST_BAND[costBandOf(item.cost)]);
        changeItemStock(itemId, -1);
      } else {
        addPoints(COMMENT_POINTS);
      }

      input.value = "";
      if (!keepSelectionAfterSend) {
        clearItemSelection();
      }
    } catch (error) {
      console.error("コメントの送信に失敗しました", error);
      showSendError("送信に失敗しました。もう一度お試しください。");
    }
  };

  sendButton.addEventListener("click", async () => {
    hideSendError();
    registerSendAttempt();

    isSending = true;
    updateSendButtonState();
    sendButton.textContent = "送信中...";

    await sendComment();

    isSending = false;
    sendButton.textContent = "送信";
    isCoolingDown = true;
    setTimeout(() => {
      isCoolingDown = false;
      updateSendButtonState();
    }, SEND_COOLDOWN_MS);
    updateSendButtonState();
  });

  // 設定でオンにした場合のみ、Enter単体で送信する（Shift+Enterは改行のまま）
  input.addEventListener("keydown", (event) => {
    if (!enterToSendEnabled) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!sendButton.disabled) sendButton.click();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const lotteryButton = document.querySelector(".lottery-toggle");
  const modal = document.querySelector(".lottery-modal-overlay");
  if (!lotteryButton || !modal) return;

  const pointsLabel = lotteryButton.querySelector(".lottery-points");
  const reel = modal.querySelector(".lottery-reel");
  const resultEl = modal.querySelector(".lottery-result");
  const closeButton = modal.querySelector(".lottery-close");

  const updateLotteryButton = (points) => {
    pointsLabel.textContent = points;
    lotteryButton.disabled = points < LOTTERY_COST_POINTS;
  };
  updateLotteryButton(getPoints());

  document.addEventListener("points-changed", (event) => updateLotteryButton(event.detail.points));

  closeButton.addEventListener("click", () => {
    modal.hidden = true;
    reel.innerHTML = "";
  });

  lotteryButton.addEventListener("click", async () => {
    if (getPoints() < LOTTERY_COST_POINTS) return;

    lotteryButton.disabled = true;

    // アイテムパネルを一度も開いていない場合、抽選プールがまだ空のことがあるため
    // その場で1回だけ取得しにいく
    if (knownItems.length === 0) {
      await fetchItems();
    }
    if (knownItems.length === 0) {
      updateLotteryButton(getPoints());
      return;
    }

    spendPoints(LOTTERY_COST_POINTS);
    const winner = pickLotteryItem(knownItems);
    changeItemStock(winner.id, 1);

    resultEl.hidden = true;
    closeButton.hidden = true;
    modal.hidden = false;

    await playLotteryReel(reel, knownItems, winner);

    resultEl.textContent = `${winner.name} を獲得しました！`;
    resultEl.hidden = false;
    closeButton.hidden = false;
    updateLotteryButton(getPoints());
  });
});

// 自動スクロールを続けるとみなす、最下部からの許容誤差(px)
const AUTOSCROLL_THRESHOLD_PX = 20;

// 受信したコメント・アイテムを1件、コメント表示領域に追加する
function addComment(commentArea, { text, item, timestamp } = {}) {
  if (!text && !item) return;

  recordViewerStats({ item });

  // 追加前の時点で最下部付近にいたかどうかで、追加後に自動スクロールするか決める
  // （過去ログを読むために上にスクロールしている最中に強制的に飛ばされないようにする）
  const wasNearBottom =
    commentArea.scrollHeight - commentArea.scrollTop - commentArea.clientHeight <= AUTOSCROLL_THRESHOLD_PX;

  const entry = document.createElement("div");
  entry.className = "comment-entry";

  // アイテム付きコメントは、コストが高いほど目立つ「コスト強度演出」（背景色・発光・
  // 登場モーション）を適用する。強度は --cost-intensity 経由でCSS側の複数の見た目に反映される
  if (item && typeof item.cost === "number") {
    entry.classList.add("comment-entry--priced");
    entry.style.setProperty("--cost-intensity", calculateCostIntensity(item.cost).toFixed(3));
  }

  const row = document.createElement("div");
  row.className = "comment-entry-row";

  if (item) {
    const icon = document.createElement("img");
    icon.className = "comment-item-icon";
    icon.src = item.iconUrl;
    icon.alt = item.name;
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "comment-item-name";
    name.textContent = item.name;
    row.appendChild(name);
  }

  if (text) {
    const textEl = document.createElement("span");
    textEl.className = "comment-text";
    textEl.textContent = text;
    row.appendChild(textEl);
  }

  const timeLabel = formatTime(timestamp);
  if (timeLabel) {
    const timeEl = document.createElement("span");
    timeEl.className = "comment-time";
    timeEl.textContent = timeLabel;
    row.appendChild(timeEl);
  }

  entry.appendChild(row);

  // アニメーション付きアイテムはコメント表示領域に届いたときだけ再生する（アイテムパネルでは表示しない）
  if (item && item.animationUrl) {
    const animation = document.createElement("img");
    animation.className = "comment-item-animation";
    animation.src = item.animationUrl;
    animation.alt = `${item.name}のアニメーション`;
    entry.appendChild(animation);
  }

  commentArea.appendChild(entry);
  if (wasNearBottom) {
    commentArea.scrollTop = commentArea.scrollHeight;
  }
}

// アイテムのコストを 0〜1 のコスト強度に変換する。対数スケールなので、
// 10→50→150→400→1000 のような比率的な増え方の違いを滑らかな強さの違いとして表現できる
function calculateCostIntensity(cost) {
  const clamped = Math.min(Math.max(cost, COST_INTENSITY_MIN_COST), COST_INTENSITY_MAX_COST);
  const logMin = Math.log(COST_INTENSITY_MIN_COST);
  const logMax = Math.log(COST_INTENSITY_MAX_COST);
  return (Math.log(clamped) - logMin) / (logMax - logMin);
}

// timestamp（ISO文字列）を "HH:MM" 形式の時刻表示に変換する。不正な値は表示しない
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
