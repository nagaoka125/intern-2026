const STREAM_URL = "https://intern-hls-server.tdmi0e341.workers.dev/stream.m3u8";
const COMMENT_EVENTS_URL = "https://intern-comment-server.intern-comment-server.deno.net/events";
const COMMENT_MESSAGES_URL = "https://intern-comment-server.intern-comment-server.deno.net/messages";
const ITEMS_URL = "https://intern-comment-server.intern-comment-server.deno.net/items";
const ITEMS_POLL_INTERVAL_MS = 15000;
const MAX_COMMENT_LENGTH = 200;
const SEND_COOLDOWN_MS = 5000;

// 一度に選択できるアイテムは1つだけ。アイテム一覧の描画と送信処理の両方から参照する
let selectedItemId = null;

function clearItemSelection() {
  selectedItemId = null;
  const selected = document.querySelector(".item-button.selected");
  if (selected) selected.classList.remove("selected");
}

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
  const itemList = document.querySelector(".item-list");
  if (!itemList) return;

  const renderedItemIds = new Set();

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
    const newItems = items.filter((item) => !renderedItemIds.has(item.id));
    if (newItems.length === 0) return;

    const fragment = document.createDocumentFragment();
    for (const item of newItems) {
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

      fragment.appendChild(button);
      renderedItemIds.add(item.id);
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

  fetchItems();
  setInterval(fetchItems, ITEMS_POLL_INTERVAL_MS);
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
      clearItemSelection();
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
});

// 受信したコメント・アイテムを1件、コメント表示領域に追加する
function addComment(commentArea, { text, item, timestamp } = {}) {
  if (!text && !item) return;

  const entry = document.createElement("div");
  entry.className = "comment-entry";

  if (item) {
    const icon = document.createElement("img");
    icon.className = "comment-item-icon";
    icon.src = item.iconUrl;
    icon.alt = item.name;
    entry.appendChild(icon);

    const name = document.createElement("span");
    name.className = "comment-item-name";
    name.textContent = item.name;
    entry.appendChild(name);
  }

  if (text) {
    const textEl = document.createElement("span");
    textEl.className = "comment-text";
    textEl.textContent = text;
    entry.appendChild(textEl);
  }

  const timeLabel = formatTime(timestamp);
  if (timeLabel) {
    const timeEl = document.createElement("span");
    timeEl.className = "comment-time";
    timeEl.textContent = timeLabel;
    entry.appendChild(timeEl);
  }

  commentArea.appendChild(entry);
  commentArea.scrollTop = commentArea.scrollHeight;
}

// timestamp（ISO文字列）を "HH:MM" 形式の時刻表示に変換する。不正な値は表示しない
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
