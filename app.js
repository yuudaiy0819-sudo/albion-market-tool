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
const historyQuality = document.querySelector("#history-quality");
const historyCityInputs = document.querySelectorAll("[data-history-city]");
const historyCityAllButton = document.querySelector("#history-city-all");
const historyCityClearButton = document.querySelector("#history-city-clear");
const HISTORY_CITY_COLORS = ["#2563eb", "#0f9f8f", "#d18a22", "#7c65c1", "#d15d76", "#64748b", "#0891b2", "#8b5e34"];
const historyChart = document.querySelector("#history-chart");
const historyVolumeSummary = document.querySelector("#history-volume-summary");
const historyVolumeMessage = document.querySelector("#history-volume-message");
const historyLegend = document.querySelector("#history-legend");
const historyMessage = document.querySelector("#history-message");
const historyRangeButtons = document.querySelectorAll("[data-history-range]");
let historyRange = "24h";
let historyRequestId = 0;
const FAVORITES_KEY = "albion-market-tool-favorites-v1";

const ORDERBOOK_API = "https://east.albion-online-data.com/api/v2/stats/orderbook";
const orderbookGrid = document.querySelector("#orderbook-grid");
const orderbookMessage = document.querySelector("#orderbook-message");
const orderbookQuality = document.querySelector("#orderbook-quality");
const orderbookView = document.querySelector("#orderbook-view");
const orderbookRefresh = document.querySelector("#orderbook-refresh");
const orderbookToggle = document.querySelector("#orderbook-toggle");
const orderbookContent = document.querySelector("#orderbook-content");
let orderbookRequestId = 0;
let latestOrderbookPayload = null;
let latestOrderbookItemId = "";
let latestOrderbookQuality = "";

function orderbookArray(record, keys) {
  for (const key of keys) {
    if (Array.isArray(record?.[key])) return record[key];
  }
  return [];
}

function orderbookAmount(order) {
  const value = order?.amount ?? order?.quantity ?? order?.volume ?? order?.count;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function renderOrderLevels(container, orders, side) {
  const sorted = [...orders].filter(order => Number(order?.price) > 0 && orderbookAmount(order) !== null)
    .sort((a, b) => side === "sell" ? Number(a.price) - Number(b.price) : Number(b.price) - Number(a.price));
  const visible = sorted.slice(0, 5);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "orderbook-empty";
    empty.textContent = orders.length ? "数量データなし" : "注文データなし";
    container.append(empty);
    return;
  }
  let visibleTotal = 0;
  const allTotal = sorted.reduce((sum, order) => sum + orderbookAmount(order), 0);
  for (const order of visible) {
    const amount = orderbookAmount(order);
    visibleTotal += amount;
    const row = document.createElement("div");
    row.className = "orderbook-level";
    const price = document.createElement("span");
    price.textContent = formatSilver(Number(order.price));
    const quantity = document.createElement("strong");
    quantity.textContent = Math.round(amount).toLocaleString("ja-JP") + " 個";
    row.append(price, quantity);
    container.append(row);
  }
  const totalRow = document.createElement("div");
  totalRow.className = "orderbook-total";
  totalRow.textContent = "全価格帯合計：" + Math.round(allTotal).toLocaleString("ja-JP") + " 個 · " + sorted.length.toLocaleString("ja-JP") + " 価格帯（上位5価格帯：" + Math.round(visibleTotal).toLocaleString("ja-JP") + " 個）";
  container.append(totalRow);
}

function renderOrderbook(payload, itemId, quality) {
  const records = Array.isArray(payload) ? payload : (payload?.data || payload?.orderbooks || payload?.orderBooks || []);
  orderbookGrid.replaceChildren();
  if (!Array.isArray(records) || !records.length) {
    orderbookGrid.className = "orderbook-grid orderbook-empty-state";
    orderbookGrid.textContent = "このアイテム・品質の注文板データは見つかりませんでした。";
    return;
  }
  orderbookGrid.className = "orderbook-grid";
  const byCity = new Map(records.map(record => [record.location || record.city || record.Location, record]));
  let rendered = 0;
  for (const city of CITIES) {
    const record = byCity.get(city);
    const card = document.createElement("article");
    card.className = "orderbook-city-card";
    const heading = document.createElement("h3");
    heading.textContent = city;
    card.append(heading);
    if (!record) {
      const missing = document.createElement("p");
      missing.className = "orderbook-empty";
      missing.textContent = "データなし";
      card.append(missing);
      orderbookGrid.append(card);
      continue;
    }
    rendered++;
    const mode = orderbookView ? orderbookView.value : "sell";
    const columns = document.createElement("div");
    columns.className = "orderbook-sides" + (mode === "both" ? "" : " single");
    if (mode === "sell" || mode === "both") {
      const sellSide = document.createElement("section");
      sellSide.className = "orderbook-side sell";
      const sellTitle = document.createElement("h4");
      sellTitle.textContent = "売り注文（安い順）";
      const sellLevels = document.createElement("div");
      sellLevels.className = "orderbook-levels";
      renderOrderLevels(sellLevels, orderbookArray(record, ["sell_orders", "sellOrders", "asks", "sell"]), "sell");
      sellSide.append(sellTitle, sellLevels);
      columns.append(sellSide);
    }
    if (mode === "buy" || mode === "both") {
      const buySide = document.createElement("section");
      buySide.className = "orderbook-side buy";
      const buyTitle = document.createElement("h4");
      buyTitle.textContent = "買い注文（高い順）";
      const buyLevels = document.createElement("div");
      buyLevels.className = "orderbook-levels";
      renderOrderLevels(buyLevels, orderbookArray(record, ["buy_orders", "buyOrders", "bids", "buy"]), "buy");
      buySide.append(buyTitle, buyLevels);
      columns.append(buySide);
    }
    card.append(columns);
    orderbookGrid.append(card);
  }
  orderbookMessage.textContent = rendered + "都市の注文板を表示中 · " + itemId + " · 品質 " + quality
    + "。各側は上位5価格帯。数量は取得時点の注文板スナップショットです。";
}

