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
    button.innerHTML = '<span class="result-name"></span><span class="result-id"></span>';
    button.querySelector(".result-name").textContent = japaneseName(item);
    button.querySelector(".result-id").textContent = item.UniqueName;
    button.addEventListener("click", () => {
      selectedItem = item;
      searchInput.value = japaneseName(item);
      results.replaceChildren();
      searchMessage.textContent = japaneseName(item) + " を選択しました。価格を取得しています…";
      loadPrices();
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
for (const control of [tierSelect, enchantSelect, qualitySelect]) {
  control.addEventListener("change", () => { if (selectedItem) loadPrices(); });
}