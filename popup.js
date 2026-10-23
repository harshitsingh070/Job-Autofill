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
    try {
      chrome.tabs.sendMessage(tabId, message, { frameId }, response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome:|edge:|about:|chrome-extension:|moz-extension:|view-source:|data:|file:)/i.test(url) ||
    /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url);
}

async function ensureContentScripts(tabId) {
  const files = ["schema.js", "content.js"];
  // Inject the main frame first: all-frames injection fails as a whole when a
  // single child frame is inaccessible, which made the popup wrongly claim
  // the page needed a reload.
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return true;
  } catch (error) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
      return true;
    } catch (error2) {
      return false;
    }
  }
}

async function sendToAllFrames(tabId, message) {
  const frameIds = await getFrameIds(tabId);
  const ordered = [0, ...frameIds.filter(frameId => frameId !== 0)];
  const responses = await Promise.all(ordered.map(frameId => sendMessageToFrame(tabId, frameId, message)));
  return responses.filter(Boolean);
}

async function broadcast(tabId, message) {
  let responses = await sendToAllFrames(tabId, message);
  if (responses.length > 0) return responses;

  // Content script probably isn't running in this tab yet (tab was open
  // before install/update, or a new iframe/SPA route appeared).
  // Inject it on demand instead of asking for a reload.
  const injected = await ensureContentScripts(tabId);
  if (!injected) return [];

  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 120));
    responses = await sendToAllFrames(tabId, message);
    if (responses.length > 0) return responses;
  }
  return responses;
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
    setStatusWithTimeout("Still can't reach this page. If it just loaded, wait a moment and try again.");
    return;
  }
  const filledCount = validResponses.reduce((total, response) => total + (response.filledCount || 0), 0);
  const unmatchedCount = validResponses.reduce((total, response) => total + (response.unmatchedCount || 0), 0);
  const totalFields = validResponses.reduce((total, response) => total + (response.totalFields || 0), 0);
  const hasProfileData = validResponses.some(response => response.hasProfileData);
  if (filledCount === 0 && unmatchedCount === 0) {
    if (!hasProfileData) {
      setStatusWithTimeout("Your profile is empty. Use \"Edit my profile\" to add your details first.");
    } else if (totalFields === 0) {
      setStatusWithTimeout("No fillable fields found on this page.");
    } else {
      setStatusWithTimeout("Nothing to fill — fields are already filled or unsupported.");
    }
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
  let responses = await sendToAllFrames(tab.id, { type: "OPEN_LEARN_PANEL" });
  let response = responses.find(r => r && r.fields > 0) || responses.find(Boolean);
  if (!response) {
    const injected = await ensureContentScripts(tab.id);
    if (injected) {
      await new Promise(resolve => setTimeout(resolve, 120));
      responses = await sendToAllFrames(tab.id, { type: "OPEN_LEARN_PANEL" });
      response = responses.find(r => r && r.fields > 0) || responses.find(Boolean);
    }
  }
  if (!response) {
    setStatusWithTimeout("Still can't reach this page. If it just loaded, wait a moment and try again.");
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
  let domain;
  try {
    domain = new URL(tab.url).hostname;
  } catch (error) {
    setStatusWithTimeout("Couldn't identify this site.");
    return;
  }
  chrome.storage.local.get(["learnedMappings"], (data) => {
    const learned = data.learnedMappings || {};
    const siteMappings = learned[domain] || {};
    delete learned[domain];

    // Signatures learned on this site are also copied to "_global" so they can
    // help on similar forms elsewhere. Drop those too, unless another site
    // still relies on the same signature.
    if (learned._global) {
      const otherDomains = Object.keys(learned).filter(key => key !== "_global");
      Object.keys(siteMappings).forEach(sig => {
        const usedElsewhere = otherDomains.some(other => learned[other] && learned[other][sig]);
        if (!usedElsewhere) delete learned._global[sig];
      });
    }

    chrome.storage.local.set({ learnedMappings: learned }, () => {
      setStatusWithTimeout(`Cleared learned mappings for ${domain}.`);
    });
  });
});

// Warm up the content script as soon as the popup opens. This means that by
// the time a button is clicked the page is already reachable, instead of
// asking the user to reload. Fails silently on restricted pages.
async function prepareActiveTab() {
  try {
    const tab = await getActiveTab();
    if (!tab || tab.id === undefined || isRestrictedUrl(tab.url)) return;
    const pings = await sendToAllFrames(tab.id, { type: "PING" });
    if (pings.length === 0) await ensureContentScripts(tab.id);
  } catch (error) {
    // Ignore: broadcast() will retry on the actual button click.
  }
}

prepareActiveTab();
