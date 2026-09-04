// リアルタイムコメント受信用SSEエンドポイント
const COMMENT_EVENTS_URL = "https://intern-comment-server.intern-comment-server.deno.net/events";

// アイテムのコスト強度演出を正規化する基準となるコスト範囲の下限・上限。実データの
// 5段階(10/50/150/400/1000)に直接依存させず、アイテムサーバー側で将来コスト値が
// 増減しても見た目が破綻しないよう余裕を持たせた固定範囲を対数スケールで使う
// （詳細はCONTEXT.mdの「コスト強度」を参照）
const COST_INTENSITY_MIN_COST = 1;
const COST_INTENSITY_MAX_COST = 1500;

// 自動スクロールを続けるとみなす、最下部からの許容誤差(px)
const AUTOSCROLL_THRESHOLD_PX = 20;

// 総コメント数・アイテム数はコメントサーバーに過去ログ取得手段がなく、SSE接続後に
// 受信したイベントしか分からないため、ページを開いてからの累計をここで保持するだけに
// とどめる（永続化しない・リロードで0に戻る。詳細はdocs/adr/0006参照）
let totalCommentCount = 0;
let totalItemCount = 0;

// SSE接続とコメント受信の配線
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

// アイテム数は総コメント数の内数（アイテムが添付されていた送信だけを数えるサブセット）
function recordViewerStats({ item } = {}) {
  totalCommentCount += 1;
  if (item) totalItemCount += 1;

  const commentsValue = document.querySelector(".viewer-stat-comments-value");
  const itemsValue = document.querySelector(".viewer-stat-items-value");
  if (commentsValue) commentsValue.textContent = String(totalCommentCount);
  if (itemsValue) itemsValue.textContent = String(totalItemCount);
}

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
  // 登場モーション）を適用する。強度は--cost-intensity経由でCSS側の複数の見た目に反映される
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

// アイテムのコストを0〜1のコスト強度に変換する。対数スケールなので、
// 10→50→150→400→1000のような比率的な増え方の違いを滑らかな強さの違いとして表現できる
function calculateCostIntensity(cost) {
  const clamped = Math.min(Math.max(cost, COST_INTENSITY_MIN_COST), COST_INTENSITY_MAX_COST);
  const logMin = Math.log(COST_INTENSITY_MIN_COST);
  const logMax = Math.log(COST_INTENSITY_MAX_COST);
  return (Math.log(clamped) - logMin) / (logMax - logMin);
}

// timestamp（ISO文字列）を"HH:MM"形式の時刻表示に変換する。不正な値は表示しない
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
