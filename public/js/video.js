// 動画配信サーバー（Cloudflare Workers）のHLSプレイリストURL
const STREAM_URL = "https://intern-hls-server.tdmi0e341.workers.dev/stream.m3u8";

// 動画要素にHLSストリームを接続する（hls.js対応ブラウザはhls.js経由、
// Safari等ネイティブ対応ブラウザは<video src>に直接指定する）
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
