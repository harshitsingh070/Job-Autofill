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

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome:|edge:|about:|chrome-extension:|moz-extension:|view-source:|data:|file:)/i.test(url) ||
    /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url);
}

async function ensureContentScripts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["schema.js", "content.js"]
    });
    // Give the freshly injected content script a tick to register its listener.
    await new Promise(resolve => setTimeout(resolve, 150));
    return true;
  } catch (error) {
    return false;
  }
}

async function broadcast(tabId, message) {
  const frameIds = await getFrameIds(tabId);
  let responses = await Promise.all(frameIds.map(frameId => sendMessageToFrame(tabId, frameId, message)));
  let valid = responses.filter(Boolean);
  if (valid.length > 0) return valid;

  // Content script probably isn't running in this tab yet (tab was open
  // before install/update, or a new iframe/SPA route appeared).
  // Inject it on demand and retry once instead of asking for a reload.
  const injected = await ensureContentScripts(tabId);
  if (!injected) return [];
  responses = await Promise.all(frameIds.map(frameId => sendMessageToFrame(tabId, frameId, message)));
  valid = responses.filter(Boolean);
  if (valid.length > 0) return valid;

  // Frames may have changed after injection; re-enumerate and try the main frame.
  const retryFrames = await getFrameIds(tabId);
  responses = await Promise.all(retryFrames.map(frameId => sendMessageToFrame(tabId, frameId, message)));
  return responses.filter(Boolean);
}

document.getElementById("fillBtn").addEventListener("click", async () => {
  setStatusWithTimeout("Filling page...");
  const tab = await getActiveTab();
  if (!tab || tab.id === undefined) { setStatusWithTimeout("No active tab found."); return; }
  if (isRestrictedUrl(tab.url)) {
    setStatusWithTimeout("This page doesn't allow extensions (e.g. Chrome settings, Web Store). Open the job form in a normal tab.");
    return;
  }
  const validResponses = await broadcast(tab.id, { type: "AUTOFILL" });
  if (validResponses.length === 0) {
    setStatusWithTimeout("Still can't reach this page. Please reload it once, then try again.");
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
  if (!tab || tab.id === undefined) { setStatusWithTimeout("No active tab found."); return; }
  if (isRestrictedUrl(tab.url)) {
    setStatusWithTimeout("This page doesn't allow extensions (e.g. Chrome settings, Web Store). Open the job form in a normal tab.");
    return;
  }
  // Broadcast to all frames, but prefer the first frame that actually has fields.
  const frameIds = await getFrameIds(tab.id);
  let responses = await Promise.all(frameIds.map(frameId => sendMessageToFrame(tab.id, frameId, { type: "OPEN_LEARN_PANEL" })));
  let response = responses.find(r => r && r.fields > 0) || responses.find(Boolean);
  if (!response) {
    const injected = await ensureContentScripts(tab.id);
    if (injected) {
      const retryFrames = await getFrameIds(tab.id);
      responses = await Promise.all(retryFrames.map(frameId => sendMessageToFrame(tab.id, frameId, { type: "OPEN_LEARN_PANEL" })));
      response = responses.find(r => r && r.fields > 0) || responses.find(Boolean);
    }
  }
  if (!response) {
    setStatusWithTimeout("Still can't reach this page. Please reload it once, then try again.");
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
