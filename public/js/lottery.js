import { getPoints, spendPoints } from "./points.js";
import { knownItems, fetchItems, costBandOf } from "./items.js";
import { changeItemStock } from "./item-stock.js";

// 抽選1回の消費ポイント
const LOTTERY_COST_POINTS = 100;
// コスト帯単位の当選重み（詳細はCONTEXT.mdの「抽選」参照）
const LOTTERY_BAND_WEIGHTS = { low: 0.65, mid: 0.27, high: 0.08 };

// 抽選演出（スロット）の設定。REEL_LENGTH枚を並べ、最後の1枚を当選アイテムにして
// ウィンドウ中央（VISIBLE_COUNTが奇数なのでちょうど真ん中）で止める
const LOTTERY_REEL_LENGTH = 30;
const LOTTERY_REEL_VISIBLE_COUNT = 5;
const LOTTERY_REEL_DURATION_MS = 2500;

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

// 抽選演出のリール1コマ分のアイコン要素を作る
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

// 抽選ボタン・モーダル（スロット演出・結果表示）の配線
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
