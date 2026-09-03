const STREAM_URL = "https://intern-hls-server.tdmi0e341.workers.dev/stream.m3u8";
const COMMENT_EVENTS_URL = "https://intern-comment-server.intern-comment-server.deno.net/events";
const COMMENT_MESSAGES_URL = "https://intern-comment-server.intern-comment-server.deno.net/messages";
const ITEMS_URL = "https://intern-comment-server.intern-comment-server.deno.net/items";
const ITEMS_POLL_INTERVAL_MS = 15000;
const MAX_COMMENT_LENGTH = 200;
const SEND_COOLDOWN_MS = 5000;

// コスト強度の正規化基準。実データの5段階(10/50/150/400/1000)に直接依存させず、
// アイテムサーバー側で将来コスト値が増減しても見た目が破綻しないよう余裕を持たせた
// 固定範囲を対数スケールで使う（詳細は CONTEXT.md の「コスト強度」を参照）
const COST_INTENSITY_MIN_COST = 1;
const COST_INTENSITY_MAX_COST = 1500;

// 一度に選択できるアイテムは1つだけ。アイテム一覧の描画と送信処理の両方から参照する
let selectedItemId = null;

// 設定メニューで切り替えるオプション。デフォルトはどちらもオフ
let enterToSendEnabled = false;
let keepSelectionAfterSend = false;

function clearItemSelection() {
  selectedItemId = null;
  const selected = document.querySelector(".item-button.selected");
  if (selected) selected.classList.remove("selected");
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
  const commentCheckbox = document.querySelector(".settings-comment-checkbox");
  const sendAreaToggle = document.querySelector(".send-area-toggle");
  const sendAreaCheckbox = document.querySelector(".settings-send-area-checkbox");
  const enterToSendCheckbox = document.querySelector(".settings-enter-to-send-checkbox");
  const keepSelectionCheckbox = document.querySelector(".settings-keep-selection-checkbox");
  const settingsToggle = document.querySelector(".settings-toggle");
  const settingsMenu = document.querySelector(".settings-menu");
  const settingsRoot = document.querySelector(".settings");
  const themeOptions = document.querySelectorAll(".theme-option");
  if (!appContainer || !commentToggle) return;

  // コメント・送信欄それぞれの表示/非表示は、ヘッダーのボタンと設定メニューの
  // チェックボックスのどちらからも切り替えられる。片方を操作したらもう片方の
  // 状態も同期させる
  const setCommentVisible = (visible) => {
    appContainer.classList.toggle("comment-hidden", !visible);
    commentToggle.setAttribute("aria-expanded", String(visible));
    commentToggle.setAttribute("aria-checked", String(visible));
    if (commentCheckbox) commentCheckbox.checked = visible;
  };

  commentToggle.addEventListener("click", () => {
    const isVisible = commentToggle.getAttribute("aria-expanded") === "true";
    setCommentVisible(!isVisible);
  });

  if (commentCheckbox) {
    commentCheckbox.addEventListener("change", () => {
      setCommentVisible(commentCheckbox.checked);
    });
  }

  const setSendAreaVisible = (visible) => {
    appContainer.classList.toggle("send-hidden", !visible);
    if (sendAreaToggle) {
      sendAreaToggle.setAttribute("aria-expanded", String(visible));
      sendAreaToggle.setAttribute("aria-checked", String(visible));
    }
    if (sendAreaCheckbox) sendAreaCheckbox.checked = visible;
  };

  if (sendAreaToggle) {
    sendAreaToggle.addEventListener("click", () => {
      const isVisible = sendAreaToggle.getAttribute("aria-expanded") === "true";
      setSendAreaVisible(!isVisible);
    });
  }

  if (sendAreaCheckbox) {
    sendAreaCheckbox.addEventListener("change", () => {
      setSendAreaVisible(sendAreaCheckbox.checked);
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

  itemPanelToggle.addEventListener("click", () => {
    const isOpen = itemPanelWrapper.classList.toggle("open");
    itemPanelToggle.setAttribute("aria-expanded", String(isOpen));

    if (isOpen && !itemsFetchStarted) {
      itemsFetchStarted = true;
      fetchItems();
      setInterval(fetchItems, ITEMS_POLL_INTERVAL_MS);
    }
  });

  // コスト帯は実データの5段階（10/50/150/400/1000）がちょうど3区分に分かれる
  const costBandOf = (cost) => {
    if (cost <= 100) return "low";
    if (cost <= 500) return "mid";
    return "high";
  };

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
  };

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
      renderedItems.set(item.id, { item, button });
    }
    itemList.appendChild(fragment);
  };

  const fetchItems = async () => {
    try {
      const response = await fetch(ITEMS_URL);
      const { items } = await response.json();
      renderNewItems(items);
    } catch (error) {
      console.error("アイテム一覧の取得に失敗しました", error);
    }
  };
});

document.addEventListener("DOMContentLoaded", () => {
  const sendArea = document.querySelector(".send-area");
  if (!sendArea) return;

  const input = sendArea.querySelector(".send-input");
  const sendButton = sendArea.querySelector(".send-button");
  const errorEl = sendArea.querySelector(".send-error");

  const showSendError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  const hideSendError = () => {
    errorEl.hidden = true;
    errorEl.textContent = "";
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
    const text = input.value.trim();
    const itemId = selectedItemId;
    if (!text && !itemId) return;

    hideSendError();
    sendButton.disabled = true;
    sendButton.textContent = "送信中...";

    await sendComment();

    sendButton.textContent = "送信";
    setTimeout(() => {
      sendButton.disabled = false;
    }, SEND_COOLDOWN_MS);
  });

  // 設定でオンにした場合のみ、Enter単体で送信する（Shift+Enterは改行のまま）
  input.addEventListener("keydown", (event) => {
    if (!enterToSendEnabled) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!sendButton.disabled) sendButton.click();
  });
});

// 自動スクロールを続けるとみなす、最下部からの許容誤差(px)
const AUTOSCROLL_THRESHOLD_PX = 20;

// 受信したコメント・アイテムを1件、コメント表示領域に追加する
function addComment(commentArea, { text, item, timestamp } = {}) {
  if (!text && !item) return;

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