async function loadOrderbook() {
  if (!selectedItem || !orderbookGrid || !orderbookQuality) return;
  const requestId = ++orderbookRequestId;
  const itemId = selectedItemId();
  const quality = orderbookQuality.value;
  orderbookRefresh.disabled = true;
  orderbookMessage.textContent = "注文板を取得しています…";
  orderbookGrid.className = "orderbook-grid orderbook-empty-state";
  orderbookGrid.textContent = "読み込み中…";
  try {
    const url = ORDERBOOK_API + "/" + encodeURIComponent(itemId) + ".json?locations="
      + encodeURIComponent(CITIES.join(",")) + "&qualities=" + encodeURIComponent(quality);
    const response = await fetch(url);
    if (!response.ok) throw new Error("注文板APIが応答しませんでした（HTTP " + response.status + "）。");
    const payload = await response.json();
    if (requestId !== orderbookRequestId) return;
    latestOrderbookPayload = payload;
    latestOrderbookItemId = itemId;
    latestOrderbookQuality = quality;
    renderOrderbook(payload, itemId, quality);
  } catch (error) {
    if (requestId !== orderbookRequestId) return;
    orderbookGrid.className = "orderbook-grid orderbook-empty-state";
    orderbookGrid.textContent = error.message + " 時間をおいて再度お試しください。";
    orderbookMessage.textContent = "注文板の取得に失敗しました。";
  } finally {
    if (requestId === orderbookRequestId) orderbookRefresh.disabled = false;
  }
}

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
      loadOrderbook();
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
        loadOrderbook();
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
      refreshFavoriteDashboard();
      refreshFavoriteMovement();
    });
    itemRow.append(loadButton, removeButton);
    favoriteList.append(itemRow);
  }
}


const FAVORITE_PRICE_HISTORY_KEY = "albion-market-tool-favorite-price-history-v1";
const favoriteDashboardRows = document.querySelector("#favorite-dashboard-rows");
const favoriteDashboardStatus = document.querySelector("#favorite-dashboard-status");
const favoriteDashboardRefresh = document.querySelector("#favorite-dashboard-refresh");
const favoriteMovementRows = document.querySelector("#favorite-movement-rows");
const favoriteMovementStatus = document.querySelector("#favorite-movement-status");
const favoriteMovementRange = document.querySelector("#favorite-movement-range");
const favoriteMovementSort = document.querySelector("#favorite-movement-sort");
const favoriteMovementRefresh = document.querySelector("#favorite-movement-refresh");
let favoriteMovementRequestId = 0;
const favoriteDashboardSort = document.querySelector("#favorite-dashboard-sort");

function readFavoritePriceHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_PRICE_HISTORY_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveFavoritePriceHistory(history) {
  try {
    localStorage.setItem(FAVORITE_PRICE_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    if (favoriteDashboardStatus) favoriteDashboardStatus.textContent = "価格比較は表示できますが、前回比を保存できませんでした。";
  }
}

function dashboardCell(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

async function openFavoriteFromDashboard(saved) {
  try {
    const items = await loadCatalog();
    const found = items.find(entry => entry.UniqueName === saved.catalogId);
    if (!found) throw new Error("アイテムが見つかりませんでした。");
    selectedItem = found;
    tierSelect.value = saved.tier;
    enchantSelect.value = saved.enchant;
    qualitySelect.value = saved.quality;
    searchInput.value = saved.name;
    showSelectedItem();
    updateFavoriteButton();
    loadPrices();
    loadHistory();
    loadOrderbook();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    favoriteDashboardStatus.textContent = error.message;
  }
}

function renderFavoriteDashboardRow(saved, index) {
  const tr = document.createElement("tr");
  const itemCell = document.createElement("td");
  const itemWrap = document.createElement("div");
  itemWrap.className = "favorite-dashboard-item";
  const image = document.createElement("img");
  image.src = "https://render.albiononline.com/v1/item/" + saved.itemId + ".png?quality=" + (saved.quality === "all" ? "1" : saved.quality);
  image.alt = "";
  image.loading = "lazy";
  image.onerror = () => { image.hidden = true; };
  const itemText = document.createElement("div");
  const name = document.createElement("button");
  name.type = "button";
  name.className = "favorite-dashboard-name";
  name.textContent = saved.name;
  name.addEventListener("click", () => openFavoriteFromDashboard(saved));
  const id = document.createElement("span");
  id.className = "favorite-dashboard-id";
  id.textContent = saved.itemId + " · 品質 " + saved.quality;
  itemText.append(name, id);
  itemWrap.append(image, itemText);
  itemCell.append(itemWrap);
  tr.append(itemCell);
  for (let i = 0; i < 5; i++) tr.append(dashboardCell(i === 4 ? "取得中…" : "—"));
  favoriteDashboardRows.append(tr);
  return tr;
}

function setDashboardPriceCell(cell, price, city, quality) {
  cell.replaceChildren();
  if (!price) {
    cell.textContent = "—";
    return;
  }
  const amount = document.createElement("strong");
  amount.className = "favorite-dashboard-price";
  amount.textContent = formatSilver(price.value);
  const detail = document.createElement("span");
  detail.className = "favorite-dashboard-city";
  detail.textContent = city + (quality ? " · Q" + quality : "");
  cell.append(amount, detail);
}

function sortFavoriteMovementRows() {
  if (!favoriteMovementRows) return;
  const mode = favoriteMovementSort ? favoriteMovementSort.value : "up";
  const rows = Array.from(favoriteMovementRows.querySelectorAll("tr"));
  rows.sort((a,b) => {
    const av=Number(a.dataset.changePct), bv=Number(b.dataset.changePct), aa=Number(a.dataset.changeAmount), ba=Number(b.dataset.changeAmount);
    const va=a.dataset.valid==="1", vb=b.dataset.valid==="1"; if(va!==vb)return va?-1:1; if(!va)return Number(a.dataset.index||0)-Number(b.dataset.index||0);
    if(mode==="down")return av-bv; if(mode==="absolute")return Math.abs(bv)-Math.abs(av); if(mode==="amount")return Math.abs(ba)-Math.abs(aa); return bv-av;
  }); rows.forEach(row=>favoriteMovementRows.append(row));
}
function makeFavoriteMovementRow(saved,index) {
  const tr=document.createElement("tr"); tr.dataset.index=String(index); const td=document.createElement("td"); const wrap=document.createElement("div"); wrap.className="favorite-dashboard-item";
  const img=document.createElement("img"); img.src="https://render.albiononline.com/v1/item/"+saved.itemId+".png?quality="+(saved.quality==="all"?"1":saved.quality); img.alt=""; img.loading="lazy"; img.onerror=()=>{img.hidden=true;};
  const info=document.createElement("div"); const name=document.createElement("button"); name.type="button"; name.className="favorite-dashboard-name"; name.textContent=saved.name; name.addEventListener("click",()=>openFavoriteFromDashboard(saved));
  const meta=document.createElement("span"); meta.className="favorite-dashboard-id"; meta.textContent=saved.itemId+" · 品質 "+saved.quality; info.append(name,meta); wrap.append(img,info); td.append(wrap); tr.append(td);
  for(let i=0;i<4;i++){const cell=document.createElement("td");cell.textContent=i===3?"取得中…":"—";tr.append(cell);} favoriteMovementRows.append(tr); return tr;
}
async function refreshFavoriteMovement() {
  if(!favoriteMovementRows||!favoriteMovementStatus||!favoriteMovementRefresh)return;
  const requestId=++favoriteMovementRequestId; const favorites=readFavorites(); favoriteMovementRows.replaceChildren();
  if(!favorites.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent="お気に入りを登録するとランキングを表示します。";tr.append(td);favoriteMovementRows.append(tr);favoriteMovementStatus.textContent="お気に入りはまだ登録されていません。";return;}
  favoriteMovementRefresh.disabled=true; const range=favoriteMovementRange?favoriteMovementRange.value:"24h";
  const cfg={"1h":{days:1/24,scale:1},"24h":{days:1,scale:1},"7d":{days:7,scale:6}}[range]; const end=new Date(),start=new Date(end.getTime()-cfg.days*86400000);
  const rows=favorites.map((saved,index)=>makeFavoriteMovementRow(saved,index)); favoriteMovementStatus.textContent=favorites.length+"件のお気に入りを確認中…"; let next=0,done=0;
  const worker=async()=>{while(next<favorites.length){const index=next++,saved=favorites[index],tr=rows[index];try{
    const qualities=saved.quality==="all"?"1,2,3,4,5":saved.quality;
    const url="https://east.albion-online-data.com/api/v2/stats/history/"+encodeURIComponent(saved.itemId)+".json?locations="+encodeURIComponent(CITIES.join(","))+"&qualities="+encodeURIComponent(qualities)+"&date="+localDateString(start)+"&end_date="+localDateString(end)+"&time-scale="+cfg.scale;
    const response=await fetch(url);if(!response.ok)throw new Error("HTTP "+response.status);const payload=await response.json();const records=Array.isArray(payload)?payload:(payload.data||payload.series||[]);const candidates=[];
    for(const record of records){const city=record.location||record.city||record.Location;if(!CITIES.includes(city))continue;const quality=String(record.quality||record.Quality||"1");if(saved.quality!=="all"&&quality!==String(saved.quality))continue;
      const points=Array.isArray(record.data)?record.data:(record.Data||[]);const clean=points.map(p=>({time:parseHistoryTimestamp(p.timestamp??p.Timestamp),price:Number(p.avg_price??p.AveragePrice)})).filter(p=>p.time&&Number.isFinite(p.price)&&p.price>0&&p.time>=start&&p.time<=end).sort((a,b)=>a.time-b.time);
      if(clean.length>=2)candidates.push({city,quality,first:clean[0],last:clean[clean.length-1]});}
    candidates.sort((a,b)=>b.last.time-a.last.time);const best=candidates[0];
    if(!best){tr.children[4].textContent="比較データなし";tr.children[4].className="favorite-movement-missing";}
    else{const change=best.last.price-best.first.price,pct=change/best.first.price*100;tr.dataset.valid="1";tr.dataset.changePct=String(pct);tr.dataset.changeAmount=String(change);
      tr.children[1].textContent=Math.round(best.first.price).toLocaleString("ja-JP")+" → "+Math.round(best.last.price).toLocaleString("ja-JP")+" s";
      tr.children[2].textContent=(change>0?"+":change<0?"−":"±")+Math.round(Math.abs(change)).toLocaleString("ja-JP")+" s";tr.children[2].className="favorite-movement-change "+(change>0?"up":change<0?"down":"neutral");
      tr.children[3].textContent=(pct>0?"+":"")+pct.toFixed(2)+"%";tr.children[3].className="favorite-movement-change "+(pct>0?"up":pct<0?"down":"neutral");
      const state=freshness(best.last.time),badge=document.createElement("span");badge.className="state "+state.className;badge.textContent=state.label+" · "+best.city+" Q"+best.quality;tr.children[4].replaceChildren(badge);}
  }catch(error){tr.children[4].textContent="取得失敗";tr.children[4].className="favorite-movement-missing";tr.children[3].textContent=error.message;}
  done++;favoriteMovementStatus.textContent=done+" / "+favorites.length+" 件を確認しました。";}};
  await Promise.all(Array.from({length:Math.min(3,favorites.length)},worker));if(requestId!==favoriteMovementRequestId)return;sortFavoriteMovementRows();
  const count=rows.filter(row=>row.dataset.valid==="1").length;favoriteMovementStatus.textContent=favorites.length+"件中 "+count+"件を比較できました。比較対象は同じ都市・品質の売り注文平均価格です。";favoriteMovementRefresh.disabled=false;
}
function sortFavoriteDashboardRows() {
  if (!favoriteDashboardRows) return;
  const mode = favoriteDashboardSort ? favoriteDashboardSort.value : "default";
  const rows = Array.from(favoriteDashboardRows.querySelectorAll("tr"));
  rows.sort((a, b) => {
    if (mode === "default") return Number(a.dataset.favoriteIndex || 0) - Number(b.dataset.favoriteIndex || 0);
    const key = mode === "sell" ? "sell" : mode === "buy" ? "buy" : "spread";
    const aRaw = a.dataset[key];
    const bRaw = b.dataset[key];
    const av = Number(aRaw);
    const bv = Number(bRaw);
    const aValid = aRaw !== "" && Number.isFinite(av);
    const bValid = bRaw !== "" && Number.isFinite(bv);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (!aValid) return Number(a.dataset.favoriteIndex || 0) - Number(b.dataset.favoriteIndex || 0);
    return mode === "sell" ? av - bv : bv - av;
  });
  rows.forEach(row => favoriteDashboardRows.append(row));
}

async function refreshFavoriteDashboard() {
  if (!favoriteDashboardRows || !favoriteDashboardStatus) return;
  const favorites = readFavorites();
  favoriteDashboardRows.replaceChildren();
  if (!favorites.length) {
    favoriteDashboardRows.append(dashboardCell("お気に入りを登録すると、都市別の価格をまとめて表示します。", "empty"));
    favoriteDashboardRows.firstChild.colSpan = 6;
    favoriteDashboardStatus.textContent = "お気に入りはまだ登録されていません。";
    return;
  }
  favoriteDashboardRefresh.disabled = true;
  favoriteDashboardStatus.textContent = favorites.length + "件のお気に入り価格を取得しています…";
  const history = readFavoritePriceHistory();
  const rowsByIndex = favorites.map((saved, index) => renderFavoriteDashboardRow(saved, index));
  rowsByIndex.forEach((row, index) => { row.dataset.favoriteIndex = String(index); });
  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < favorites.length) {
      const index = nextIndex++;
      const saved = favorites[index];
      const tr = rowsByIndex[index];
      try {
        const qualities = saved.quality === "all" ? "1,2,3,4,5" : saved.quality;
        const url = API_BASE + "/" + encodeURIComponent(saved.itemId) + ".json?locations="
          + encodeURIComponent(CITIES.join(",")) + "&qualities=" + encodeURIComponent(qualities);
        const response = await fetch(url);
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        const valid = data.filter(entry => CITIES.includes(entry.city));
        const sells = valid.filter(entry => Number(entry.sell_price_min) > 0)
          .map(entry => ({ value:Number(entry.sell_price_min), city:entry.city, quality:entry.quality, date:parseDate(entry.sell_price_min_date) }))
          .sort((x,y) => x.value-y.value);
        const buys = valid.filter(entry => Number(entry.buy_price_max) > 0)
          .map(entry => ({ value:Number(entry.buy_price_max), city:entry.city, quality:entry.quality, date:parseDate(entry.buy_price_max_date) }))
          .sort((x,y) => y.value-x.value);
        const bestSell = sells[0] || null;
        const bestBuy = buys[0] || null;
        const spread = bestSell && bestBuy ? bestBuy.value-bestSell.value : null;
        tr.dataset.sell = bestSell ? String(bestSell.value) : "";
        tr.dataset.buy = bestBuy ? String(bestBuy.value) : "";
        tr.dataset.spread = spread === null ? "" : String(spread);
        const priceCell = tr.children[1];
        const buyCell = tr.children[2];
        const spreadCell = tr.children[3];
        const changeCell = tr.children[4];
        const stateCell = tr.children[5];
        setDashboardPriceCell(priceCell,bestSell,bestSell?.city,bestSell?.quality);
        setDashboardPriceCell(buyCell,bestBuy,bestBuy?.city,bestBuy?.quality);
        spreadCell.className = "favorite-dashboard-spread";
        spreadCell.textContent = spread === null ? "—" : (spread >= 0 ? "+" : "−") + formatSilver(Math.abs(spread));
        if (bestSell) {
          const key = saved.itemId + "|" + saved.quality + "|" + bestSell.city + "|sell";
          const previous = history[key];
          if (previous && Number.isFinite(Number(previous.value))) {
            const delta = bestSell.value-Number(previous.value);
            changeCell.className = "favorite-dashboard-change " + (delta < 0 ? "down" : delta > 0 ? "up" : "neutral");
            changeCell.textContent = (delta > 0 ? "▲ +" : delta < 0 ? "▼ −" : "± ") + formatSilver(Math.abs(delta));
          } else {
            changeCell.className = "favorite-dashboard-change neutral";
            changeCell.textContent = "比較データなし";
          }
        } else {
          changeCell.className = "favorite-dashboard-change neutral";
          changeCell.textContent = "未観測";
        }
        const dates = [bestSell?.date,bestBuy?.date].filter(Boolean).sort((x,y)=>y-x);
        const state = freshness(dates[0] || null);
        stateCell.innerHTML = "";
        const badge = document.createElement("span");
        badge.className = "state " + state.className;
        badge.textContent = bestSell || bestBuy ? state.label : "未観測";
        stateCell.append(badge);
        for (const entry of valid) {
          for (const side of ["sell","buy"]) {
            const value = Number(side === "sell" ? entry.sell_price_min : entry.buy_price_max);
            const date = parseDate(side === "sell" ? entry.sell_price_min_date : entry.buy_price_max_date);
            if (value > 0) history[saved.itemId + "|" + saved.quality + "|" + entry.city + "|" + side] = { value, date:date ? date.toISOString() : null, checkedAt:Date.now() };
          }
        }
      } catch (error) {
        tr.children[5].textContent = "取得失敗";
        tr.children[5].className = "state unknown";
        tr.children[4].textContent = error.message;
      }
      completed++;
      favoriteDashboardStatus.textContent = completed + " / " + favorites.length + " 件の価格を確認しました。前回比はこの端末での前回チェックとの比較です。";
    }
  };
  await Promise.all(Array.from({length:Math.min(4,favorites.length)},worker));
  saveFavoritePriceHistory(history);
  sortFavoriteDashboardRows();
  favoriteDashboardStatus.textContent = favorites.length + "件の価格を確認しました。前回比はこの端末での前回チェックとの比較です。";
  favoriteDashboardRefresh.disabled = false;
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
    refreshFavoriteDashboard();
    refreshFavoriteMovement();
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
  updateMonitorItemDisplay();
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

function selectedHistoryCities() {
  return [...historyCityInputs].filter(input => input.checked).map(input => input.dataset.historyCity);
}


function renderVolumeSummary(series, range) {
  if (!historyVolumeSummary || !historyVolumeMessage) return;
  historyVolumeSummary.replaceChildren();
  const totals = series.map(item => {
    const knownPoints = item.points.filter(point => point.countKnown);
    return {
      city: item.city,
      count: knownPoints.length ? knownPoints.reduce((sum, point) => sum + point.count, 0) : null,
      buckets: knownPoints.length
    };
  }).sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
  const available = totals.filter(item => item.count !== null);
  if (!available.length) {
    historyVolumeSummary.textContent = "この期間の数量データはありません。";
    historyVolumeSummary.className = "history-volume-summary history-empty";
    historyVolumeMessage.textContent = "数量が未提供・未観測の場合は0個とせず、データなしとして表示します。";
    return;
  }
  historyVolumeSummary.className = "history-volume-summary";
  const max = Math.max(1, ...available.map(item => item.count));
  for (const item of totals) {
    const row = document.createElement("div");
    row.className = "history-volume-row";
    const city = document.createElement("strong");
    city.className = "history-volume-city";
    city.textContent = item.city;
    const track = document.createElement("div");
    track.className = "history-volume-track";
    const bar = document.createElement("span");
    bar.className = "history-volume-bar";
    bar.style.width = item.count === null ? "0%" : Math.max(item.count > 0 ? 1 : 0, item.count / max * 100) + "%";
    track.append(bar);
    const amount = document.createElement("span");
    amount.className = "history-volume-count";
    amount.textContent = item.count === null ? "データなし" : Math.round(item.count).toLocaleString("ja-JP") + " 個";
    row.append(city, track, amount);
    historyVolumeSummary.append(row);
  }
  const granularity = range === "1h" || range === "24h" ? "1時間ごと" : range === "7d" ? "6時間ごと" : "24時間ごと";
  historyVolumeMessage.textContent = "AODP履歴の item_count を集計 · " + granularity
    + "の数量を期間内で合計 · 品質 " + (historyQuality.value === "all" ? "全品質" : historyQuality.value)
    + "。全取引の完全な記録ではなく、AODPに届いた観測データに基づく目安です。";
}

function renderHistory(payload, range, timeScale) {
  historyChart.replaceChildren();
  historyLegend.replaceChildren();
  const records = Array.isArray(payload) ? payload : (payload.data || payload.series || []);
  const selectedCities = selectedHistoryCities();
  const selectedQuality = historyQuality.value;
  const byCity = new Map(selectedCities.map(city => [city, new Map()]));

  for (const record of records) {
    const recordCity = record.location || record.city || record.Location;
    if (!recordCity || !byCity.has(recordCity)) continue;
    const quality = String(record.quality || record.Quality || "1");
    if (selectedQuality !== "all" && quality !== selectedQuality) continue;
    const points = Array.isArray(record.data) ? record.data : (record.Data || []);
    const cityPoints = byCity.get(recordCity);
    for (const point of points) {
      const date = parseHistoryTimestamp(point.timestamp ?? point.Timestamp);
      const price = Number(point.avg_price ?? point.AveragePrice);
      if (!date || !Number.isFinite(price) || price <= 0) continue;
      const rawCount = point.item_count ?? point.ItemCount;
      const countValue = rawCount == null ? null : Number(rawCount);
      const countKnown = countValue !== null && Number.isFinite(countValue) && countValue >= 0;
      const weight = countKnown && countValue > 0 ? countValue : 1;
      const time = date.getTime();
      if (!cityPoints.has(time)) cityPoints.set(time, { weightedPrice: 0, weight: 0, count: 0, countKnown: false });
      const aggregate = cityPoints.get(time);
      aggregate.weightedPrice += price * weight;
      aggregate.weight += weight;
      if (countKnown) {
        aggregate.count += countValue;
        aggregate.countKnown = true;
      }
    }
  }

  const now = Date.now();
  const days = range === "1h" ? 1 / 24 : range === "24h" ? 1 : range === "7d" ? 7 : 30;
  const minTime = now - days * 86400000;
  const series = [...byCity.entries()].map(([city, points], cityIndex) => ({
    city,
    cityIndex,
    points: [...points.entries()]
      .map(([time, value]) => ({ time, price: value.weightedPrice / value.weight, count: value.count, countKnown: value.countKnown }))
      .filter(point => point.time >= minTime && point.time <= now + 3600000)
      .sort((a,b) => a.time - b.time)
  })).filter(item => item.points.length);

  if (!selectedCities.length) {
    historyChart.textContent = "比較する都市を1つ以上選択してください。";
    historyChart.className = "history-chart history-empty";
    historyMessage.textContent = "都市のチェックを入れると価格履歴を表示します。";
    renderVolumeSummary([], historyRange);
    return;
  }
  if (!series.length) {
    historyChart.textContent = "選択した都市・品質では、期間内の履歴データが見つかりませんでした。";
    historyChart.className = "history-chart history-empty";
    historyMessage.textContent = "未観測の期間があります。データがないことは、取引や注文がなかったことを意味しません。";
    renderVolumeSummary([], range);
    return;
  }

  historyChart.className = "history-chart";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 900 330");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "都市別の売り注文平均価格の履歴比較グラフ");
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
  const dateFormat = range === "24h" || range === "1h"
    ? new Intl.DateTimeFormat("ja-JP",{hour:"2-digit",minute:"2-digit"})
    : new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric"});
  for (let i=0;i<=4;i++) {
    const time = minTime + (now-minTime)*i/4;
    const xx = x(time);
    make("line",{x1:xx,y1:top,x2:xx,y2:height-bottom,class:"history-gridline vertical"});
    const label = make("text",{x:xx,y:height-17,"text-anchor":"middle",class:"history-axis-label"});
    label.textContent = dateFormat.format(new Date(time));
  }

  for (const item of series) {
    const color = HISTORY_CITY_COLORS[item.cityIndex % HISTORY_CITY_COLORS.length];
    const legend = document.createElement("span");
    legend.className = "history-legend-item";
    const dot = document.createElement("i");
    dot.style.backgroundColor = color;
    const textNode = document.createElement("span");
    textNode.textContent = item.city;
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
        make("path",{d,class:"history-line",style:"stroke:" + color});
      }
      for (const point of group) {
        const circle = make("circle",{cx:x(point.time),cy:y(point.price),r:3.5,class:"history-point",style:"fill:" + color + ";stroke:#fff"});
        const title = document.createElementNS(svgNS,"title");
        title.textContent = new Date(point.time).toLocaleString("ja-JP") + " · " + Math.round(point.price).toLocaleString("en-US") + " s · 件数 " + (point.count || "不明");
        circle.append(title);
      }
    }
  }
  historyChart.append(svg);
  renderVolumeSummary(series, range);
  const observedCount = series.reduce((sum, item) => sum + item.points.length, 0);
  const latestObserved = Math.max(...series.flatMap(item => item.points.map(point => point.time)));
  const latestLabel = new Date(latestObserved).toLocaleString("ja-JP");
  const qualityLabel = selectedQuality === "all" ? "全品質（品質ごとの観測件数で加重平均）" : "品質 " + selectedQuality;
  historyMessage.textContent = "取得元：AODP Asia API（実データ） · " + qualityLabel
    + " · 観測点 " + observedCount + "件 · 最終観測 " + latestLabel
    + "。売り注文の平均価格です（実際の取引成立価格ではありません）。";
}

