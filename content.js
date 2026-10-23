(function () {
  // Guard against double-injection: the manifest injects this automatically,
  // and popup.js may inject it again on demand via chrome.scripting for tabs
  // that were open before install/update. Without this, listeners/observers
  // would register twice.
  //
  // IMPORTANT: we must always register the message listener, even when the
  // page has no inputs yet. SPAs (and many job boards) render the form after
  // load; the old early-return here left those tabs unreachable and forced
  // users to reload the page.
  if (window.__JOBFILL_READY__) return;
  window.__JOBFILL_READY__ = true;

  const DOMAIN = location.hostname;
  const countryAliases = window.COUNTRY_ALIASES || {};
  const stateAbbreviations = Object.assign(
    {},
    window.US_STATE_ABBREVIATIONS || {},
    window.IN_STATE_ABBREVIATIONS || {}
  );
  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  function normalize(s) {
    return String(s == null ? "" : s)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-zA-Z])(\d)/g, "$1 $2")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function readText(node) {
    if (!node) return "";
    const inner = typeof node.innerText === "string" ? node.innerText.trim() : "";
    return inner || node.textContent || "";
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

  const GENERIC_SIGNATURES = new Set([
    "yes", "no", "y", "n", "true", "false", "on", "off", "checked", "selected",
    "select", "choose", "male", "female", "other", "none"
  ]);

  // Labels too vague to apply across different websites. They are still
  // learned per-domain, just not copied to the shared "_global" store where
  // they could override a better pattern match on another form.
  const AMBIGUOUS_SIGNATURES = new Set([
    "name", "title", "company", "role", "position", "id", "number", "date",
    "location", "address", "status", "type", "code", "value", "field", "text"
  ]);

  function cleanLabelText(text) {
    let cleaned = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    cleaned = cleaned
      .replace(/\s*[\(\[]\s*(required|optional)\s*[\)\]]\s*$/gi, "")
      .replace(/\s*[:*]+\s*$/g, "")
      .trim();
    if (!cleaned) return "";
    if (/__label/i.test(cleaned)) return "";
    if (/^(custom|field|fld|question)?[_\-0-9]+$/i.test(cleaned)) return "";
    if (/^[a-f0-9]{12,}$/i.test(cleaned)) return "";
    if (!/[a-z]/i.test(cleaned)) return "";
    return cleaned.slice(0, 120).trim();
  }

  function isOptionLabelForGroup(node, el) {
    if (!el.name) return false;
    // The node itself (or a wrapper around it) may belong to one of this
    // group's options ("Yes", "No", ...) rather than to the question.
    const owner = node.closest ? node.closest("label, [class*='option'], [class*='choice'], li") : null;
    if (owner) {
      const ownerInput = owner.querySelector
        ? owner.querySelector('input[type="radio"], input[type="checkbox"]')
        : null;
      if (ownerInput && ownerInput.name === el.name) return true;
    }
    const target = node.control ||
      (node.htmlFor ? document.getElementById(node.htmlFor) : null) ||
      (node.querySelector ? node.querySelector("input") : null);
    return !!(target && target !== el && target.name && target.name === el.name);
  }

  function containerIsUnambiguous(container, el) {
    if (!container) return false;
    const controls = Array.from(container.querySelectorAll("input, select, textarea"))
      .filter(control => !["hidden", "submit", "button", "image", "reset"].includes(control.type));
    const groupControls = controls.filter(control =>
      control === el || (el.name && control.name && control.name === el.name)
    );
    if (groupControls.length === 0) return false;
    if (controls.length === groupControls.length) return true;

    // A control that belongs to an earlier field means we've climbed into a
    // container that spans multiple fields, so its labels are unsafe. An extra
    // control *after* the group (e.g. an "Other" text box) is fine.
    const firstGroupControl = groupControls[0];
    return !controls.some(control => {
      if (groupControls.includes(control)) return false;
      if (!control.compareDocumentPosition) return true;
      return !!(control.compareDocumentPosition(firstGroupControl) & 4);
    });
  }

  function getLabelText(el) {
    const candidates = [];

    if (el.labels && el.labels.length) candidates.push(readText(el.labels[0]));
    const aria = el.getAttribute("aria-label");
    if (aria) candidates.push(aria);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/).map(id => readText(document.getElementById(id))).filter(Boolean);
      if (texts.length > 0) candidates.push(texts.join(" "));
    }
    const closestLabel = el.closest("label");
    if (closestLabel) candidates.push(readText(closestLabel));
    const title = el.getAttribute("title");
    if (title) candidates.push(title);

    let prev = el.previousElementSibling;
    let guard = 0;
    while (prev && guard < 3) {
      const tag = prev.tagName;
      if (tag === "LABEL" || tag === "SPAN" || tag === "P" || tag === "DIV" || /^H[1-6]$/.test(tag)) {
        const text = readText(prev);
        if (text && text.length <= 160) candidates.push(text);
      }
      if (tag === "LABEL") break;
      prev = prev.previousElementSibling;
      guard++;
    }

    const describedBy = el.getAttribute("aria-describedby");
    if (describedBy) {
      const d = document.getElementById(describedBy);
      if (d) candidates.push(readText(d));
    }

    for (const c of candidates) {
      const cleaned = cleanLabelText(c);
      if (cleaned) return cleaned;
    }

    // Last resort: look for a human-readable prompt inside the field container.
    const container = el.closest("[class*='field'], [class*='form-'], [class*='question'], [class*='form_row'], [class*='form-group']");
    if (containerIsUnambiguous(container, el)) {
      for (const node of container.querySelectorAll("legend, label, [class*='label'], [class*='question'], [class*='prompt'], [role='heading'], h1, h2, h3, h4, p")) {
        if (node.contains(el)) continue;
        if (node.querySelector && node.querySelector("input, select, textarea")) continue;
        if (isOptionLabelForGroup(node, el)) continue;
        const cleaned = cleanLabelText(readText(node));
        if (cleaned) return cleaned;
      }
    }
    return "";
  }

  function getGroupLabel(el) {
    if (!el.name) return "";
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      const text = cleanLabelText(readText(legend));
      if (text) return text;
    }
    const group = el.closest("[role='radiogroup'], [role='group']");
    if (group) {
      const aria = cleanLabelText(group.getAttribute("aria-label"));
      if (aria) return aria;
      const labelledBy = group.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = cleanLabelText(labelledBy.split(/\s+/).map(id => readText(document.getElementById(id))).filter(Boolean).join(" "));
        if (text) return text;
      }
    }
    // Find the question/prompt that owns this radio or checkbox group.
    const container = el.closest("[class*='field'], [class*='form-'], [class*='question'], [class*='form_row'], [class*='form-group'], [data-testid*='field']");
    if (containerIsUnambiguous(container, el)) {
      for (const node of container.querySelectorAll("legend, label, [class*='label'], [class*='question'], [class*='prompt'], [role='heading'], h1, h2, h3, h4, p")) {
        if (node.contains(el)) continue;
        if (node.querySelector && node.querySelector("input, select, textarea")) continue;
        if (isOptionLabelForGroup(node, el)) continue;
        const text = cleanLabelText(readText(node));
        if (text) return text;
      }
    }
    // Some forms wrap a radio/checkbox group without a recognizable container.
    // Walk up to the group wrapper and use the prompt immediately above it.
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++) {
      const inputs = node.querySelectorAll ? node.querySelectorAll("input[type='radio'], input[type='checkbox']") : [];
      if (inputs.length > 1) {
        const prev = node.previousElementSibling;
        if (prev && !(prev.querySelector && prev.querySelector("input, select, textarea"))) {
          const labelFor = prev.tagName === "LABEL" && prev.htmlFor ? document.getElementById(prev.htmlFor) : null;
          const belongsToGroup = !labelFor || (labelFor.name && labelFor.name === el.name);
          const text = belongsToGroup ? cleanLabelText(readText(prev)) : "";
          if (text && text.length <= 160) return text;
        }
      }
      node = node.parentElement;
    }
    return "";
  }

  function getChoiceOptionLabel(el) {
    const own = getLabelText(el);
    const group = getGroupLabel(el);
    if (own && own !== group) return own;
    const value = el.value && el.value !== "on" ? el.value : "";
    return value || own || "";
  }

  function getFieldContext(el) {
    const isChoice = isRadioField(el) || isCheckboxField(el);
    const ownLabel = getLabelText(el);
    const groupLabel = isChoice ? getGroupLabel(el) : "";
    const label = groupLabel || ownLabel;
    const name = el.name || "";
    const id = el.id || "";
    const placeholder = el.placeholder || el.getAttribute("aria-placeholder") || "";
    const autocomplete = el.getAttribute("autocomplete") || "";
    const title = el.getAttribute("title") || "";
    const type = el.type || el.tagName.toLowerCase();
    // Option labels are only used for choices; the group question is the
    // label that should map to a profile field.
    // Note: the input type is deliberately excluded. It is too generic
    // ("text", "email") and would contaminate label phrases like "Resume text".
    const combined = normalize([label, isChoice ? ownLabel : "", name, id, placeholder, autocomplete, title].join(" "));
    return { label, ownLabel, groupLabel, name, id, placeholder, autocomplete, title, type, combined };
  }

  function signature(ctx) {
    // stable-ish key for this field, used for learned mappings
    const parts = [];
    if (ctx.label) parts.push(ctx.label);
    if (ctx.name) parts.push(ctx.name);
    if (ctx.placeholder) parts.push(ctx.placeholder);
    return normalize(parts.join(" ")).slice(0, 80) || "field " + normalize(ctx.id || "unknown");
  }

  function isUsefulSignature(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return false;
    if (/@/.test(raw) || /^https?:/i.test(raw) || /^e\.?g\.?/i.test(raw)) return false;
    const sig = normalize(raw);
    if (!sig || sig.length < 2) return false;
    if (GENERIC_SIGNATURES.has(sig)) return false;
    if (/^[\d\s]+$/.test(sig)) return false;
    return true;
  }

  function learnedSignatures(ctx) {
    const out = new Set();
    const primary = signature(ctx);
    if (isUsefulSignature(primary)) out.add(primary);
    if (isUsefulSignature(ctx.label)) out.add(normalize(ctx.label).slice(0, 80));
    if (isUsefulSignature(ctx.name)) out.add(normalize(ctx.name).slice(0, 80));
    if (isUsefulSignature(ctx.placeholder)) out.add(normalize(ctx.placeholder).slice(0, 80));
    return Array.from(out).filter(Boolean);
  }

  function guessKeyFromPatterns(combined) {
    for (const key in BUILTIN_PATTERNS) {
      const negatives = NEGATIVE_PATTERNS[key];
      if (negatives && negatives.some(re => re.test(combined))) continue;
      for (const re of BUILTIN_PATTERNS[key]) {
        if (re.test(combined)) return key;
      }
    }
    return null;
  }

  function keyFromAutocomplete(autocomplete) {
    const raw = normalize(autocomplete);
    if (!raw || raw === "on" || raw === "off") return null;
    const tokens = raw.split(" ").filter(token =>
      !["shipping", "billing", "home", "work", "mobile", "fax", "pager", "section"].includes(token)
    );
    const joined = tokens.join(" ");
    // We don't store a middle name, so don't fill it with the full name.
    if (/\b(additional|middle)\b/.test(joined)) return null;
    const keys = Object.keys(AUTOCOMPLETE_MAP).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (new RegExp("(^|\\s)" + key.replace(/\s+/g, "\\s+") + "(\\s|$)").test(joined)) return AUTOCOMPLETE_MAP[key];
    }
    return null;
  }

  function refineKeyForField(key, el) {
    if (!key) return key;
    if (isFileField(el) && key === "resumeUrl") return "resumeFile";
    if (!isFileField(el) && key === "resumeFile") return "resumeUrl";
    return key;
  }

  function matchSchemaLabel(ctx, fullSchema, options) {
    if (!ctx.label || !fullSchema) return null;
    const label = normalize(ctx.label);
    if (!label) return null;
    const exact = fullSchema.find(item => {
      const schemaLabel = normalize(String(item.label || "").replace(/\([^)]*\)/g, " "));
      return schemaLabel === label || normalize(item.key) === label;
    });
    if (exact) return exact.key;

    // Partial label matching is only safe for user-created fields; built-in
    // fields are matched by the (negative-aware) pattern rules instead.
    if (!options || !options.containment) return null;
    let best = null;
    let bestLength = 0;
    fullSchema.forEach(item => {
      if (!item.key.startsWith("custom_")) return;
      const schemaLabel = normalize(String(item.label || "").replace(/\([^)]*\)/g, " "));
      if (schemaLabel.length < 4) return;
      if (label.includes(schemaLabel) && schemaLabel.length > bestLength) {
        best = item.key;
        bestLength = schemaLabel.length;
      }
    });
    return best;
  }

  function lookupLearned(ctx, learnedMappings, fullSchema) {
    const stores = [learnedMappings[DOMAIN], learnedMappings["_global"]];
    const signatures = [signature(ctx), ...learnedSignatures(ctx)];
    for (const store of stores) {
      if (!store) continue;
      for (const sig of signatures) {
        if (!sig || !isUsefulSignature(sig)) continue;
        const key = store[sig];
        if (key && (!fullSchema || fullSchema.some(item => item.key === key))) return { key, sig };
      }
    }
    return null;
  }

  function resolveKeyForField(ctx, el, learnedMappings, fullSchema) {
    const sig = signature(ctx);

    const learned = lookupLearned(ctx, learnedMappings, fullSchema);
    if (learned) return { key: refineKeyForField(learned.key, el), sig };

    const autocompleteKey = keyFromAutocomplete(ctx.autocomplete);
    if (autocompleteKey && fullSchema.some(item => item.key === autocompleteKey)) {
      return { key: refineKeyForField(autocompleteKey, el), sig };
    }

    const exactLabelKey = matchSchemaLabel(ctx, fullSchema);
    if (exactLabelKey) return { key: refineKeyForField(exactLabelKey, el), sig };

    const patternKey = guessKeyFromPatterns(ctx.combined);
    if (patternKey) return { key: refineKeyForField(patternKey, el), sig };

    const customLabelKey = matchSchemaLabel(ctx, fullSchema, { containment: true });
    if (customLabelKey) return { key: refineKeyForField(customLabelKey, el), sig };

    if (el.type === "email") return { key: "email", sig };
    if (el.type === "tel") return { key: "phone", sig };
    return { key: null, sig };
  }

  function isFillableField(el) {
    if (el.disabled || el.readOnly) return false;
    // Never treat the extension's own overlay UI as page fields.
    if (el.closest && el.closest(".jaf-learn-panel, .jaf-dropdown, .jaf-badge")) return false;
    const excludedTypes = ["hidden", "submit", "button", "image", "reset", "password", "search", "color", "range"];
    if (el.type && excludedTypes.includes(el.type)) return false;
    // File inputs are frequently hidden behind a custom upload button, but
    // their `files` list can still be set programmatically.
    if (isFileField(el)) return true;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // Zero-size inputs are often custom-styled controls (comboboxes,
    // checkboxes, Google Forms widgets) that still accept a value, so only
    // skip fields that are fully detached from the rendered layout.
    if (el.getClientRects().length === 0 && el.offsetParent === null) return false;
    const identifier = normalize([el.name, el.id, el.getAttribute("autocomplete")].join(" "));
    if (/\b(captcha|otp|one time|search|query|filter|promo|coupon|honeypot|password|passwd|passcode)\b/.test(identifier)) return false;
    if (identifier === "q" || identifier === "s") return false;
    return true;
  }

  function isCheckboxField(el) {
    return el.tagName === "INPUT" && el.type === "checkbox";
  }

  function isRadioField(el) {
    return el.tagName === "INPUT" && el.type === "radio";
  }

  function isFileField(el) {
    return el.tagName === "INPUT" && el.type === "file";
  }

  function parseBooleanLikeValue(value) {
    const norm = normalize(value);
    if (["true", "yes", "y", "1", "checked", "on", "selected"].includes(norm)) return true;
    if (["false", "no", "n", "0", "unchecked", "off"].includes(norm)) return false;
    return null;
  }

  function isPlaceholderSelectOption(option) {
    if (!option) return true;
    if (option.disabled) return true;
    const text = normalize(option.text);
    const value = normalize(option.value);
    if (!text && !value) return true;
    return ["select one", "select", "choose one", "choose", "please select", "please choose", "optional", "n a", "not applicable"].some(term =>
      text === term || value === term || text.includes(term) || value.includes(term)
    );
  }

  function isFilledSelectField(el) {
    const option = el.options && el.options[el.selectedIndex];
    if (!option) return false;
    if (!String(el.value || "").trim()) return false;
    if (el.selectedIndex === 0 && isPlaceholderSelectOption(option)) return false;
    return true;
  }

  function getFieldLearnValue(el) {
    if (el.tagName === "SELECT") return el.options[el.selectedIndex]?.text || el.value || "";
    if (isCheckboxField(el)) return el.value && el.value !== "on" ? el.value : "checked";
    if (isRadioField(el)) return getChoiceOptionLabel(el) || "selected";
    if (isFileField(el)) return el.files && el.files[0] ? el.files[0].name : "";
    return el.value;
  }

  function isFieldEmpty(el) {
    if (isCheckboxField(el) || isRadioField(el)) return !el.checked;
    if (isFileField(el)) return !el.files || el.files.length === 0;
    if (el.tagName === "SELECT") return !isFilledSelectField(el);
    return !String(el.value || "").trim();
  }

  function hasStoredValue(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "object") return !!value.dataUrl;
    return String(value).trim() !== "";
  }

  function splitFullName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return { first: parts[0] || "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
  }

  function getValueForKey(key, profile) {
    if (hasStoredValue(profile[key])) return profile[key];
    if (key === "fullName") {
      return [profile.firstName, profile.lastName].filter(hasStoredValue).join(" ").trim();
    }
    if (key === "firstName" && hasStoredValue(profile.fullName)) return splitFullName(profile.fullName).first;
    if (key === "lastName" && hasStoredValue(profile.fullName)) return splitFullName(profile.fullName).last;
    return "";
  }

  function hasValueForKey(key, profile) {
    return hasStoredValue(getValueForKey(key, profile));
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function showStampCue(targetEl) {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const cue = document.createElement("div");
    cue.className = "jaf-stamp-cue";
    cue.style.left = window.scrollX + rect.right - 14 + "px";
    cue.style.top = window.scrollY + rect.top + 10 + "px";
    document.body.appendChild(cue);

    if (prefersReducedMotion()) {
      setTimeout(() => cue.remove(), 120);
      return;
    }

    requestAnimationFrame(() => cue.classList.add("is-visible"));
    setTimeout(() => cue.remove(), 180);
  }

  function getAllFields() {
    const els = Array.from(document.querySelectorAll("input, textarea, select"));
    return els.filter(isFillableField);
  }

  const YES_VALUES = ["yes", "y", "true", "1", "checked", "on", "selected"];
  const NO_VALUES = ["no", "n", "false", "0", "unchecked", "off"];
  const NA_VALUES = ["n a", "na", "not applicable", "none", "prefer not to say", "decline to answer", "no answer"];

  function canonicalChoice(value) {
    const norm = normalize(value);
    if (!norm) return "";
    if (YES_VALUES.includes(norm)) return "yes";
    if (NO_VALUES.includes(norm)) return "no";
    if (norm === "m" || norm === "man") return "male";
    if (norm === "f" || norm === "woman") return "female";
    if (norm === "nonbinary") return "non binary";
    if (countryAliases[norm]) return countryAliases[norm];
    if (stateAbbreviations[norm]) return stateAbbreviations[norm];
    return norm;
  }

  function isNAValue(value) {
    return NA_VALUES.includes(normalize(value));
  }

  function valueVariants(value, includeAbbreviations) {
    const variants = new Set();
    const norm = normalize(value);
    if (!norm) return [];
    variants.add(norm);
    variants.add(canonicalChoice(value));

    // "N/A", "None", "Prefer not to say" are all the same answer in practice.
    if (NA_VALUES.includes(norm)) NA_VALUES.forEach(alias => variants.add(alias));

    // Split list-like values ("React, Node") into individual choices.
    String(value).split(/\s*[,;|]\s*/).forEach(part => {
      const token = normalize(part);
      if (token) variants.add(token);
    });

    // Country/state alias lookup in both directions.
    if (countryAliases[norm]) variants.add(countryAliases[norm]);
    if (stateAbbreviations[norm]) variants.add(stateAbbreviations[norm]);
    Object.keys(countryAliases).forEach(alias => {
      if (countryAliases[alias] === norm) variants.add(alias);
    });
    Object.keys(stateAbbreviations).forEach(name => {
      if (stateAbbreviations[name] === norm) variants.add(name);
    });

    // Abbreviation heuristics (dropdowns only): "New York" -> "ny",
    // "California" -> "ca". Not used for checkbox/radio labels where "RN"
    // could be a real option.
    if (includeAbbreviations) {
      const words = norm.split(" ").filter(Boolean);
      if (words.length > 1) variants.add(words.map(word => word[0]).join(""));
      // For known regions/countries the alias tables already produced the
      // correct code; guessing the first two letters would add a wrong one
      // (e.g. "Maharashtra" -> "ma" instead of "mh").
      if (words.length === 1 && words[0].length > 3 && !stateAbbreviations[norm] && !countryAliases[norm]) {
        variants.add(words[0].slice(0, 2));
      }
    }

    return Array.from(variants).filter(Boolean);
  }

  function phraseIncludes(haystack, needle) {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    return (" " + haystack + " ").includes(" " + needle + " ");
  }

  function optionScore(option, variants) {
    const text = normalize(option.text);
    const value = normalize(option.value);
    if (!text && !value) return 0;
    let score = 0;
    for (const variant of variants) {
      if (!variant) continue;
      if (text === variant || value === variant) score = Math.max(score, 100);
      else if (isNAValue(text) && isNAValue(variant)) score = Math.max(score, 100);
      else if (canonicalChoice(text) === canonicalChoice(variant) && canonicalChoice(variant)) score = Math.max(score, 90);
      else if (variant.length >= 3 && (phraseIncludes(text, variant) || phraseIncludes(value, variant))) score = Math.max(score, 70);
      else if (text.length >= 3 && phraseIncludes(variant, text)) score = Math.max(score, 60);
    }
    return score;
  }

  function fillSelectField(el, value) {
    if (!value) return false;
    const variants = valueVariants(value, true);
    if (variants.length === 0) return false;
    let best = null;
    let bestScore = 0;
    for (const option of Array.from(el.options || [])) {
      if (!option || option.disabled) continue;
      const score = optionScore(option, variants);
      // Placeholder/"not applicable" options are only chosen on an exact hit.
      if (isPlaceholderSelectOption(option) && score < 100) continue;
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }
    if (!best || bestScore < 60) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value") &&
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    if (setter) setter.call(el, best.value); else el.value = best.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function getCheckboxGroup(el) {
    if (!el.name) return [el];
    try {
      return Array.from(document.querySelectorAll('input[type="checkbox"][name="' + CSS.escape(el.name) + '"]'));
    } catch (error) {
      return [el];
    }
  }

  function isMultiCheckboxGroup(el) {
    if (!el.name) return false;
    return getCheckboxGroup(el).length > 1;
  }

  function getRadioGroup(el) {
    if (!el.name) return [el];
    try {
      return Array.from(document.querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]'));
    } catch (error) {
      return [el];
    }
  }

  function fillCheckboxField(el, value) {
    const multi = isMultiCheckboxGroup(el);
    const parsed = parseBooleanLikeValue(value);
    // Never check/uncheck every box of a multi-select group for a yes/no value.
    if (parsed !== null && !multi) {
      if (el.checked === parsed) return false;
      el.checked = parsed;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      showStampCue(el);
      return true;
    }
    // Multi-select checkboxes ("React", "Node") match against the stored list.
    if (!multi) return false;
    const variants = valueVariants(value);
    const candidates = [el.value, getChoiceOptionLabel(el), el.id].map(normalize).filter(Boolean);
    const matched = variants.some(variant =>
      candidates.some(candidate => candidate === variant || phraseIncludes(candidate, variant) || phraseIncludes(variant, candidate))
    );
    if (!matched || el.checked) return false;
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    showStampCue(el);
    return true;
  }

  function fillRadioField(el, value) {
    if (!value) return false;
    const variants = valueVariants(value);
    const candidates = [el.value, getChoiceOptionLabel(el), el.id].map(normalize).filter(Boolean);
    const matched = candidates.some(candidate =>
      variants.some(variant => candidate === variant || phraseIncludes(candidate, variant) || phraseIncludes(variant, candidate))
    ) || (canonicalChoice(value) && candidates.some(candidate => canonicalChoice(candidate) === canonicalChoice(value)));
    if (!matched || el.checked) return false;
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    showStampCue(el);
    return true;
  }

  function padNumber(number) {
    return String(number).padStart(2, "0");
  }

  function formatDateValue(text, inputType) {
    const value = String(text || "").trim();
    if (!value) return "";
    if (inputType === "date") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
      let match = value.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
      if (match) return `${match[1]}-${padNumber(match[2])}-${padNumber(match[3])}`;
      match = value.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
      if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = match[3];
        if (first > 12) return `${year}-${padNumber(second)}-${padNumber(first)}`;
        if (second > 12) return `${year}-${padNumber(first)}-${padNumber(second)}`;
        return `${year}-${padNumber(first)}-${padNumber(second)}`;
      }
      match = value.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
      if (match && MONTHS[match[2].toLowerCase()]) {
        return `${match[3]}-${padNumber(MONTHS[match[2].toLowerCase()])}-${padNumber(match[1])}`;
      }
      match = value.match(/^([a-zA-Z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
      if (match && MONTHS[match[1].toLowerCase()]) {
        return `${match[3]}-${padNumber(MONTHS[match[1].toLowerCase()])}-${padNumber(match[2])}`;
      }
      return "";
    }
    if (inputType === "month") {
      let match = value.match(/^(\d{4})[-\/.](\d{1,2})$/);
      if (match) return `${match[1]}-${padNumber(match[2])}`;
      match = value.match(/^([a-zA-Z]+)\.?\s*[, ]\s*(\d{4})$/);
      if (match && MONTHS[match[1].toLowerCase()]) {
        return `${match[2]}-${padNumber(MONTHS[match[1].toLowerCase()])}`;
      }
      match = value.match(/^(\d{1,2})[-\/.](\d{4})$/);
      if (match) return `${match[2]}-${padNumber(match[1])}`;
      return "";
    }
    if (inputType === "time") {
      const match = value.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
      if (match) {
        let hours = Number(match[1]);
        if (match[3] && /pm/i.test(match[3]) && hours < 12) hours += 12;
        if (match[3] && /am/i.test(match[3]) && hours === 12) hours = 0;
        return `${padNumber(hours)}:${match[2]}`;
      }
      return "";
    }
    return value;
  }

  function prepareInputValue(el, value) {
    if (isCheckboxField(el) || isRadioField(el) || isFileField(el) || el.tagName === "SELECT") return value;
    const text = typeof value === "string" ? value : String(value);
    if (el.type === "number") {
      const numeric = text.replace(/[^0-9.\-]/g, "");
      if (/^-?\d+(\.\d+)?$/.test(numeric)) return numeric;
      const match = text.match(/-?\d+(?:\.\d+)?/);
      return match ? match[0] : "";
    }
    if (el.type === "date" || el.type === "month" || el.type === "time") {
      return formatDateValue(text, el.type);
    }
    if (el.type === "email" || el.type === "url" || el.type === "tel") return text.trim();
    return text;
  }

  function storedFileToFile(stored) {
    if (!stored) return Promise.resolve(null);
    if (stored instanceof File) return Promise.resolve(stored);
    if (stored.dataUrl && stored.name) {
      return fetch(stored.dataUrl)
        .then(response => response.blob())
        .then(blob => new File([blob], stored.name, { type: stored.type || blob.type || "application/octet-stream" }));
    }
    return Promise.resolve(null);
  }

  function fileToStoredValue(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: String(reader.result)
        });
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function fillFileField(el, value) {
    const file = await storedFileToFile(value);
    if (!file) return false;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    el.files = dataTransfer.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    showStampCue(el);
    return true;
  }

  async function fillField(el, value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "object" && !isFileField(el)) return false;
    if (isFileField(el)) return fillFileField(el, value);
    if (isCheckboxField(el)) return fillCheckboxField(el, value);
    if (isRadioField(el)) return fillRadioField(el, value);
    if (String(value).trim() === "") return false;
    if (el.tagName === "SELECT") return fillSelectField(el, value);
    if (el.value && String(el.value).trim() !== "") return false; // don't overwrite existing content
    const prepared = prepareInputValue(el, value);
    if (prepared === "" || prepared === undefined || prepared === null) return false;
    nativeSetValue(el, prepared);
    showStampCue(el);
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

  function storeLearnedMapping(learned, domain, ctx, key) {
    if (!learned[domain]) learned[domain] = {};
    if (!learned["_global"]) learned["_global"] = {};
    const signatures = learnedSignatures(ctx);
    signatures.forEach(sig => {
      learned[domain][sig] = key;
      if (!AMBIGUOUS_SIGNATURES.has(sig)) learned["_global"][sig] = key;
    });
  }

  function saveLearnedMapping(domain, ctx, key) {
    chrome.storage.local.get(["learnedMappings"], data => {
      const learned = data.learnedMappings || {};
      storeLearnedMapping(learned, domain, ctx, key);
      chrome.storage.local.set({ learnedMappings: learned });
    });
  }

  let badgesActive = false;

  function removeAllBadges() {
    badgesActive = false;
    document.querySelectorAll(".jaf-badge, .jaf-dropdown").forEach(n => n.remove());
  }

  function getFieldAnchor(el) {
    if (!isRadioField(el) && !isCheckboxField(el)) return el;
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++) {
      const inputs = node.querySelectorAll
        ? Array.from(node.querySelectorAll("input[type='radio'], input[type='checkbox']")).filter(input => !el.name || input.name === el.name)
        : [];
      if (inputs.length > 1) {
        const last = inputs[inputs.length - 1];
        return last.closest("label") || last;
      }
      node = node.parentElement;
    }
    return el.closest("label") || el;
  }

  function positionNear(anchor, badge) {
    const rect = anchor.getBoundingClientRect();
    const badgeWidth = badge.offsetWidth || 26;
    const viewportWidth = document.documentElement.clientWidth;
    let left = window.scrollX + rect.right + 6;
    if (rect.right + 6 + badgeWidth > viewportWidth - 4) {
      left = window.scrollX + rect.left - badgeWidth - 6;
    }
    left = Math.max(window.scrollX + 4, left);
    badge.style.position = "absolute";
    badge.style.top = window.scrollY + Math.max(4, rect.top - 6) + "px";
    badge.style.left = left + "px";
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
        .filter(item => hasValueForKey(item.key, profile))
        .filter(item => !f || normalize(item.label).includes(f) || normalize(item.key).includes(f))
        .forEach(item => {
          const opt = document.createElement("div");
          opt.className = "jaf-dropdown-item";
          opt.textContent = item.label;
          opt.addEventListener("click", async () => {
            chrome.storage.local.get(["profile"], async data => {
              const nextProfile = data.profile || {};
              const value = getValueForKey(item.key, nextProfile);
              saveLearnedMapping(DOMAIN, ctx, item.key);
              if (hasStoredValue(value)) {
                if (isRadioField(el)) {
                  for (const radio of getRadioGroup(el)) await fillField(radio, value);
                } else if (isCheckboxField(el) && isMultiCheckboxGroup(el)) {
                  for (const box of getCheckboxGroup(el)) await fillField(box, value);
                } else {
                  await fillField(el, value);
                }
              }
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
    const anchor = getFieldAnchor(el);
    positionNear(anchor, badge);
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".jaf-dropdown").forEach(n => n.remove());
      const dd = buildDropdown(el, ctx, schema, profile);
      document.body.appendChild(dd);
      const rect = badge.getBoundingClientRect();
      const ddWidth = dd.offsetWidth || 320;
      const ddHeight = dd.offsetHeight || 320;
      const margin = 8;
      let left = window.scrollX + rect.left;
      left = Math.min(left, window.scrollX + document.documentElement.clientWidth - ddWidth - margin);
      left = Math.max(window.scrollX + margin, left);
      let top = window.scrollY + rect.bottom + 4;
      if (top + ddHeight > window.scrollY + window.innerHeight - margin) {
        top = Math.max(window.scrollY + margin, window.scrollY + rect.top - ddHeight - 4);
      }
      dd.style.position = "absolute";
      dd.style.top = top + "px";
      dd.style.left = left + "px";
      dd.querySelector(".jaf-dropdown-search").focus();
    });
    document.body.appendChild(badge);
    badgesActive = true;
  }

  function getFilledFields() {
    return getAllFields().filter(el => {
      if (el.disabled) return false;
      return !isFieldEmpty(el);
    });
  }

  function buildLearnRow(el, ctx, schema, valueOverride) {
    const row = document.createElement("div");
    row.className = "jaf-learn-row";

    const labelEl = document.createElement("div");
    labelEl.className = "jaf-learn-label";
    const fallbackLabel = cleanLabelText(ctx.name) || cleanLabelText(ctx.placeholder) || cleanLabelText(ctx.id);
    labelEl.textContent = ctx.label || fallbackLabel || "Untitled field";
    row.appendChild(labelEl);

    const valueInput = document.createElement("input");
    valueInput.className = "jaf-learn-value";
    valueInput.value = valueOverride !== undefined ? valueOverride : getFieldLearnValue(el);
    row.appendChild(valueInput);

    const select = document.createElement("select");
    select.className = "jaf-learn-select";
    appendSchemaOptions(select, schema);
    row.appendChild(select);

    return {
      row,
      labelEl,
      valueInput,
      select,
      ctx,
      el,
      file: isFileField(el) ? (el.files && el.files[0] ? el.files[0] : null) : null
    };
  }

  function groupSchemaOptions(schema) {
    const groups = {};
    schema.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }

  function appendSchemaOptions(select, schema = PROFILE_SCHEMA) {
    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "➕ New profile field (auto-create)";
    select.appendChild(newOpt);
    const groups = groupSchemaOptions(schema);
    Object.keys(groups).forEach(groupName => {
      const og = document.createElement("optgroup");
      og.label = groupName;
      groups[groupName].forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.key;
        opt.textContent = item.label;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
  }

  async function openLearnPanel() {
    document.querySelectorAll(".jaf-learn-panel").forEach(n => n.remove());
    const { learnedMappings, fullSchema } = await getStorage();

    const entries = [];
    const seenCheckboxGroups = new Set();
    for (const el of getFilledFields()) {
      const ctx = getFieldContext(el);
      let valueOverride;

      // Learned checkbox groups become one row: "React, Node" instead of
      // several rows overwriting each other with the same key.
      if (isCheckboxField(el) && isMultiCheckboxGroup(el)) {
        const groupKey = "checkbox:" + (el.name || signature(ctx));
        if (seenCheckboxGroups.has(groupKey)) continue;
        seenCheckboxGroups.add(groupKey);
        valueOverride = getCheckboxGroup(el)
          .filter(box => box.checked)
          .map(box => getChoiceOptionLabel(box) || box.value)
          .filter(Boolean)
          .join(", ");
      }

      // pre-select the guessed key when we can resolve one
      const { key } = resolveKeyForField(ctx, el, learnedMappings, fullSchema);
      const entry = buildLearnRow(el, ctx, fullSchema, valueOverride);
      if (key && fullSchema.some(item => item.key === key)) entry.select.value = key;
      entries.push(entry);
    }

    if (entries.length === 0) return 0;

    const panel = document.createElement("div");
    panel.className = "jaf-learn-panel";

    const header = document.createElement("div");
    header.className = "jaf-learn-header";
    const title = document.createElement("span");
    title.className = "jaf-learn-title";
    title.textContent = "New entry detected";
    const close = document.createElement("button");
    close.className = "jaf-learn-close";
    close.textContent = "✕";
    close.addEventListener("click", () => panel.remove());
    header.appendChild(title);
    header.appendChild(close);
    panel.appendChild(header);

    const sub = document.createElement("p");
    sub.className = "jaf-learn-sub";
    sub.textContent = `We found ${entries.length} fields. Match each one below so we can fill it automatically next time.`;
    panel.appendChild(sub);

    const body = document.createElement("div");
    body.className = "jaf-learn-body";
    entries.forEach(e => body.appendChild(e.row));
    panel.appendChild(body);

    const footer = document.createElement("div");
    footer.className = "jaf-learn-footer";
    const saveBtn = document.createElement("button");
    saveBtn.className = "jaf-learn-save";
    saveBtn.textContent = "Confirm & save";
    const statusEl = document.createElement("span");
    statusEl.className = "jaf-learn-status";
    footer.appendChild(saveBtn);
    footer.appendChild(statusEl);
    panel.appendChild(footer);

    saveBtn.addEventListener("click", async () => {
      const done = await saveLearnEntries(entries);
      statusEl.textContent = `Saved ${done.savedCount} value(s), ${done.createdCount} new field(s).`;
      setTimeout(() => panel.remove(), 1800);
    });

    document.body.appendChild(panel);
    return entries.length;
  }

  async function saveLearnEntries(entries) {
    const data = await getStorage();
    const profile = data.profile;
    const learned = data.learnedMappings;
    const customSchema = data.fullSchema.slice(PROFILE_SCHEMA.length);
    let savedCount = 0;
    let createdCount = 0;

    for (const [idx, e] of entries.entries()) {
      if (!e.row.isConnected) continue;
      const value = e.valueInput.value.trim();
      let key = e.select.value;
      const isNew = key === "__new__";
      if (!value && !e.file) continue;
      if (isNew) {
        key = "custom_" + Date.now() + "_" + idx;
        if (!customSchema.find(c => c.key === key)) {
          customSchema.push({ key, label: e.labelEl.textContent.trim() || "Custom field", group: "Custom" });
        }
        createdCount++;
      }
      if (e.file) {
        profile[key] = await fileToStoredValue(e.file);
      } else {
        profile[key] = value;
      }
      if (e.el && !e.file && hasStoredValue(profile[key])) {
        if (isRadioField(e.el)) {
          for (const radio of getRadioGroup(e.el)) await fillField(radio, profile[key]);
        } else if (isCheckboxField(e.el) && isMultiCheckboxGroup(e.el)) {
          for (const box of getCheckboxGroup(e.el)) await fillField(box, profile[key]);
        } else {
          await fillField(e.el, profile[key]);
        }
      }
      if (key.startsWith("custom_")) {
        profile[key + "__label"] = e.labelEl.textContent.trim() || key;
      }
      storeLearnedMapping(learned, DOMAIN, e.ctx, key);
      showStampCue(e.row);
      savedCount++;
    }

    if (savedCount > 0) {
      await new Promise(resolve => chrome.storage.local.set({ profile, learnedMappings: learned, customSchema }, resolve));
    }
    return { savedCount, createdCount };
  }

  async function runAutofill() {
    removeAllBadges();
    const { profile, learnedMappings, fullSchema } = await getStorage();
    const fields = getAllFields();
    let filledCount = 0;
    let unmatchedCount = 0;

    const hasProfileData = fullSchema.some(item => hasValueForKey(item.key, profile));
    const countedGroups = new Set();
    const badgedGroups = new Set();

    function choiceGroupId(el) {
      if (!el.name) return "";
      if (isRadioField(el)) return "radio:" + el.name;
      if (isCheckboxField(el)) return "checkbox:" + el.name;
      return "";
    }

    function countUnmatched(el) {
      const groupId = choiceGroupId(el);
      if (groupId) {
        if (countedGroups.has(groupId)) return;
        countedGroups.add(groupId);
      }
      unmatchedCount++;
    }

    function choiceGroupHasSelection(el) {
      if (isRadioField(el) && el.name) {
        try {
          return Array.from(document.querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]'))
            .some(radio => radio.checked);
        } catch (error) {
          return el.checked;
        }
      }
      if (isCheckboxField(el) && isMultiCheckboxGroup(el)) {
        return getCheckboxGroup(el).some(box => box.checked);
      }
      return el.checked;
    }

    function addBadgeOnce(el, ctx) {
      const groupId = choiceGroupId(el);
      if (groupId) {
        if (badgedGroups.has(groupId)) return;
        badgedGroups.add(groupId);
      }
      addManualBadge(el, ctx, fullSchema, profile);
    }

    for (const el of fields) {
      const ctx = getFieldContext(el);
      const { key } = resolveKeyForField(ctx, el, learnedMappings, fullSchema);
      const value = key ? getValueForKey(key, profile) : "";
      if (key && hasStoredValue(value)) {
        const ok = await fillField(el, value);
        if (ok) filledCount++;
        else if (
          isCheckboxField(el) && !isMultiCheckboxGroup(el) &&
          parseBooleanLikeValue(value) === false && !el.checked
        ) {
          // The desired answer is "no" and the box is already unchecked.
        } else if (isRadioField(el) || isCheckboxField(el)) {
          // Don't count the unchecked siblings of a group that already has a
          // selection; do surface a group where nothing could be matched.
          if (!choiceGroupHasSelection(el)) {
            countUnmatched(el);
            if (hasProfileData) addBadgeOnce(el, ctx);
          }
        } else if (isFieldEmpty(el)) {
          // A recognized field we could not fill (e.g. no matching dropdown
          // option) is still worth showing the manual map badge for.
          countUnmatched(el);
          if (hasProfileData) addBadgeOnce(el, ctx);
        }
      } else if (isFieldEmpty(el)) {
        countUnmatched(el);
        if (hasProfileData) addBadgeOnce(el, ctx);
      }
    }
    return { filledCount, unmatchedCount, totalFields: fields.length, hasProfileData };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "AUTOFILL") {
      runAutofill().then(sendResponse);
      return true; // async response
    }
    if (msg.type === "OPEN_LEARN_PANEL") {
      openLearnPanel().then(count => sendResponse({ fields: count }));
      return true; // async response
    }
    if (msg.type === "PING") {
      // Lets the popup confirm the content script is alive without touching
      // the page, so it only injects when genuinely necessary.
      sendResponse({ ok: true, fields: getAllFields().length });
      return;
    }
    if (msg.type === "CLEAR_BADGES") {
      removeAllBadges();
      sendResponse({ ok: true });
    }
  });

  // Reposition/remove badges on scroll/resize with debounce
  let badgeClearTimeout = null;
  function scheduleClearBadges() {
    if (!badgesActive) return;
    if (badgeClearTimeout) clearTimeout(badgeClearTimeout);
    badgeClearTimeout = setTimeout(() => {
      document.querySelectorAll(".jaf-badge").forEach(b => b.remove());
      badgesActive = false;
      badgeClearTimeout = null;
    }, 150);
  }
  window.addEventListener("scroll", scheduleClearBadges, true);
  window.addEventListener("resize", scheduleClearBadges);
})();
