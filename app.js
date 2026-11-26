const searchInput = document.querySelector("#item-search");
const searchButton = document.querySelector("#search-button");
const searchMessage = document.querySelector("#search-message");

function showSearchStatus() {
  const term = searchInput.value.trim();
  if (!term) {
    searchMessage.textContent = "アイテム名を入力してください。";
    searchInput.focus();
    return;
  }
  searchMessage.textContent = "検索画面の土台は準備できています。アイテムデータとAsia価格APIは次の開発段階で接続します。";
}

searchButton.addEventListener("click", showSearchStatus);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") showSearchStatus();
});