async function loadHistory() {
  if (!selectedItem || !historyChart) return;
  const requestId = ++historyRequestId;
  const cities = selectedHistoryCities();
  const rangeSettings = {
    "1h": {days:1/24, scale:1},
    "24h": {days:1, scale:1},
    "7d": {days:7, scale:6},
    "30d": {days:30, scale:24}
  };
  const settings = rangeSettings[historyRange];
  const end = new Date();
  const start = new Date(end.getTime() - settings.days * 86400000);
  const qualities = historyQuality.value === "all" ? "1,2,3,4,5" : historyQuality.value;
  const itemId = selectedItemId();
  historyChart.className = "history-chart history-empty";
  historyChart.textContent = "価格履歴を取得しています…";
  if (historyVolumeSummary) { historyVolumeSummary.textContent = "数量データを取得しています…"; historyVolumeSummary.className = "history-volume-summary history-empty"; }
  if (historyVolumeMessage) historyVolumeMessage.textContent = "";
  historyLegend.replaceChildren();
  if (!cities.length) {
    historyChart.textContent = "比較する都市を1つ以上選択してください。";
    historyMessage.textContent = "都市のチェックを入れると価格履歴を表示します。";
    return;
  }
  historyMessage.textContent = itemId + " · " + cities.join(", ") + " · AODP履歴データ";
  try {
    const url = "https://east.albion-online-data.com/api/v2/stats/history/"
      + encodeURIComponent(itemId) + ".json?locations=" + encodeURIComponent(cities.join(","))
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
      loadOrderbook();
    }
  });
}
orderbookQuality.addEventListener("change", loadOrderbook);
orderbookView.addEventListener("change", () => {
  if (latestOrderbookPayload) renderOrderbook(latestOrderbookPayload, latestOrderbookItemId, latestOrderbookQuality);
});
orderbookRefresh.addEventListener("click", loadOrderbook);
historyQuality.addEventListener("change", loadHistory);
for (const input of historyCityInputs) input.addEventListener("change", loadHistory);
historyCityAllButton.addEventListener("click", () => {
  historyCityInputs.forEach(input => { input.checked = true; });
  loadHistory();
});
historyCityClearButton.addEventListener("click", () => {
  historyCityInputs.forEach(input => { input.checked = false; });
  loadHistory();
});
for (const button of historyRangeButtons) {
  button.addEventListener("click", () => {
    historyRange = button.dataset.historyRange;
    historyRangeButtons.forEach(item => item.classList.toggle("active", item === button));
    loadHistory();
  });
}
renderFavorites();
updateFavoriteButton();
refreshFavoriteDashboard();
favoriteDashboardRefresh.addEventListener("click", refreshFavoriteDashboard);
if(favoriteMovementRefresh)favoriteMovementRefresh.addEventListener("click",refreshFavoriteMovement);
if(favoriteMovementRange)favoriteMovementRange.addEventListener("change",refreshFavoriteMovement);
if(favoriteMovementSort)favoriteMovementSort.addEventListener("change",sortFavoriteMovementRows);
refreshFavoriteMovement();
if (favoriteDashboardSort) favoriteDashboardSort.addEventListener("change", sortFavoriteDashboardRows);

