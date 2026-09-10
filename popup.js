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

async function getFrameIds(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return frames && frames.length ? frames.map(frame => frame.frameId) : [0];
  } catch (error) {
    return [0];
  }
}

function sendMessageToFrame(tabId, frameId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, response => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

document.getElementById("fillBtn").addEventListener("click", async () => {
  setStatusWithTimeout("Filing page...");
  const tab = await getActiveTab();
  if (!tab || !tab.id) { setStatusWithTimeout("No active tab found."); return; }
  const frameIds = await getFrameIds(tab.id);
  const responses = await Promise.all(frameIds.map(frameId => sendMessageToFrame(tab.id, frameId, { type: "AUTOFILL" })));
  const validResponses = responses.filter(Boolean);
  if (validResponses.length === 0) {
    setStatusWithTimeout("Couldn't reach this page. Try reloading it.");
    return;
  }
  const filledCount = validResponses.reduce((total, response) => total + (response.filledCount || 0), 0);
  const unmatchedCount = validResponses.reduce((total, response) => total + (response.unmatchedCount || 0), 0);
    if (filledCount === 0 && unmatchedCount === 0) {
      setStatusWithTimeout("No fillable fields found on this page.");
    } else {
      setStatusWithTimeout(`Filled ${filledCount} field(s). ${unmatchedCount} need mapping.`);
    }
});

document.getElementById("learnBtn").addEventListener("click", async () => {
  setStatusWithTimeout("Checking form...");
  const tab = await getActiveTab();
  if (!tab || !tab.id) { setStatusWithTimeout("No active tab found."); return; }
  const frameIds = await getFrameIds(tab.id);
  let response = null;
  for (const frameId of frameIds) {
    response = await sendMessageToFrame(tab.id, frameId, { type: "OPEN_LEARN_PANEL" });
    if (response && response.fields > 0) break;
  }
  if (!response) {
    setStatusWithTimeout("Couldn't reach this page. Try reloading it.");
    return;
  }
  if (response.fields === 0) {
    setStatusWithTimeout("No filled fields found. Complete the form first, then try again.");
    return;
  }
  setStatusWithTimeout(`We found ${response.fields} fields. Match each one below so we can fill it automatically next time.`);
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
