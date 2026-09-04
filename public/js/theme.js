// テーマ（ダーク/ライト）の保存キー。localStorageに保存し、次回訪問時も選択を復元する
export const THEME_STORAGE_KEY = "theme";

// 指定したテーマを<html>要素に反映する。"light"以外（未設定含む）はダーク扱いにする
export function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

// モジュール読み込み時点（DOMContentLoadedを待たず）で即座に適用し、
// テーマ切り替え前の一瞬だけ別テーマで表示される見た目のちらつきを防ぐ
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "dark");