// Cloudflare-hosted market monitor. The admin token stays in memory only.
const MONITOR_API = "https://albion-market-tool.yuudai-y0819.workers.dev";
let monitorAdminToken = "";
const MONITOR_TOKEN_STORAGE_KEY = "albionMarketMonitorAdminToken";
const monitorRememberInput = document.querySelector("#monitor-remember");
const monitorTokenInput = document.querySelector("#monitor-token");
const monitorConnectButton = document.querySelector("#monitor-connect");
const monitorStatus = document.querySelector("#monitor-status");
const monitorMessage = document.querySelector("#monitor-message");
const monitorAddButton = document.querySelector("#monitor-add-rule");
const monitorRefreshButton = document.querySelector("#monitor-refresh");
const monitorPollButton = document.querySelector("#monitor-poll-now");
const monitorTestSpreadButton = document.querySelector("#monitor-test-spread");
const monitorRulesContainer = document.querySelector("#monitor-rules");
const alertHistoryFilter = document.querySelector("#alert-history-filter");
const alertHistoryRefreshButton = document.querySelector("#alert-history-refresh");
const alertHistoryMessage = document.querySelector("#alert-history-message");
const alertHistoryList = document.querySelector("#alert-history-list");

function updateMonitorItemDisplay() {
  const name = document.querySelector("#monitor-item-name");
  const id = document.querySelector("#monitor-item-id");
  if (!name || !id) return;
  if (!selectedItem) {
    name.textContent = "上のアイテム検索から選択してください";
    id.textContent = "";
    monitorAddButton.disabled = !monitorAdminToken;
    return;
  }
  name.textContent = japaneseName(selectedItem);
  id.textContent = selectedItemId();
  monitorAddButton.disabled = !monitorAdminToken;
}

