(function () {
  const DOMAIN = location.hostname;

  function normalize(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function nativeSetValue(el, value) {
    el.focus();
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value") &&
      Object.getOwnPropertyDescriptor(proto, "value").set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  function getLabelText(el) {
    if (el.labels && el.labels.length) return el.labels[0].innerText;
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/).map(id => {
        const d = document.getElementById(id);
        return d ? d.innerText : "";
      }).filter(Boolean);
      if (texts.length > 0) return texts.join(" ");
    }
    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy) {
      const d = document.getElementById(describedBy);
      if (d) return d.innerText;
    }
    const closestLabel = el.closest("label");
    if (closestLabel) return closestLabel.innerText;
    // Try previous element
    let prev = el.previousElementSibling;
    if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN")) {
      return prev.innerText;
    }
    return "";
  }

  function getFieldContext(el) {
    const label = getLabelText(el);
    const name = el.name || "";
    const id = el.id || "";
    const placeholder = el.placeholder || "";
    const autocomplete = el.getAttribute("autocomplete") || "";
    const combined = normalize([label, name, id, placeholder, autocomplete].join(" "));
    return { label, name, id, placeholder, autocomplete, combined };
  }

  function signature(ctx) {
    // stable-ish key for this field, used for learned mappings
    const parts = [];
    if (ctx.label) parts.push(ctx.label);
    if (ctx.name) parts.push(ctx.name);
    return normalize(parts.join(" ")).slice(0, 80) || "field_" + (ctx.id || "unknown");
  }

  function guessKeyFromPatterns(combined) {
    for (const key in BUILTIN_PATTERNS) {
      const patterns = BUILTIN_PATTERNS[key];
      for (const re of patterns) {
        if (re.test(combined)) return key;
      }
    }
    return null;
  }

  function isFillableField(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.type && ["hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset"].includes(el.type)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function getAllFields() {
    const els = Array.from(document.querySelectorAll("input, textarea, select"));
    return els.filter(isFillableField);
  }

  function fillSelectField(el, value) {
    if (!value) return false;
    const normVal = normalize(value);
    const options = Array.from(el.options || []);
    let best = options.find(o => normalize(o.text) === normVal || normalize(o.value) === normVal);
    if (!best) best = options.find(o => normalize(o.text).includes(normVal) || normVal.includes(normalize(o.text)));
    if (best) {
      el.value = best.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  function fillField(el, value) {
    if (value === undefined || value === null || String(value).trim() === "") return false;
    if (el.tagName === "SELECT") return fillSelectField(el, value);
    if (el.value && String(el.value).trim() !== "") return false; // don't overwrite existing content
    nativeSetValue(el, value);
    return true;
  }

  async function getStorage() {
    return new Promise(resolve => {
      chrome.storage.local.get(["profile", "learnedMappings", "customSchema"], data => {
        resolve({
          profile: data.profile || {},
          learnedMappings: data.learnedMappings || {},
          fullSchema: PROFILE_SCHEMA.concat(data.customSchema || [])
        });
      });
    });
  }

  function saveLearnedMapping(domain, sig, key) {
    chrome.storage.local.get(["learnedMappings"], data => {
      const learned = data.learnedMappings || {};
      if (!learned[domain]) learned[domain] = {};
      learned[domain][sig] = key;
      if (!learned["_global"]) learned["_global"] = {};
      learned["_global"][sig] = key;
      chrome.storage.local.set({ learnedMappings: learned });
    });
  }

  function resolveKeyForField(ctx, learnedMappings) {
    const sig = signature(ctx);
    if (learnedMappings[DOMAIN] && learnedMappings[DOMAIN][sig]) return { key: learnedMappings[DOMAIN][sig], sig };
    if (learnedMappings["_global"] && learnedMappings["_global"][sig]) return { key: learnedMappings["_global"][sig], sig };
    const guessed = guessKeyFromPatterns(ctx.combined);
    if (guessed) return { key: guessed, sig };
    return { key: null, sig };
  }

  function removeAllBadges() {
    document.querySelectorAll(".jaf-badge, .jaf-dropdown").forEach(n => n.remove());
  }

  function positionNear(el, badge) {
    const rect = el.getBoundingClientRect();
    badge.style.position = "absolute";
    badge.style.top = window.scrollY + rect.top - 6 + "px";
    badge.style.left = window.scrollX + rect.right + 6 + "px";
  }

  function buildDropdown(el, ctx, schema, profile) {
    const dd = document.createElement("div");
    dd.className = "jaf-dropdown";
    const search = document.createElement("input");
    search.placeholder = "Search field...";
    search.className = "jaf-dropdown-search";
    dd.appendChild(search);
    const list = document.createElement("div");
    list.className = "jaf-dropdown-list";
    dd.appendChild(list);

    function renderList(filterText) {
      list.innerHTML = "";
      const f = normalize(filterText);
      schema
        .filter(item => profile[item.key] !== undefined && profile[item.key] !== null && String(profile[item.key]).trim() !== "")
        .filter(item => !f || normalize(item.label).includes(f) || normalize(item.key).includes(f))
        .forEach(item => {
          const opt = document.createElement("div");
          opt.className = "jaf-dropdown-item";
          opt.textContent = item.label;
          opt.addEventListener("click", () => {
            chrome.storage.local.get(["profile"], data => {
              const profile = data.profile || {};
              const value = profile[item.key];
              const sig = signature(ctx);
              saveLearnedMapping(DOMAIN, sig, item.key);
              if (value) fillField(el, value);
              removeAllBadges();
            });
          });
          list.appendChild(opt);
        });
    }
    renderList("");
    search.addEventListener("input", () => renderList(search.value));
    return dd;
  }

  function addManualBadge(el, ctx, schema, profile) {
    const badge = document.createElement("div");
    badge.className = "jaf-badge";
    badge.title = "Map this field to your profile";
    badge.textContent = "＋";
    positionNear(el, badge);
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".jaf-dropdown").forEach(n => n.remove());
      const dd = buildDropdown(el, ctx, schema, profile);
      document.body.appendChild(dd);
      const rect = badge.getBoundingClientRect();
      dd.style.position = "absolute";
      dd.style.top = window.scrollY + rect.bottom + 4 + "px";
      dd.style.left = window.scrollX + rect.left + "px";
      dd.querySelector(".jaf-dropdown-search").focus();
    });
    document.body.appendChild(badge);
  }

  async function runAutofill() {
    removeAllBadges();
    const { profile, learnedMappings, fullSchema } = await getStorage();
    const fields = getAllFields();
    let filledCount = 0;
    let unmatchedCount = 0;

    const hasProfileData = fullSchema.some(item => profile[item.key] !== undefined && profile[item.key] !== null && String(profile[item.key]).trim() !== "");

    for (const el of fields) {
      const ctx = getFieldContext(el);
      const { key } = resolveKeyForField(ctx, learnedMappings);
      if (key && profile[key]) {
        const ok = fillField(el, profile[key]);
        if (ok) filledCount++;
      } else if (!el.value) {
        if (hasProfileData) {
          unmatchedCount++;
          addManualBadge(el, ctx, fullSchema, profile);
        }
      }
    }
    return { filledCount, unmatchedCount, totalFields: fields.length };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "AUTOFILL") {
      runAutofill().then(sendResponse);
      return true; // async response
    }
    if (msg.type === "CLEAR_BADGES") {
      removeAllBadges();
      sendResponse({ ok: true });
    }
  });

  // Reposition badges on scroll/resize
  window.addEventListener("scroll", () => {
    document.querySelectorAll(".jaf-badge").forEach(b => b.remove());
  }, true);
})();
