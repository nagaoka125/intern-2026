// 動画配信サーバー（Cloudflare Workers）のHLSプレイリストURL
const STREAM_URL = "https://intern-hls-server.tomaton.workers.dev/stream.m3u8";

// チャンネル切替（channel-switched）でも同じインスタンスにloadSourceし直せるよう、
// DOMContentLoaded後もモジュールスコープに保持しておく
let hlsInstance = null;
let videoEl = null;

// 動画要素にHLSストリームを接続する（hls.js対応ブラウザはhls.js経由、
// Safari等ネイティブ対応ブラウザは<video src>に直接指定する）
document.addEventListener("DOMContentLoaded", () => {
  videoEl = document.getElementById("video");
  if (!videoEl) return;

  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls();
    hlsInstance.loadSource(STREAM_URL);
    hlsInstance.attachMedia(videoEl);

    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          hlsInstance.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          hlsInstance.recoverMediaError();
          break;
        default:
          hlsInstance.destroy();
          break;
      }
    });
  } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
    videoEl.src = STREAM_URL;
  }
});

// チャンネル一覧（channels.js）からの切替通知を受けて、新しいプレイリストを読み込み直す
document.addEventListener("channel-switched", (event) => {
  const streamUrl = event.detail?.streamUrl;
  if (!videoEl || !streamUrl) return;

  if (hlsInstance) {
    hlsInstance.loadSource(streamUrl);
  } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
    videoEl.src = streamUrl;
  }
});