async function monitorRequest(path, options = {}) {
  const headers = {
    "authorization": "Bearer " + monitorAdminToken,
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(MONITOR_API + path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Worker API error (HTTP " + response.status + ")");
  }
  return payload;
}

function setMonitorConnected(connected, state = "idle") {
  monitorStatus.textContent = connected ? "接続済み" : state === "loading" ? "接続中…" : state === "error" ? "接続失敗" : "未接続";
  monitorStatus.className = "state " + (connected ? "fresh" : state === "error" ? "stale" : "unknown");
  monitorAddButton.disabled = !connected || !selectedItem;
  monitorRefreshButton.disabled = !connected;
  monitorPollButton.disabled = !connected;
  monitorTestSpreadButton.disabled = !connected;
  if (alertHistoryRefreshButton) alertHistoryRefreshButton.disabled = !connected;
  monitorConnectButton.classList.remove("is-loading", "is-connected", "is-error");
  if (state === "loading") {
    monitorConnectButton.textContent = "接続中…";
    monitorConnectButton.classList.add("is-loading");
  } else if (connected) {
    monitorConnectButton.textContent = "接続済み";
    monitorConnectButton.classList.add("is-connected");
  } else if (state === "error") {
    monitorConnectButton.textContent = "再接続";
    monitorConnectButton.classList.add("is-error");
  } else {
    monitorConnectButton.textContent = "接続";
  }
}

function formatAlertDate(value) {
  if (!value) return "日時不明";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function refreshAlertHistory() {
  if (!alertHistoryList) return;
  alertHistoryRefreshButton.disabled = true;
  alertHistoryMessage.textContent = "通知履歴を読み込んでいます…";
  try {
    const type = alertHistoryFilter.value;
    const query = type === "all" ? "" : "?type=" + encodeURIComponent(type);
    const payload = await monitorRequest("/admin/alert-events" + query);
    alertHistoryList.replaceChildren();
    const events = payload.events || [];
    if (!events.length) {
      alertHistoryMessage.textContent = "該当する通知履歴はありません。";
      return;
    }
    alertHistoryMessage.textContent = events.length + "件の通知を表示しています（最大100件）。";
    for (const event of events) {
      const card = document.createElement("article");
      card.className = "alert-history-item";
      const top = document.createElement("div");
      top.className = "alert-history-item-top";
      const kind = document.createElement("span");
      kind.className = "alert-history-kind";
      kind.textContent = event.alert_type === "spread" ? "📈 価格差アラート" : "📉 購入価格の下落";
      const date = document.createElement("time");
      date.textContent = formatAlertDate(event.created_at);
      top.append(kind, date);
      const title = document.createElement("strong");
      title.className = "alert-history-item-title";
      title.textContent = (event.item_name || event.item_id || "アイテム不明") + (event.quality ? " · 品質 " + event.quality : "");
      const detail = document.createElement("p");
      detail.className = "alert-history-item-detail";
      if (event.alert_type === "spread") {
        detail.textContent = (event.buy_city || "購入都市不明") + " → " + (event.sell_city || "売却都市不明")
          + " · 購入 " + (event.buy_price == null ? "—" : Number(event.buy_price).toLocaleString("ja-JP") + " s")
          + " · 売却 " + (event.sell_price == null ? "—" : Number(event.sell_price).toLocaleString("ja-JP") + " s");
        const spread = document.createElement("strong");
        spread.className = "alert-history-spread";
        spread.textContent = "価格差 " + (event.spread == null ? "—" : Number(event.spread).toLocaleString("ja-JP") + " シルバー");
        card.append(top, title, detail, spread);
      } else {
        detail.textContent = (event.buy_city || "都市不明") + " · 購入価格 " + (event.buy_price == null ? "—" : Number(event.buy_price).toLocaleString("ja-JP") + " シルバー");
        card.append(top, title, detail);
      }
      alertHistoryList.append(card);
    }
  } catch (error) {
    alertHistoryMessage.textContent = "通知履歴を読み込めませんでした：" + error.message;
  } finally {
    alertHistoryRefreshButton.disabled = !monitorAdminToken;
  }
}

async function refreshMonitorRules() {
  const payload = await monitorRequest("/admin/watch-rules");
  monitorRulesContainer.replaceChildren();
  const rules = payload.rules || [];
  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "favorites-empty";
    empty.textContent = "監視ルールはまだありません。アイテムを選んで登録してください。";
    monitorRulesContainer.append(empty);
    return;
  }
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "monitor-rule";
    const main = document.createElement("div");
    main.className = "monitor-rule-main";
    const title = document.createElement("strong");
    title.textContent = (rule.item_name || rule.item_id) + " · 品質 " + rule.quality;
    const details = document.createElement("span");
    details.textContent = rule.buy_city + " → " + rule.sell_city
      + " · 価格差の記録目安 " + Number(rule.min_spread || 0).toLocaleString("ja-JP") + " s";
    main.append(title, details);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "削除";
    remove.addEventListener("click", async () => {
      if (!window.confirm("この監視ルールを削除しますか？")) return;
      remove.disabled = true;
      try {
        await monitorRequest("/admin/watch-rules/" + encodeURIComponent(rule.id), { method: "DELETE" });
        await refreshMonitorRules();
        monitorMessage.textContent = "監視ルールを削除しました。";
      } catch (error) {
        monitorMessage.textContent = error.message;
        remove.disabled = false;
      }
    });
    row.append(main, remove);
    monitorRulesContainer.append(row);
  }
}

