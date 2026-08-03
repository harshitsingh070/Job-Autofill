const formGroupsEl = document.getElementById("formGroups");
const customFieldsEl = document.getElementById("customFields");
const saveStatus = document.getElementById("saveStatus");

let customEntries = []; // {key, value}

function groupSchema() {
  const groups = {};
  PROFILE_SCHEMA.forEach(item => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });
  return groups;
}

function renderForm(profile) {
  formGroupsEl.innerHTML = "";
  const groups = groupSchema();
  Object.keys(groups).forEach(groupName => {
    const groupEl = document.createElement("div");
    groupEl.className = "group";
    const h3 = document.createElement("h3");
    h3.textContent = groupName;
    groupEl.appendChild(h3);

    groups[groupName].forEach(item => {
      const row = document.createElement("div");
      row.className = "field-row";
      const label = document.createElement("label");
      label.textContent = item.label;
      label.htmlFor = "f_" + item.key;
      row.appendChild(label);

      let input;
      if (item.key === "coverLetterText") {
        input = document.createElement("textarea");
      } else {
        input = document.createElement("input");
        input.type = "text";
      }
      input.id = "f_" + item.key;
      input.dataset.key = item.key;
      input.value = profile[item.key] || "";
      row.appendChild(input);
      groupEl.appendChild(row);
    });
    formGroupsEl.appendChild(groupEl);
  });
}

function renderCustomFields() {
  customFieldsEl.innerHTML = "";
  customEntries.forEach((entry, idx) => {
    const row = document.createElement("div");
    row.className = "custom-row";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "Field label (e.g. Why this role?)";
    keyInput.value = entry.label || "";
    keyInput.addEventListener("input", () => { customEntries[idx].label = keyInput.value; });

    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.placeholder = "Value";
    valInput.value = entry.value || "";
    valInput.addEventListener("input", () => { customEntries[idx].value = valInput.value; });

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      customEntries.splice(idx, 1);
      renderCustomFields();
    });

    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    customFieldsEl.appendChild(row);
  });
}

document.getElementById("addCustomBtn").addEventListener("click", () => {
  customEntries.push({ key: "custom_" + Date.now(), label: "", value: "" });
  renderCustomFields();
});

function loadProfile() {
  chrome.storage.local.get(["profile"], (data) => {
    const profile = data.profile || {};
    renderForm(profile);
    customEntries = Object.keys(profile)
      .filter(k => k.startsWith("custom_"))
      .map(k => ({ key: k, label: profile[k + "__label"] || k, value: profile[k] }))
      .filter((v, i, arr) => arr.findIndex(x => x.key === v.key) === i);
    renderCustomFields();
  });
}

// Also update PROFILE_SCHEMA-visible custom entries so content.js dropdown can see them.
// We store custom field labels in profile under `${key}__label`.
function collectProfileFromForm() {
  const profile = {};
  formGroupsEl.querySelectorAll("input[data-key], textarea[data-key]").forEach(el => {
    profile[el.dataset.key] = el.value.trim();
  });
  customEntries.forEach(entry => {
    if (entry.label && entry.label.trim()) {
      profile[entry.key] = entry.value.trim();
      profile[entry.key + "__label"] = entry.label.trim();
    }
  });
  return profile;
}

document.getElementById("saveBtn").addEventListener("click", () => {
  const profile = collectProfileFromForm();

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
