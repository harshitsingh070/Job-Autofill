const sectionRailEl = document.getElementById("sectionRail");
const sectionPageEl = document.getElementById("sectionPage");
const saveStatus = document.getElementById("saveStatus");

let customEntries = []; // {key, value}
let loadedProfile = {};
let activeSectionKey = "";
let additionalExpanded = false;

function isStoredFileValue(value) {
  return !!(value && typeof value === "object" && value.dataUrl && value.name);
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

function storedFileLabel(value) {
  return isStoredFileValue(value) ? value.name : "No file saved yet.";
}

function groupSchema() {
  const groups = {};
  PROFILE_SCHEMA.forEach(item => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });
  return groups;
}

function getCustomSectionItems() {
  return customEntries.map((entry, idx) => ({
    key: entry.key,
    label: entry.label || "Untitled custom field",
    value: entry.value || "",
    idx
  }));
}

function sectionDefinitions() {
  const groups = groupSchema();
  const preferredOrder = ["Basics", "Address", "Experience", "Education", "Documents", "Eligibility", "Demographics (optional)", "Links", "Custom"];
  const orderedGroups = preferredOrder.filter(groupName => groups[groupName]).concat(
    Object.keys(groups).filter(groupName => !preferredOrder.includes(groupName))
  );

  return orderedGroups.map(groupName => ({
    key: groupName,
    title: groupName,
    sectionGroup: ["Basics", "Address", "Experience", "Education"].includes(groupName) ? "core" : "additional",
    kind: "profile",
    items: groups[groupName] || []
  })).concat([{ key: "Custom", title: "Custom", kind: "custom", sectionGroup: "additional", items: getCustomSectionItems() }]);
}

function fieldHasValue(item, profile) {
  const value = profile[item.key];
  if (item.key === "resumeFile") return isStoredFileValue(value);
  if (value === undefined || value === null) return false;
  return String(value).trim() !== "";
}

function sectionIsComplete(section, profile) {
  if (section.kind === "custom") {
    const items = getCustomSectionItems();
    if (items.length === 0) return false;
    return items.every(item => String(item.label || "").trim() !== "" && String(item.value || "").trim() !== "");
  }
  return section.items.length > 0 && section.items.every(item => fieldHasValue(item, profile));
}

function sectionFilledCount(sections, profile) {
  return sections.filter(section => sectionIsComplete(section, profile)).length;
}

function hasAnyProfileData(profile) {
  return Object.keys(profile).some(key => {
    if (key.endsWith("__label")) return false;
    const value = profile[key];
    if (isStoredFileValue(value)) return true;
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function syncActiveSectionView() {
  sectionRailEl.querySelectorAll(".rail-tab").forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.section === activeSectionKey);
  });
  sectionPageEl.querySelectorAll(".dossier-section").forEach(section => {
    const isActive = section.dataset.section === activeSectionKey;
    section.classList.toggle("is-active", isActive);
    section.classList.toggle("is-hidden", !isActive);
  });
}

function renderSectionRail(sections, profile) {
  sectionRailEl.innerHTML = "";
  if (!hasAnyProfileData(profile)) {
    const intro = document.createElement("div");
    intro.className = "rail-intro";
    intro.textContent = "Start with Basics — the rest can wait.";
    sectionRailEl.appendChild(intro);
  }

  const coreGroup = document.createElement("div");
  coreGroup.className = "rail-group";

  const coreLabel = document.createElement("div");
  coreLabel.className = "rail-group-label";
  coreLabel.textContent = "Core";
  coreGroup.appendChild(coreLabel);

  sections.filter(section => section.sectionGroup === "core").forEach(section => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-tab" + (section.key === activeSectionKey ? " is-active" : "");
    button.dataset.section = section.key;

    const dot = document.createElement("span");
    dot.className = "rail-dot" + (sectionIsComplete(section, profile) ? " is-complete" : " is-empty");
    button.appendChild(dot);

    const label = document.createElement("span");
    label.className = "rail-label";
    label.textContent = section.title.toUpperCase();
    button.appendChild(label);

    button.addEventListener("click", () => {
      activeSectionKey = section.key;
      syncActiveSectionView();
    });
    coreGroup.appendChild(button);
  });

  sectionRailEl.appendChild(coreGroup);

  const divider = document.createElement("div");
  divider.className = "rail-divider";
  sectionRailEl.appendChild(divider);

  const moreToggle = document.createElement("button");
  moreToggle.type = "button";
  moreToggle.className = "rail-more-toggle";
  moreToggle.textContent = additionalExpanded ? "- Show less" : "+ Show more";
  moreToggle.addEventListener("click", () => {
    additionalExpanded = !additionalExpanded;
    if (!additionalExpanded && sections.some(section => section.sectionGroup === "additional" && section.key === activeSectionKey)) {
      activeSectionKey = "Basics";
    }
    renderDossier(profile);
  });
  sectionRailEl.appendChild(moreToggle);

  const additionalGroup = document.createElement("div");
  additionalGroup.className = "rail-group" + (additionalExpanded ? "" : " is-collapsed");

  const additionalLabel = document.createElement("div");
  additionalLabel.className = "rail-group-label";
  additionalLabel.textContent = "Additional";
  additionalGroup.appendChild(additionalLabel);

  sections.filter(section => section.sectionGroup === "additional").forEach(section => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-tab" + (section.key === activeSectionKey ? " is-active" : "");
    button.dataset.section = section.key;

    const dot = document.createElement("span");
    dot.className = "rail-dot" + (sectionIsComplete(section, profile) ? " is-complete" : " is-empty");
    button.appendChild(dot);

    const label = document.createElement("span");
    label.className = "rail-label";
    label.textContent = section.title.toUpperCase();
    button.appendChild(label);

    button.addEventListener("click", () => {
      activeSectionKey = section.key;
      additionalExpanded = true;
      syncActiveSectionView();
    });
    additionalGroup.appendChild(button);
  });

  sectionRailEl.appendChild(additionalGroup);

  const footer = document.createElement("div");
  footer.className = "rail-footer";
  const filled = sectionFilledCount(sections, profile);
  const count = document.createElement("div");
  count.className = "rail-count";
  count.textContent = `${filled}/${sections.length} sections complete`;

  const progressTrack = document.createElement("div");
  progressTrack.className = "rail-progress";
  const progressFill = document.createElement("div");
  progressFill.className = "rail-progress-fill";
  progressFill.style.width = `${sections.length ? Math.max(10, Math.round((filled / sections.length) * 100)) : 0}%`;
  progressTrack.appendChild(progressFill);

  footer.appendChild(count);
  footer.appendChild(progressTrack);
  sectionRailEl.appendChild(footer);
}