monitorConnectButton.addEventListener("click", async () => {
  const candidate = monitorTokenInput.value.trim();
  if (!candidate) {
    monitorMessage.textContent = "管理トークンを入力してください。";
    return;
  }
  monitorAdminToken = candidate;
  if (monitorRememberInput.checked) localStorage.setItem(MONITOR_TOKEN_STORAGE_KEY, candidate);
  else localStorage.removeItem(MONITOR_TOKEN_STORAGE_KEY);
  setMonitorConnected(false, "loading");
  monitorConnectButton.disabled = true;
  monitorMessage.textContent = "Workerに接続しています…";
  try {
    await refreshMonitorRules();
    monitorTokenInput.value = "";
    setMonitorConnected(true);
    monitorMessage.textContent = "接続しました。監視ルールを登録できます。";
    await refreshAlertHistory();
  } catch (error) {
    monitorAdminToken = "";
    localStorage.removeItem(MONITOR_TOKEN_STORAGE_KEY);
    setMonitorConnected(false, "error");
    monitorMessage.textContent = error.message + "。トークンを確認してください。";
  } finally {
    monitorConnectButton.disabled = false;
  }
});

monitorAddButton.addEventListener("click", async () => {
  if (!selectedItem) {
    monitorMessage.textContent = "先に上の検索欄からアイテムを選択してください。";
    return;
  }
  const buyCity = document.querySelector("#monitor-buy-city").value;
  const sellCity = document.querySelector("#monitor-sell-city").value;
  if (buyCity === sellCity) {
    monitorMessage.textContent = "仕入れ都市と売却都市は別々に選んでください。";
    return;
  }
  const itemId = selectedItemId();
  const body = {
    item_id: itemId,
    item_name: japaneseName(selectedItem),
    quality: Number(document.querySelector("#monitor-quality").value),
    buy_city: buyCity,
    sell_city: sellCity,
    min_spread: Number(document.querySelector("#monitor-min-spread").value || 0)
  };
  monitorAddButton.disabled = true;
  monitorMessage.textContent = "監視ルールを登録しています…";
  try {
    await monitorRequest("/admin/watch-rules", { method: "POST", body: JSON.stringify(body) });
    await refreshMonitorRules();
    monitorMessage.textContent = japaneseName(selectedItem) + " の監視ルールを登録しました。";
  } catch (error) {
    monitorMessage.textContent = error.message;
  } finally {
    monitorAddButton.disabled = false;
  }
});

