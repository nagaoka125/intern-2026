// チャンネル一覧取得API（動画配信サーバーと同じCloudflare Workersホスト）のURL
const CHANNELS_URL = "https://intern-hls-server.tomaton.workers.dev/channels.json";
// 各チャンネルのplaylistはオリジンを含まない相対パスで返るため、解決の基準にする
const CHANNEL_STREAM_ORIGIN = "https://intern-hls-server.tomaton.workers.dev";

// チャンネル一覧の取得・描画・切替の配線
document.addEventListener("DOMContentLoaded", async () => {
  const channelGrid = document.querySelector(".channel-grid");
  const titleValue = document.querySelector(".viewer-stat-title-value");
  const categoryValue = document.querySelector(".viewer-stat-category-value");
  if (!channelGrid) return;

  let channels = [];
  let currentChannelId = null;

  try {
    const response = await fetch(CHANNELS_URL);
    const data = await response.json();
    // 配信終了チャンネルは選択肢に出さない
    channels = data.filter((channel) => !channel.retired);
  } catch (error) {
    console.error("チャンネル一覧の取得に失敗しました", error);
    return;
  }

  const defaultChannel = channels.find((channel) => channel.default) ?? channels[0];
  if (!defaultChannel) return;

  currentChannelId = defaultChannel.id;
  showNowPlaying(defaultChannel);
  renderChannelGrid();

  // 動画下のタイトル・カテゴリ表示を現在再生中のチャンネルに合わせて更新する
  function showNowPlaying(channel) {
    if (titleValue) {
      titleValue.textContent = channel.title;
      titleValue.title = channel.title;
    }
    if (categoryValue) categoryValue.textContent = channel.category;
  }

  // 全チャンネルを一覧に描画する。現在再生中のチャンネルも含めるが、選び直しても
  // 意味がないため強調表示した上でクリックできないようにする
  function renderChannelGrid() {
    channelGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    for (const channel of channels) {
      const isCurrent = channel.id === currentChannelId;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "channel-button";
      button.title = channel.title;
      if (isCurrent) {
        button.classList.add("is-current");
        button.disabled = true;
      } else {
        button.addEventListener("click", () => switchChannel(channel));
      }

      const titleEl = document.createElement("span");
      titleEl.className = "channel-button-title";
      titleEl.textContent = channel.title;
      button.appendChild(titleEl);

      const categoryEl = document.createElement("span");
      categoryEl.className = "channel-button-category";
      categoryEl.textContent = channel.category;
      button.appendChild(categoryEl);

      fragment.appendChild(button);
    }

    channelGrid.appendChild(fragment);
  }

  // 動画・コメント欄・視聴統計への通知はイベント経由にし、channels.jsが他モジュールの
  // 内部状態を直接書き換えないようにする（items.jsのitems-fetchedと同じ考え方）
  function switchChannel(channel) {
    currentChannelId = channel.id;
    showNowPlaying(channel);
    renderChannelGrid();

    document.dispatchEvent(
      new CustomEvent("channel-switched", {
        detail: { streamUrl: `${CHANNEL_STREAM_ORIGIN}${channel.playlist}` },
      }),
    );
  }
});