// Lets Chrome's saved-address/contact autofill recognise each field, so
// picking a suggestion fills every address field instead of being ignored.
const AUTOCOMPLETE_TOKENS = {
  firstName: "given-name",
  lastName: "family-name",
  fullName: "name",
  email: "email",
  phone: "tel",
  addressLine1: "address-line1",
  addressLine2: "address-line2",
  city: "address-level2",
  state: "address-level1",
  zipCode: "postal-code",
  country: "country-name",
  linkedin: "url",
  github: "url",
  portfolio: "url"
};

function createFieldControl(item, profile) {
  const row = document.createElement("article");
  row.className = "field-card";

  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = item.label;
  label.htmlFor = "f_" + item.key;
  row.appendChild(label);

  let input;
  if (item.key === "coverLetterText") {
    input = document.createElement("textarea");
  } else if (item.key === "resumeFile") {
    input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    input = document.createElement("input");
    input.type = "text";
  }
  input.id = "f_" + item.key;
  input.dataset.key = item.key;
  input.name = item.key;
  input.className = item.key === "coverLetterText" ? "field-input field-input--textarea" : "field-input";
  if (input.type === "text") {
    input.autocomplete = AUTOCOMPLETE_TOKENS[item.key] || "off";
    if (item.key === "email") input.type = "email";
    if (item.key === "phone") input.type = "tel";
    if (["linkedin", "github", "portfolio"].includes(item.key)) input.type = "url";
  }
  if (input.type === "file") {
    input.autocomplete = "off";
  }
  if (input.type !== "file") {
    input.value = profile[item.key] && !isStoredFileValue(profile[item.key]) ? profile[item.key] : "";
  }
  row.appendChild(input);

  if (item.key === "resumeFile") {
    const fileMeta = document.createElement("div");
    fileMeta.className = "file-meta";
    fileMeta.textContent = storedFileLabel(profile[item.key]);
    input.addEventListener("change", () => {
      fileMeta.textContent = input.files && input.files[0] ? input.files[0].name : storedFileLabel(profile[item.key]);
    });
    row.appendChild(fileMeta);
  }

  return row;
}

function createCustomSection(profile) {
  const section = document.createElement("section");
  section.className = "dossier-section";
  section.dataset.section = "Custom";

  const head = document.createElement("div");
  head.className = "dossier-section-head";
  const title = document.createElement("h2");
  title.textContent = "Custom";
  head.appendChild(title);
  const sub = document.createElement("p");
  sub.className = "section-note";
  sub.textContent = "Add anything not covered by the standard sections.";
  head.appendChild(sub);
  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "section-grid";
  customEntries.forEach((entry, idx) => {
    const card = document.createElement("article");
    card.className = "custom-card";

    const keyLabel = document.createElement("label");
    keyLabel.className = "field-label";
    keyLabel.textContent = "Field label";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "field-input";
    keyInput.placeholder = "Why this role?";
    keyInput.value = entry.label || "";
    keyInput.addEventListener("input", () => { customEntries[idx].label = keyInput.value; });

    const valLabel = document.createElement("label");
    valLabel.className = "field-label";
    valLabel.textContent = "Value";
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.className = "field-input";
    valInput.placeholder = "Type the value";
    valInput.value = entry.value && typeof entry.value === "object" ? "" : (entry.value || "");
    valInput.addEventListener("input", () => { customEntries[idx].value = valInput.value; });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      customEntries.splice(idx, 1);
      renderDossier(loadedProfile);
    });

    card.appendChild(keyLabel);
    card.appendChild(keyInput);
    card.appendChild(valLabel);
    card.appendChild(valInput);
    card.appendChild(removeBtn);
    list.appendChild(card);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "secondary add-custom";
  addBtn.textContent = "+ Add custom field";
  addBtn.addEventListener("click", () => {
    customEntries.push({ key: "custom_" + Date.now(), label: "", value: "" });
    renderDossier(loadedProfile);
  });

  section.appendChild(list);
  section.appendChild(addBtn);
  return section;
}