monitorRefreshButton.addEventListener("click", async () => {
  monitorRefreshButton.disabled = true;
  try {
    await refreshMonitorRules();
    monitorMessage.textContent = "監視リストを更新しました。";
  } catch (error) {
    monitorMessage.textContent = error.message;
  } finally {
    monitorRefreshButton.disabled = false;
  }
});

monitorTestSpreadButton.addEventListener("click", async () => {
  monitorTestSpreadButton.disabled = true;
  monitorMessage.textContent = "テスト用の架空価格でDiscord通知を送っています…";
  try {
    const result = await monitorRequest("/admin/test-spread", { method: "POST" });
    monitorMessage.textContent = "テスト通知をDiscordへ送信しました。実際の市場価格・監視履歴には影響していません。";
  } catch (error) {
    monitorMessage.textContent = error.message;
  } finally {
    monitorTestSpreadButton.disabled = false;
  }
});

alertHistoryRefreshButton.addEventListener("click", refreshAlertHistory);
alertHistoryFilter.addEventListener("change", refreshAlertHistory);

monitorPollButton.addEventListener("click", async () => {
  monitorPollButton.disabled = true;
  monitorMessage.textContent = "AODP Eastから価格を取得しています…";
  try {
    const result = await monitorRequest("/admin/poll-now", { method: "POST" });
    monitorMessage.textContent = "取得完了：監視ルール " + result.rules
      + "件 · API価格 " + result.pricesFetched + "件 · DB保存 " + result.observationsSaved
      + "件 · 通知 " + (result.alertsSent ?? 0) + "件";
    if (result.errors && result.errors.length) {
      monitorMessage.textContent += " · " + result.errors.join(" / ");
    }
  } catch (error) {
    monitorMessage.textContent = error.message;
  } finally {
    monitorPollButton.disabled = false;
  }
});

setMonitorConnected(false);
updateMonitorItemDisplay();

const rememberedMonitorToken = localStorage.getItem(MONITOR_TOKEN_STORAGE_KEY);
if (rememberedMonitorToken) {
  monitorRememberInput.checked = true;
  monitorAdminToken = rememberedMonitorToken;
  setMonitorConnected(false, "loading");
  refreshMonitorRules().then(async () => {
    setMonitorConnected(true);
    monitorMessage.textContent = "保存済みのログイン状態で接続しました。";
    await refreshAlertHistory();
  }).catch((error) => {
    monitorAdminToken = "";
    localStorage.removeItem(MONITOR_TOKEN_STORAGE_KEY);
    setMonitorConnected(false, "error");
    monitorMessage.textContent = error.message + "。再度管理トークンを入力してください。";
  });
}
