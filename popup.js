const statusEl = document.getElementById("status");

function setStatus(text) {
  statusEl.textContent = text;
}

let statusTimeout = null;
function setStatusWithTimeout(text, clearMs = 4000) {
  statusEl.textContent = text;
  if (statusTimeout) clearTimeout(statusTimeout);
  if (clearMs) statusTimeout = setTimeout(() => { statusEl.textContent = ""; statusTimeout = null; }, clearMs);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById("fillBtn").addEventListener("click", async () => {
  setStatusWithTimeout("Filing page...");
  const tab = await getActiveTab();
  if (!tab || !tab.id) { setStatusWithTimeout("No active tab found."); return; }
  chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatusWithTimeout("Couldn't reach this page. Try reloading it.");
      return;
    }
    if (!response) { setStatusWithTimeout("No response from page."); return; }
    const { filledCount, unmatchedCount } = response;
    if (filledCount === 0 && unmatchedCount === 0) {
      setStatusWithTimeout("No fillable fields found on this page.");
    } else {
      setStatusWithTimeout(`Filed ${filledCount} field(s). ${unmatchedCount} need mapping.`);
    }
  });
});

document.getElementById("learnBtn").addEventListener("click", async () => {
  setStatusWithTimeout("Checking form...");
  const tab = await getActiveTab();
  if (!tab || !tab.id) { setStatusWithTimeout("No active tab found."); return; }
  chrome.tabs.sendMessage(tab.id, { type: "OPEN_LEARN_PANEL" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatusWithTimeout("Couldn't reach this page. Try reloading it.");
      return;
    }
    if (!response || response.fields === 0) {
      setStatusWithTimeout("No filled fields found. Complete the form first, then try again.");
      return;
    }
    setStatusWithTimeout(`We found ${response.fields} fields. Match each one below so we can fill it automatically next time.`);
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
      setStatusWithTimeout(`Cleared learned mappings for ${domain}.`);
    });
  });
});
