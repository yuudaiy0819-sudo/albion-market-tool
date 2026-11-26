const CATALOG_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";
const API_BASE = "https://east.albion-online-data.com/api/v2/stats/prices";
const CITIES = ["Bridgewatch", "Fort Sterling", "Lymhurst", "Martlock", "Thetford", "Caerleon", "Brecilien", "Black Market"];
const searchInput = document.querySelector("#item-search");
const searchButton = document.querySelector("#search-button");
const searchMessage = document.querySelector("#search-message");
const results = document.querySelector("#item-results");
const rows = document.querySelector("#market-rows");
const tierSelect = document.querySelector("#tier");
const enchantSelect = document.querySelector("#enchantment");
const qualitySelect = document.querySelector("#quality");
const favoriteButton = document.querySelector("#favorite-button");
const favoriteList = document.querySelector("#favorite-list");
const historyCity = document.querySelector("#history-city");
const historyChart = document.querySelector("#history-chart");
const historyLegend = document.querySelector("#history-legend");
const historyMessage = document.querySelector("#history-message");
const historyRangeButtons = document.querySelectorAll("[data-history-range]");
let historyRange = "24h";
let historyRequestId = 0;
const FAVORITES_KEY = "albion-market-tool-favorites-v1";
let catalog = [];
let selectedItem = null;
let catalogPromise = null;

function flattenItems(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) flattenItems(entry, output);
  } else if (value && typeof value === "object") {
    if (typeof value.UniqueName === "string") output.push(value);
    else for (const entry of Object.values(value)) flattenItems(entry, output);
  }
  return output;
}

function japaneseName(item) {
  const names = item.LocalizedNames || {};
  const key = Object.keys(names).find((candidate) => candidate.toLowerCase() === "ja-jp")
    || Object.keys(names).find((candidate) => candidate.toLowerCase().startsWith("ja"));
  return (key && names[key]) || item.UniqueName;
}

async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then((response) => {
      if (!response.ok) throw new Error("アイテム一覧を取得できませんでした。");
      return response.json();
    }).then((data) => flattenItems(data).filter((item) => item.UniqueName && item.UniqueName.startsWith("T")));
  }
  return catalogPromise;
}

function showResults(items) {
  results.replaceChildren();
  if (!items.length) {
    results.textContent = "一致するアイテムがありません。別の名前でも試してください。";
    return;
  }
  for (const item of items.slice(0, 12)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item-result";
    button.innerHTML = '<img class="result-image" alt=""><span class="result-name"></span><span class="result-id"></span>';
    const image = button.querySelector(".result-image");
    image.src = "https://render.albiononline.com/v1/item/" + item.UniqueName + ".png?quality=1";
    image.alt = "";
    image.loading = "lazy";
    image.onerror = () => { image.hidden = true; };
    button.querySelector(".result-name").textContent = japaneseName(item);
    button.querySelector(".result-id").textContent = item.UniqueName;
    button.addEventListener("click", () => {
      selectedItem = item;
      showSelectedItem();
      searchInput.value = japaneseName(item);
      results.replaceChildren();
      searchMessage.textContent = japaneseName(item) + " を選択しました。価格を取得しています…";
      loadPrices();
      loadHistory();
    });
    results.append(button);
  }
}

async function searchItems() {
  const term = searchInput.value.trim().toLocaleLowerCase("ja");
  if (!term) {
    searchMessage.textContent = "アイテム名を入力してください。";
    return;
  }
  searchButton.disabled = true;
  searchMessage.textContent = "アイテム一覧を読み込んでいます…";
  try {
    const items = await loadCatalog();
    const matches = items.filter((item) =>
      japaneseName(item).toLocaleLowerCase("ja").includes(term)
      || item.UniqueName.toLowerCase().includes(term)
    );
    showResults(matches);
    searchMessage.textContent = matches.length
      ? "候補 " + matches.length + " 件。アイテムを選択してください。"
      : "一致するアイテムがありません。";
  } catch (error) {
    searchMessage.textContent = error.message + " 時間をおいて再度お試しください。";
  } finally {
    searchButton.disabled = false;
  }
}