function renderSectionPage(sections, profile) {
  sectionPageEl.innerHTML = "";
  sections.forEach(section => {
    const sectionEl = document.createElement("section");
    sectionEl.className = "dossier-section" + (section.key === activeSectionKey ? " is-active" : " is-hidden");
    sectionEl.dataset.section = section.key;

    if (section.kind === "profile") {
      const head = document.createElement("div");
      head.className = "dossier-section-head";
      const title = document.createElement("h2");
      title.textContent = section.title.toUpperCase();
      head.appendChild(title);
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = sectionIsComplete(section, profile) ? "Complete" : "Incomplete";
      note.classList.toggle("is-complete", sectionIsComplete(section, profile));
      head.appendChild(note);
      sectionEl.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "section-grid";
      section.items.forEach(item => grid.appendChild(createFieldControl(item, profile)));

      // A real form let Chrome treat these as one address/contact group, so
      // selecting an autofill suggestion populates every related field.
      const form = document.createElement("form");
      form.autocomplete = "on";
      form.noValidate = true;
      form.addEventListener("submit", event => event.preventDefault());
      form.appendChild(grid);
      sectionEl.appendChild(form);
    } else {
      sectionEl.appendChild(createCustomSection(profile));
    }

    sectionPageEl.appendChild(sectionEl);
  });
}

function renderDossier(profile) {
  const sections = sectionDefinitions();
  if (!sections.some(section => section.key === activeSectionKey)) {
    activeSectionKey = sections[0] ? sections[0].key : "Custom";
  }
  renderSectionRail(sections, profile);
  renderSectionPage(sections, profile);
  syncActiveSectionView();
}

function loadProfile() {
  chrome.storage.local.get(["profile", "customSchema"], (data) => {
    const profile = data.profile || {};
    loadedProfile = profile;
    if (!activeSectionKey) activeSectionKey = "Basics";
    const labelMap = {};
    (data.customSchema || []).forEach(c => { labelMap[c.key] = c.label; });
    customEntries = Object.keys(profile)
      .filter(k => k.startsWith("custom_") && !k.endsWith("__label"))
      .map(k => ({ key: k, label: profile[k + "__label"] || labelMap[k] || k, value: profile[k] }))
      .filter((v, i, arr) => arr.findIndex(x => x.key === v.key) === i);
    renderDossier(profile);
  });
}

// Also update PROFILE_SCHEMA-visible custom entries so content.js dropdown can see them.
// We store custom field labels in profile under `${key}__label`.
async function collectProfileFromForm(existingProfile) {
  const profile = {};
  const fields = Array.from(sectionPageEl.querySelectorAll("input[data-key], textarea[data-key]"));
  for (const el of fields) {
    const key = el.dataset.key;
    if (el.type === "file") {
      const file = el.files && el.files[0];
      if (file) {
        profile[key] = await fileToStoredValue(file);
      } else if (isStoredFileValue(existingProfile[key])) {
        profile[key] = existingProfile[key];
      }
    } else {
      profile[key] = el.value.trim();
    }
  }
  customEntries.forEach(entry => {
    if (entry.label && entry.label.trim()) {
      profile[entry.key] = entry.value && typeof entry.value === "object" ? entry.value : String(entry.value || "").trim();
      profile[entry.key + "__label"] = entry.label.trim();
    }
  });
  const valueKeys = new Set(customEntries.map(e => e.key));
  for (const k of Object.keys(profile)) {
    if (k.startsWith("custom_") && k.endsWith("__label")) {
      const base = k.slice(0, -"__label".length);
      if (!valueKeys.has(base)) delete profile[k];
    }
  }
  return profile;
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const profile = await collectProfileFromForm(loadedProfile);

  // Extend PROFILE_SCHEMA (in-memory, this session) so custom fields are pickable
  // in the manual-mapping dropdown on other pages too. Persisted separately.
  const customSchemaEntries = customEntries
    .filter(e => e.label && e.label.trim())
    .map(e => ({ key: e.key, label: e.label, group: "Custom" }));

  chrome.storage.local.set({ profile, customSchema: customSchemaEntries }, () => {
    saveStatus.textContent = "Saved ✓";
    setTimeout(() => { saveStatus.textContent = ""; }, 2000);
  });
});

loadProfile();
