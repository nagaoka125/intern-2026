import { applyTheme, THEME_STORAGE_KEY } from "./theme.js";
import { resetItemStock } from "./item-stock.js";

// Enterキー単体でコメントを送信するかどうかの設定（send-area.jsが参照する）
export let enterToSendEnabled = false;
// 送信後にアイテムの選択を維持するかどうかの設定（send-area.jsが参照する）
export let keepSelectionAfterSend = false;

// ヘッダーの表示切替スイッチと設定メニュー（Enter送信・選択維持・テーマ・所持数リセット）の配線
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
      // 元に戻せない操作のため、実行前に確認する
      if (!window.confirm("アイテムの所持数をすべて初期値にリセットします。よろしいですか？")) return;
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
    const isCurrent = option.dataset.themeChoice === currentTheme;
    option.classList.toggle("is-active", isCurrent);
    option.setAttribute("aria-pressed", String(isCurrent));
    option.addEventListener("click", () => {
      const theme = option.dataset.themeChoice;
      applyTheme(theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      for (const o of themeOptions) {
        o.classList.toggle("is-active", o === option);
        o.setAttribute("aria-pressed", String(o === option));
      }
    });
  }
});