function selectedItemId() {
  if (!selectedItem) return null;
  const match = selectedItem.UniqueName.match(/^T[1-8]_(.+?)(?:@\d+)?$/);
  if (!match) return selectedItem.UniqueName;
  const tier = tierSelect.value === "all"
    ? (selectedItem.UniqueName.match(/^T([1-8])_/) || [,"4"])[1]
    : tierSelect.value;
  const enchant = enchantSelect.value === "all"
    ? ((selectedItem.UniqueName.match(/@(\d+)$/) || [,"0"])[1])
    : enchantSelect.value;
  return "T" + tier + "_" + match[1].replace(/@\d+$/, "") + (enchant === "0" ? "" : "@" + enchant);
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function saveFavorites(items) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    searchMessage.textContent = "お気に入りを保存できませんでした。ブラウザの保存設定を確認してください。";
    return false;
  }
}

function currentFavorite() {
  if (!selectedItem) return null;
  return {
    catalogId: selectedItem.UniqueName,
    itemId: selectedItemId(),
    name: japaneseName(selectedItem),
    tier: tierSelect.value,
    enchant: enchantSelect.value,
    quality: qualitySelect.value
  };
}

function isFavorite(item) {
  return readFavorites().some((saved) => saved.itemId === item.itemId);
}

function updateFavoriteButton() {
  if (!favoriteButton) return;
  const item = currentFavorite();
  favoriteButton.disabled = !item;
  favoriteButton.textContent = item && isFavorite(item) ? "★ お気に入り済み" : "☆ お気に入りに追加";
}

function renderFavorites() {
  if (!favoriteList) return;
  favoriteList.replaceChildren();
  const favorites = readFavorites();
  if (!favorites.length) {
    const empty = document.createElement("p");
    empty.className = "favorites-empty";
    empty.textContent = "まだ登録されていません。アイテムを選んで「お気に入りに追加」を押してください。";
    favoriteList.append(empty);
    return;
  }
  for (const saved of favorites) {
    const itemRow = document.createElement("div");
    itemRow.className = "favorite-item";
    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "favorite-load";
    const image = document.createElement("img");
    image.src = "https://render.albiononline.com/v1/item/" + saved.itemId + ".png?quality=" + (saved.quality === "all" ? "1" : saved.quality);
    image.alt = "";
    image.loading = "lazy";
    image.onerror = () => { image.hidden = true; };
    const label = document.createElement("span");
    label.textContent = saved.name + " · " + saved.itemId + " · 品質 " + saved.quality;
    loadButton.append(image, label);
    loadButton.addEventListener("click", async () => {
      try {
        const items = await loadCatalog();
        const found = items.find((entry) => entry.UniqueName === saved.catalogId);
        if (!found) {
          searchMessage.textContent = "このアイテムを一覧から読み込めませんでした。";
          return;
        }
        selectedItem = found;
        tierSelect.value = saved.tier;
        enchantSelect.value = saved.enchant;
        qualitySelect.value = saved.quality;
        searchInput.value = saved.name;
        showSelectedItem();
        updateFavoriteButton();
        searchMessage.textContent = saved.name + " をお気に入りから読み込みました。";
        loadPrices();
        loadHistory();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        searchMessage.textContent = "アイテム一覧を読み込めませんでした。";
      }
    });
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "favorite-remove";
    removeButton.textContent = "削除";
    removeButton.setAttribute("aria-label", saved.name + "をお気に入りから削除");
    removeButton.addEventListener("click", () => {
      saveFavorites(readFavorites().filter((entry) => entry.itemId !== saved.itemId));
      renderFavorites();
      updateFavoriteButton();
    });
    itemRow.append(loadButton, removeButton);
    favoriteList.append(itemRow);
  }
}

function toggleFavorite() {
  const item = currentFavorite();
  if (!item) return;
  const favorites = readFavorites();
  const exists = favorites.some((saved) => saved.itemId === item.itemId);
  const next = exists ? favorites.filter((saved) => saved.itemId !== item.itemId) : [item, ...favorites];
  if (saveFavorites(next)) {
    renderFavorites();
    updateFavoriteButton();
    searchMessage.textContent = exists ? "お気に入りから削除しました。" : "お気に入りに登録しました！";
  }
}

