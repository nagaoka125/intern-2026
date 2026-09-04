import { selectedItemId, clearItemSelection } from "./selection.js";
import { itemsById, costBandOf } from "./items.js";
import { addPoints } from "./points.js";
import { changeItemStock } from "./item-stock.js";
import { enterToSendEnabled, keepSelectionAfterSend } from "./header-controls.js";

// コメント送信APIのURL
const COMMENT_MESSAGES_URL = "https://intern-comment-server.intern-comment-server.deno.net/messages";
// 送信できるコメント本文の最大文字数
const MAX_COMMENT_LENGTH = 200;

// 通常時、送信のたびに送信ボタンを無効化しておく時間
const SEND_COOLDOWN_MS = 3000;
// この時間内にBURST_LIMIT回送信したら連続送信ロックをかける（詳細はCONTEXT.mdの「連続送信ロック」参照）
const BURST_WINDOW_MS = 10000;
const BURST_LIMIT = 3;
// 連続送信ロックがかかったときに送信不可にする時間
const BURST_LOCK_MS = 20000;

// コメント1件・アイテム付き送信（コスト帯別、基本の1ptは含まない）で得られるポイント
const COMMENT_POINTS = 1;
const ITEM_POINTS_BY_COST_BAND = { low: 5, mid: 15, high: 40 };

// 送信欄（入力・送信ボタン・連続送信防止）の配線
document.addEventListener("DOMContentLoaded", () => {
  const sendArea = document.querySelector(".send-area");
  if (!sendArea) return;

  const input = sendArea.querySelector(".send-input");
  const sendButton = sendArea.querySelector(".send-button");
  const errorEl = sendArea.querySelector(".send-error");

  // 送信中・通常クールダウン・連続送信ロックは別々の理由で送信ボタンを止める
  // 独立した状態なので、それぞれ保持してupdateSendButtonStateで合成する。
  // isSendingが無いと、送信リクエスト待ち中に入力欄へ文字を打っただけで
  // inputイベント経由の再計算がボタンを再度有効化してしまう（クールダウンが
  // 実際に効き始めるのはfetch完了後のため）
  let isSending = false;
  let isCoolingDown = false;
  let isBurstLocked = false;
  let recentSendTimestamps = [];

  // 送信エラーメッセージを表示する
  const showSendError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  // 送信エラーメッセージを非表示にする
  const hideSendError = () => {
    errorEl.hidden = true;
    errorEl.textContent = "";
  };

  // 入力欄が空かつアイテム未選択のときは押せないようにする（クールダウン・
  // 連続送信ロックとは独立した条件なのでORで合成する）
  const updateSendButtonState = () => {
    const hasContent = Boolean(input.value.trim()) || Boolean(selectedItemId);
    sendButton.disabled = !hasContent || isSending || isCoolingDown || isBurstLocked;
  };

  input.addEventListener("input", updateSendButtonState);
  document.addEventListener("item-selection-changed", updateSendButtonState);
  updateSendButtonState();

  // 直近BURST_WINDOW_MS以内の送信回数がBURST_LIMITに達したら、通常の
  // クールダウンとは別にBURST_LOCK_MSの間ロックする（連打対策）
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

  // 入力中のコメント・選択中アイテムをコメントサーバーへ送信する
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
