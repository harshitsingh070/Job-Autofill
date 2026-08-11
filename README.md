# JOBFILL

A Chrome/Edge extension that remembers your details and fills them into job & internship application forms.

## Install (unpacked, dev mode)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads it live from disk).
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**, and select this folder.
5. Pin the extension icon (puzzle-piece icon in the toolbar → pin "JOBFILL").

## Quick tips

- Keep your profile up to date via the "Edit my profile" button — JOBFILL uses this to fill forms.
- Click ⚡ in the popup to autofill the current page; click 📥 "Learn from this form" after you type values to save them.
- If a site changes, use "Forget mappings for this site" to reset learned mappings for that domain.

## Set up your profile

1. Click the extension icon → **Edit my profile**.
2. Fill in whatever you have — name, email, phone, education, links, resume URL, etc. Leave anything blank you don't want filled.
3. Add **custom fields** for anything not listed (e.g. "Why do you want to work here?", visa type).
4. Click **Save profile**.

## Autofill a form

1. Open the application form.
2. Click the extension icon → **⚡ Autofill this page**.
3. Known fields get filled instantly. Fields it doesn't recognize get a small purple **"+"** badge next to them.
4. Click a "+" badge, pick the matching profile field from the dropdown (searchable) — it fills that field **and** remembers the mapping.
5. Next time you fill a form with the same field label (on that site, and on similar sites in general), it's auto-filled — no more "+" badge.

## Notes & limits

- It never overwrites text you've already typed into a field.
- Dropdown/select fields are matched by comparing your saved value against the option text.
- Checkboxes, radio buttons, and file uploads (like resume attachments) aren't auto-filled — those need manual handling per site.
- All data stays in your browser's local storage — nothing is sent anywhere.
- "Forget mappings for this site" (in the popup) resets learned mappings if a site changes its form.

# JOBFILL