function showSelectedItem() {
  const container = document.querySelector("#selected-item-card");
  if (!container || !selectedItem) return;
  const itemId = selectedItemId();
  const quality = qualitySelect.value === "all" ? "1" : qualitySelect.value;
  const imageUrl = "https://render.albiononline.com/v1/item/" + itemId + ".png?quality=" + quality;
  container.replaceChildren();
  const image = document.createElement("img");
  image.className = "selected-item-image";
  image.src = imageUrl;
  image.alt = japaneseName(selectedItem);
  image.onerror = () => { image.hidden = true; };
  const details = document.createElement("div");
  details.className = "selected-item-details";
  const name = document.createElement("strong");
  name.textContent = japaneseName(selectedItem);
  const id = document.createElement("span");
  id.textContent = itemId;
  details.append(name, id);
  container.append(image, details);
  container.hidden = false;
  updateFavoriteButton();
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseHistoryTimestamp(value) {
  if (typeof value === "number") {
    if (value > 600000000000000000) return new Date((value - 621355968000000000) / 10000);
    if (value > 1000000000000) return new Date(value);
    return new Date(value * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderHistory(payload, range, timeScale) {
  historyChart.replaceChildren();
  historyLegend.replaceChildren();
  const records = Array.isArray(payload) ? payload : (payload.data || payload.series || []);
  const city = historyCity.value;
  const byQuality = new Map();

  for (const record of records) {
    const recordCity = record.location || record.city || record.Location;
    if (recordCity && recordCity.toLowerCase() !== city.toLowerCase()) continue;
    const quality = String(record.quality || record.Quality || "1");
    const points = Array.isArray(record.data) ? record.data : (record.Data || []);
    if (!byQuality.has(quality)) byQuality.set(quality, []);
    for (const point of points) {
      const date = parseHistoryTimestamp(point.timestamp ?? point.Timestamp);
      const price = Number(point.avg_price ?? point.AveragePrice);
      if (!date || !Number.isFinite(price) || price <= 0) continue;
      byQuality.get(quality).push({
        time: date.getTime(),
        price,
        count: Number(point.item_count ?? point.ItemCount ?? 0)
      });
    }
  }

  const now = Date.now();
  const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
  const minTime = now - days * 86400000;
  const series = [...byQuality.entries()].map(([quality, points]) => ({
    quality,
    points: points.filter(point => point.time >= minTime && point.time <= now + 3600000)
      .sort((a,b) => a.time - b.time)
  })).filter(item => item.points.length);

  if (!series.length) {
    historyChart.textContent = "この都市・品質では、期間内の履歴データが見つかりませんでした。";
    historyChart.className = "history-chart history-empty";
    historyMessage.textContent = "未観測の期間があります。データがないことは、取引や注文がなかったことを意味しません。";
    return;
  }

  historyChart.className = "history-chart";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 900 330");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "売り注文の平均価格の履歴グラフ");
  const width = 900, height = 330, left = 78, right = 22, top = 22, bottom = 48;
  const plotW = width - left - right, plotH = height - top - bottom;
  const allPoints = series.flatMap(item => item.points);
  let minPrice = Math.min(...allPoints.map(point => point.price));
  let maxPrice = Math.max(...allPoints.map(point => point.price));
  if (minPrice === maxPrice) { minPrice = Math.max(0, minPrice * 0.9); maxPrice *= 1.1; }
  else { const pad = (maxPrice - minPrice) * 0.12; minPrice = Math.max(0, minPrice - pad); maxPrice += pad; }
  const x = time => left + ((time - minTime) / (now - minTime)) * plotW;
  const y = price => top + ((maxPrice - price) / (maxPrice - minPrice)) * plotH;
  const make = (tag, attrs, parent=svg) => {
    const node = document.createElementNS(svgNS, tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };

  for (let i=0;i<=4;i++) {
    const value = minPrice + (maxPrice-minPrice) * i / 4;
    const yy = y(value);
    make("line",{x1:left,y1:yy,x2:width-right,y2:yy,class:"history-gridline"});
    const label = make("text",{x:left-12,y:yy+4,"text-anchor":"end",class:"history-axis-label"});
    label.textContent = Math.round(value).toLocaleString("en-US");
  }
  const dateFormat = range === "24h"
    ? new Intl.DateTimeFormat("ja-JP",{hour:"2-digit",minute:"2-digit"})
    : new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric"});
  for (let i=0;i<=4;i++) {
    const time = minTime + (now-minTime)*i/4;
    const xx = x(time);
    make("line",{x1:xx,y1:top,x2:xx,y2:height-bottom,class:"history-gridline vertical"});
    const label = make("text",{x:xx,y:height-17,"text-anchor":"middle",class:"history-axis-label"});
    label.textContent = dateFormat.format(new Date(time));
  }

  const qualityNames = {"1":"ノーマル","2":"良好","3":"傑出","4":"エクセレント","5":"最高傑作"};
  for (const item of series) {
    const legend = document.createElement("span");
    legend.className = "history-legend-item quality-" + item.quality;
    const dot = document.createElement("i");
    const textNode = document.createElement("span");
    textNode.textContent = qualityNames[item.quality] || ("品質 " + item.quality);
    legend.append(dot,textNode);
    historyLegend.append(legend);

    const maxGap = timeScale * 3600000 * 2.1;
    let segment = [];
    const segments = [];
    for (const point of item.points) {
      if (segment.length && point.time - segment[segment.length-1].time > maxGap) {
        segments.push(segment);
        segment = [];
      }
      segment.push(point);
    }
    if (segment.length) segments.push(segment);
    for (const group of segments) {
      if (group.length > 1) {
        const d = group.map((point,index) => (index ? "L" : "M") + x(point.time).toFixed(1) + "," + y(point.price).toFixed(1)).join(" ");
        make("path",{d,class:"history-line quality-" + item.quality});
      }
      for (const point of group) {
        const circle = make("circle",{cx:x(point.time),cy:y(point.price),r:3.5,class:"history-point quality-" + item.quality});
        const title = document.createElementNS(svgNS,"title");
        title.textContent = new Date(point.time).toLocaleString("ja-JP") + " · " + Math.round(point.price).toLocaleString("en-US") + " s · 個数 " + (point.count || "不明");
        circle.append(title);
      }
    }
  }
  historyChart.append(svg);
  const observedCount = series.reduce((sum, item) => sum + item.points.length, 0);
  const latestObserved = Math.max(...series.flatMap(item => item.points.map(point => point.time)));
  const latestLabel = new Date(latestObserved).toLocaleString("ja-JP");
  historyMessage.textContent = "取得元：AODP Asia API（実データ） · 観測点 " + observedCount
    + "件 · 最終観測 " + latestLabel
    + "。売り注文の平均価格です（実際の取引成立価格ではありません）。";
}

async function loadHistory() {
  if (!selectedItem || !historyChart) return;
  const requestId = ++historyRequestId;
  const rangeSettings = {
    "24h": {days:1, scale:1},
    "7d": {days:7, scale:6},
    "30d": {days:30, scale:24}
  };
  const settings = rangeSettings[historyRange];
  const end = new Date();
  const start = new Date(end.getTime() - settings.days * 86400000);
  const qualities = qualitySelect.value === "all" ? "1,2,3,4,5" : qualitySelect.value;
  const itemId = selectedItemId();
  historyChart.className = "history-chart history-empty";
  historyChart.textContent = "価格履歴を取得しています…";
  historyLegend.replaceChildren();
  historyMessage.textContent = itemId + " · " + historyCity.value + " · AODP履歴データ";
  try {
    const url = "https://east.albion-online-data.com/api/v2/stats/history/"
      + encodeURIComponent(itemId) + ".json?locations=" + encodeURIComponent(historyCity.value)
      + "&qualities=" + encodeURIComponent(qualities)
      + "&date=" + localDateString(start) + "&end_date=" + localDateString(end)
      + "&time-scale=" + settings.scale;
    const response = await fetch(url);
    if (!response.ok) throw new Error("履歴APIが応答しませんでした（HTTP " + response.status + "）。");
    const payload = await response.json();
    if (requestId !== historyRequestId) return;
    renderHistory(payload, historyRange, settings.scale);
  } catch (error) {
    if (requestId !== historyRequestId) return;
    historyChart.className = "history-chart history-empty";
    historyChart.textContent = error.message + " 少し時間をおいて再度お試しください。";
    historyMessage.textContent = "価格履歴を取得できませんでした。";
  }
}

function formatSilver(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return Math.round(value).toLocaleString("en-US") + " s";
}

function parseDate(value) {
  if (!value || value.startsWith("0001-")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function freshness(date) {
  if (!date) return { label: "未観測", className: "unknown" };
  const minutes = (Date.now() - date.getTime()) / 60000;
  if (minutes <= 30) return { label: "更新 " + Math.max(1, Math.round(minutes)) + "分前", className: "fresh" };
  if (minutes <= 180) return { label: Math.floor(minutes) + "分前", className: "stale" };
  return { label: Math.floor(minutes / 60) + "時間前", className: "stale" };
}

async function loadPrices() {
  if (!selectedItem) return;
  const itemId = selectedItemId();
  showSelectedItem();
  const qualities = qualitySelect.value === "all" ? "1,2,3,4,5" : qualitySelect.value;
  rows.replaceChildren();
  const loading = document.createElement("tr");
  loading.innerHTML = '<td colspan="5">Asiaサーバーの価格データを取得中…</td>';
  rows.append(loading);
  try {
    const url = API_BASE + "/" + encodeURIComponent(itemId) + ".json?locations="
      + encodeURIComponent(CITIES.join(",")) + "&qualities=" + encodeURIComponent(qualities);
    const response = await fetch(url);
    if (!response.ok) throw new Error("価格APIが応答しませんでした（HTTP " + response.status + "）。");
    const data = await response.json();
    const byCity = new Map(data.map((entry) => [entry.city, entry]));
    rows.replaceChildren();
    for (const city of CITIES) {
      const entry = byCity.get(city);
      const tr = document.createElement("tr");
      const latest = entry ? [parseDate(entry.sell_price_min_date), parseDate(entry.buy_price_max_date)]
        .filter(Boolean).sort((a,b) => b-a)[0] : null;
      const state = freshness(latest);
      const sell = entry && Number(entry.sell_price_min) > 0 ? formatSilver(Number(entry.sell_price_min)) : "—";
      const buy = entry && Number(entry.buy_price_max) > 0 ? formatSilver(Number(entry.buy_price_max)) : "—";
      tr.innerHTML = '<td class="city"></td><td class="sell"></td><td class="buy"></td><td class="empty">API非提供</td><td><span class="state"></span></td>';
      tr.querySelector(".city").textContent = city;
      tr.querySelector(".sell").textContent = sell;
      tr.querySelector(".buy").textContent = buy;
      const stateEl = tr.querySelector(".state");
      stateEl.textContent = entry && latest ? state.label : "未観測";
      stateEl.className = "state " + (entry && latest ? state.className : "unknown");
      rows.append(tr);
    }
    searchMessage.textContent = itemId + " の価格を表示中。取得元：AODP Asia API。";
  } catch (error) {
    rows.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = error.message + " データを0として扱わず、未取得のまま表示しています。";
    tr.append(td);
    rows.append(tr);
    searchMessage.textContent = "価格取得に失敗しました。";
  }
}

searchButton.addEventListener("click", searchItems);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchItems();
});
favoriteButton.addEventListener("click", toggleFavorite);
for (const control of [tierSelect, enchantSelect, qualitySelect]) {
  control.addEventListener("change", () => {
    if (selectedItem) {
      showSelectedItem();
      loadPrices();
      loadHistory();
    }
  });
}
historyCity.addEventListener("change", loadHistory);
for (const button of historyRangeButtons) {
  button.addEventListener("click", () => {
    historyRange = button.dataset.historyRange;
    historyRangeButtons.forEach(item => item.classList.toggle("active", item === button));
    loadHistory();
  });
}
renderFavorites();
updateFavoriteButton();