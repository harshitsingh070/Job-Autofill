const statusEl = document.getElementById("status");

function setStatus(text) {
  statusEl.textContent = text;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById("fillBtn").addEventListener("click", async () => {
  setStatus("Filling...");
  const tab = await getActiveTab();
  if (!tab || !tab.id) { setStatus("No active tab found."); return; }
  chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Couldn't reach this page. Try reloading it.");
      return;
    }
    if (!response) { setStatus("No response from page."); return; }
    const { filledCount, unmatchedCount } = response;
    if (filledCount === 0 && unmatchedCount === 0) {
      setStatus("No fillable fields found on this page.");
    } else {
      setStatus(`Filled ${filledCount} field(s). ${unmatchedCount} need mapping — look for the “+” badges.`);
    }
  });
});

document.getElementById("editProfileBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("clearSiteBtn").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url) return;
  const domain = new URL(tab.url).hostname;
  chrome.storage.local.get(["learnedMappings"], (data) => {
    const learned = data.learnedMappings || {};
    delete learned[domain];
    chrome.storage.local.set({ learnedMappings: learned }, () => {
      setStatus(`Forgot learned mappings for ${domain}.`);
    });
  });
});
