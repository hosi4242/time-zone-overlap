(function () {
  "use strict";

  var TZO = globalThis.TZO;
  var CITIES = globalThis.TZO_CITIES || [];
  if (!TZO || !CITIES.length) return;

  var NOW_MS = Date.now();
  var DEFAULT_SCHEDULE = { start: 540, end: 1080, lunch: 0 };
  var MAX_CITIES = 5;
  var state;
  var result;
  var commitTimer = null;
  var searchTimers = new Map();
  var activeCombobox = null;

  var els = {
    cityList: document.getElementById("city-list"),
    addCity: document.getElementById("add-city"),
    date: document.getElementById("date-input"),
    dateNote: document.getElementById("date-note"),
    recommendation: document.getElementById("recommendation"),
    fitBadge: document.getElementById("fit-badge"),
    summaryLive: document.getElementById("summary-live"),
    timeline: document.getElementById("timeline"),
    tableBody: document.querySelector("#overlap-table tbody"),
    currentTime: document.getElementById("current-time-note"),
    notices: document.getElementById("notice-stack"),
    copyResult: document.getElementById("copy-result"),
    copyLink: document.getElementById("copy-link"),
    google: document.getElementById("google-calendar"),
    downloadIcs: document.getElementById("download-ics"),
    actionStatus: document.getElementById("action-status"),
    reset: document.getElementById("reset-button"),
    theme: document.getElementById("theme-toggle")
  };

  function cityById(id) {
    for (var i = 0; i < CITIES.length; i += 1) if (CITIES[i].id === id) return CITIES[i];
    return null;
  }

  function cityIndex(city) {
    return state.cities.indexOf(city);
  }

  function nowIsoDate() {
    var d = new Date(NOW_MS);
    return d.toISOString().slice(0, 10);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dateLabel(s) {
    var d = new Date(s + "T00:00:00Z");
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
  }

  function dateBounds() {
    var d = new Date(NOW_MS);
    var y = d.getUTCFullYear();
    var m = d.getUTCMonth();
    var day = d.getUTCDate();
    var lower = new Date(Date.UTC(y - 2, m, day));
    var upper = new Date(Date.UTC(y + 2, m, day));
    if (m === 1 && day === 29) {
      if (lower.getUTCMonth() !== 1 || lower.getUTCDate() !== 28) lower = new Date(Date.UTC(y - 2, 1, 28));
      if (upper.getUTCMonth() !== 1 || upper.getUTCDate() !== 28) upper = new Date(Date.UTC(y + 2, 1, 28));
    }
    return { min: lower.toISOString().slice(0, 10), max: upper.toISOString().slice(0, 10) };
  }

  function timeValue(min) { return pad2(Math.floor(min / 60)) + ":" + pad2(min % 60); }
  function parseTime(value) {
    var m = /^(\d{2}):(\d{2})$/.exec(value || "");
    if (!m) return null;
    var n = Number(m[1]) * 60 + Number(m[2]);
    return n >= 0 && n <= 1425 && n % 15 === 0 ? n : null;
  }

  function formatParts(p) { return TZO.formatTimeParts(p, { hourFormat: state.hourFormat }); }

  function rangeText(range, city) {
    var s = formatParts(range.start);
    var e = formatParts(range.end);
    var day = range.dayOffset === 0 ? "same day" : (range.dayOffset > 0 ? "+" + range.dayOffset + " day" + (range.dayOffset === 1 ? "" : "s") : range.dayOffset + " day" + (range.dayOffset === -1 ? "" : "s"));
    if (range.endDateDiffers) return city.name + ": " + s + "–" + e + " (end date changes; " + day + ")";
    return city.name + ": " + s + "–" + e + " (" + day + ")";
  }

  function localDateTime(ms, tz) {
    return TZO.localParts(ms, tz);
  }

  function createElement(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function makeOption(city, index, active) {
    var option = createElement("button", "city-option" + (active ? " active" : ""));
    option.type = "button";
    option.id = "city-option-" + index + "-" + city.id.replace(/[^a-z0-9_-]/gi, "-");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", active ? "true" : "false");
    var strong = createElement("strong", "", city.name);
    var meta = createElement("span", "", city.country + " · " + city.tz);
    option.append(strong, meta);
    option.dataset.cityId = city.id;
    return option;
  }

  function searchCities(query, currentCity) {
    var q = String(query || "").trim().toLowerCase();
    var candidates = CITIES.filter(function (city) {
      if (city.id === currentCity.id) return false;
      var hay = [city.name, city.country, city.tz].concat(city.aliases || []).join(" ").toLowerCase();
      return !q || hay.indexOf(q) >= 0;
    });
    candidates.sort(function (a, b) {
      var aa = [a.name.toLowerCase()].concat(a.aliases || []).join(" ");
      var bb = [b.name.toLowerCase()].concat(b.aliases || []).join(" ");
      var aq = q ? (aa.indexOf(q) === 0 ? 0 : aa.indexOf(q) >= 0 ? 1 : 2) : 2;
      var bq = q ? (bb.indexOf(q) === 0 ? 0 : bb.indexOf(q) >= 0 ? 1 : 2) : 2;
      return aq - bq || b.rank - a.rank || a.name.localeCompare(b.name);
    });
    return candidates.slice(0, 12);
  }

  function updateListbox(card, index, query) {
    var box = card.querySelector(".city-listbox");
    var current = state.cities[index];
    while (box.firstChild) box.removeChild(box.firstChild);
    var choices = searchCities(query, current);
    if (!choices.length) {
      box.appendChild(createElement("div", "city-option", "No matching city"));
      box.querySelector("div").setAttribute("role", "option");
      return;
    }
    choices.forEach(function (city, i) {
      box.appendChild(makeOption(city, index, i === 0));
    });
    card.dataset.activeIndex = "0";
  }

  function openCombobox(card, index) {
    if (activeCombobox && activeCombobox !== card) closeCombobox(activeCombobox);
    activeCombobox = card;
    var input = card.querySelector(".city-search");
    var box = card.querySelector(".city-listbox");
    input.setAttribute("aria-expanded", "true");
    box.hidden = false;
    updateListbox(card, index, input.value);
  }

  function closeCombobox(card) {
    if (!card) return;
    var input = card.querySelector(".city-search");
    var box = card.querySelector(".city-listbox");
    input.setAttribute("aria-expanded", "false");
    box.hidden = true;
    if (activeCombobox === card) activeCombobox = null;
  }

  function selectCity(index, cityId) {
    var city = cityById(cityId);
    if (!city) return;
    var duplicate = state.cities.some(function (c, i) { return i !== index && c.id === city.id; });
    if (duplicate) {
      setActionStatus("That city is already selected.");
      return;
    }
    state.cities[index] = city;
    closeCombobox(els.cityList.children[index]);
    renderCities();
    commitState();
  }

  function renderCities() {
    while (els.cityList.firstChild) els.cityList.removeChild(els.cityList.firstChild);
    state.cities.forEach(function (city, index) {
      var card = createElement("article", "city-card");
      card.dataset.index = String(index);
      var top = createElement("div", "city-top");
      top.appendChild(createElement("span", "city-number", String(index + 1)));
      var label = createElement("div", "city-label");
      label.appendChild(createElement("div", "city-name", city.name));
      label.appendChild(createElement("div", "city-zone", city.tz));
      top.appendChild(label);
      if (state.cities.length > 2) {
        var remove = createElement("button", "remove-city", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + city.name);
        remove.addEventListener("click", function () {
          state.cities.splice(index, 1);
          state.schedules.splice(index, 1);
          renderCities();
          commitState();
        });
        top.appendChild(remove);
      }
      card.appendChild(top);

      var wrap = createElement("div", "combobox-wrap");
      var input = createElement("input", "city-search");
      input.type = "text";
      input.value = city.name;
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", "city-listbox-" + index);
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-activedescendant", "");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
      var box = createElement("div", "city-listbox");
      box.id = "city-listbox-" + index;
      box.setAttribute("role", "listbox");
      box.hidden = true;
      wrap.append(input, box);
      card.appendChild(wrap);

      input.addEventListener("focus", function () { openCombobox(card, index); });
      input.addEventListener("input", function () {
        if (!searchTimers.has(index)) searchTimers.set(index, null);
        if (searchTimers.get(index)) clearTimeout(searchTimers.get(index));
        searchTimers.set(index, setTimeout(function () { updateListbox(card, index, input.value); }, 80));
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { closeCombobox(card); input.value = city.name; return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          var opts = Array.from(box.querySelectorAll("[role=option]"));
          if (!opts.length) return;
          var current = Number(card.dataset.activeIndex || 0);
          current = event.key === "ArrowDown" ? (current + 1) % opts.length : (current - 1 + opts.length) % opts.length;
          card.dataset.activeIndex = String(current);
          opts.forEach(function (o, i) { o.classList.toggle("active", i === current); o.setAttribute("aria-selected", i === current ? "true" : "false"); });
          input.setAttribute("aria-activedescendant", opts[current].id);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          var active = box.querySelectorAll("[role=option]")[Number(card.dataset.activeIndex || 0)];
          if (active && active.dataset.cityId) selectCity(index, active.dataset.cityId);
        }
      });
      box.addEventListener("mousedown", function (event) {
        var option = event.target.closest("[data-city-id]");
        if (option) { event.preventDefault(); selectCity(index, option.dataset.cityId); }
      });

      var schedule = state.schedules[index];
      var sg = createElement("div", "schedule-grid");
      ["Start time", "End time"].forEach(function (labelText, part) {
        var group = createElement("div");
        group.appendChild(createElement("label", "", labelText));
        var inputTime = createElement("input", "time-input");
        inputTime.type = "time";
        inputTime.step = "900";
        inputTime.value = timeValue(part === 0 ? schedule.start : schedule.end);
        inputTime.setAttribute("aria-label", city.name + " " + labelText);
        inputTime.addEventListener("change", function () {
          var value = parseTime(inputTime.value);
          if (value === null) { inputTime.value = timeValue(schedule[part === 0 ? "start" : "end"]); return; }
          schedule[part === 0 ? "start" : "end"] = value;
          if (schedule.start === schedule.end) {
            schedule.start = 540; schedule.end = 1080;
            setActionStatus("Start and end cannot be identical; the schedule was reset to 09:00–18:00.");
          }
          renderCities();
          commitState();
        });
        group.appendChild(inputTime);
        sg.appendChild(group);
      });
      var lunch = createElement("div", "lunch-control");
      var lunchLabel = createElement("label", "switch-label");
      var lunchInput = document.createElement("input");
      lunchInput.type = "checkbox";
      lunchInput.checked = schedule.lunch === 1;
      lunchInput.setAttribute("aria-label", city.name + " lunch break");
      lunchInput.addEventListener("change", function () { schedule.lunch = lunchInput.checked ? 1 : 0; commitState(); });
      lunchLabel.append(lunchInput, createElement("span", "", "Lunch 12:00–13:00"));
      lunch.appendChild(lunchLabel);
      sg.appendChild(lunch);
      card.appendChild(sg);
      els.cityList.appendChild(card);
    });
    els.addCity.disabled = state.cities.length >= MAX_CITIES;
    els.addCity.textContent = state.cities.length >= MAX_CITIES ? "Maximum 5 cities" : "+ Add city";
  }

  function addCity() {
    if (state.cities.length >= MAX_CITIES) return;
    var candidate = CITIES.find(function (city) { return !state.cities.some(function (x) { return x.id === city.id; }); });
    if (!candidate) return;
    state.cities.push(candidate);
    state.schedules.push({ start: DEFAULT_SCHEDULE.start, end: DEFAULT_SCHEDULE.end, lunch: 0 });
    renderCities();
    commitState();
  }

  function setSegmentButtons(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset[attr] === String(value) ? "true" : "false");
    });
  }

  function updateFromControls() {
    var bounds = dateBounds();
    els.date.min = bounds.min;
    els.date.max = bounds.max;
    els.date.value = state.date;
    setSegmentButtons("[data-format]", "format", state.hourFormat);
    setSegmentButtons("[data-length]", "length", state.meetingLength);
    els.dateNote.textContent = dateLabel(state.date);
  }

  function commitState() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(function () { recompute(true); }, 400);
  }

  function recompute(updateUrl) {
    try {
      var checked = TZO.validateDate(state.date, { nowMs: NOW_MS });
      if (!checked.ok) state.date = TZO.defaultDateFor(state.cities[0], { nowMs: NOW_MS });
      else state.date = checked.date;
      result = TZO.computeOverlap(state, { nowMs: NOW_MS });
      if (updateUrl) {
        var canonical = TZO.buildUrlState(state);
        history.replaceState(null, "", canonical);
      }
      updateFromControls();
      renderResult();
      renderTimeline();
      renderNotices();
      renderTable();
      els.summaryLive.textContent = TZO.summaryText(result, { locale: "en-US", hourFormat: state.hourFormat });
    } catch (error) {
      setActionStatus("Unable to calculate this selection: " + error.message);
    }
  }

  function renderNotices() {
    while (els.notices.firstChild) els.notices.removeChild(els.notices.firstChild);
    result.sameTimezonePairs.forEach(function (pair) {
      var a = state.cities[pair.a], b = state.cities[pair.b];
      var text = pair.reason === "same-id" ? a.name + " and " + b.name + " use the same time zone." : a.name + " and " + b.name + " have the same UTC offset throughout this window.";
      els.notices.appendChild(createElement("div", "notice", text));
    });
    result.warnings.forEach(function (warning) {
      if (warning.code === "non-15-minute-offset") els.notices.appendChild(createElement("div", "notice warning", "This time zone has a non-15-minute offset in the displayed window; the timeline still uses the tool's 15-minute calculation grid."));
    });
  }

  function recommendationDuration() {
    if (!result || !result.recommendation) return 0;
    return Math.round((result.recommendation.endUtc - result.recommendation.startUtc) / 60000);
  }

  function renderResult() {
    while (els.recommendation.firstChild) els.recommendation.removeChild(els.recommendation.firstChild);
    if (!result.recommendation) {
      els.fitBadge.className = "status-badge fallback";
      els.fitBadge.textContent = "No window";
      els.recommendation.appendChild(createElement("div", "recommendation-main", "No valid meeting window is available in this search window."));
      els.google.href = "#";
      return;
    }
    var rec = result.recommendation;
    els.fitBadge.className = "status-badge " + (rec.kind === "overlap" ? "success" : "fallback");
    els.fitBadge.textContent = rec.kind === "overlap" ? "Fits" : "Fallback";
    var anchorCity = state.cities[0];
    var ap = TZO.localParts(rec.startUtc, anchorCity.tz);
    var ep = TZO.localParts(rec.endUtc, anchorCity.tz);
    var main = createElement("div", "recommendation-main", formatParts(ap) + "–" + formatParts(ep) + " · " + anchorCity.name);
    var dateText = dateLabel(state.date);
    var sub = createElement("div", "recommendation-sub", dateText + " · " + recommendationDuration() + " minutes · " + (rec.kind === "overlap" ? "All cities are working." : "Best available fallback according to the scoring rules."));
    els.recommendation.append(main, sub);
    var per = createElement("div", "per-city-list");
    rec.perCity.forEach(function (range, i) {
      var card = createElement("div", "per-city");
      card.appendChild(createElement("strong", "", state.cities[i].name));
      card.appendChild(createElement("span", "", rangeText(range, state.cities[i])));
      per.appendChild(card);
    });
    els.recommendation.appendChild(per);
    var description = buildCalendarDescription(rec);
    els.google.href = TZO.buildGoogleCalUrl({ title: "Time zone overlap meeting", description: description, startUtc: rec.startUtc, endUtc: rec.endUtc });
  }

  function buildCalendarDescription(rec) {
    return state.cities.map(function (city, i) { return rangeText(rec.perCity[i], city); }).join("\n") + "\n\n" + (rec.kind === "overlap" ? "Recommended overlap." : "Recommended fallback window.");
  }

  function buildTimelineAxis() {
    var axis = createElement("div", "axis");
    axis.appendChild(createElement("div", "axis-label", "Anchor local time"));
    var track = createElement("div", "axis-track");
    var slots = result.gridSlotCount;
    for (var i = 0; i <= slots; i += 1) {
      var instant = result.baseStartUtc + i * TZO.STEP_MS;
      if (i === slots || i % 12 === 0) {
        var tick = createElement("div", "axis-tick");
        tick.style.left = ((i / slots) * 100) + "%";
        var p = TZO.localParts(instant, state.cities[0].tz);
        tick.appendChild(createElement("span", "", formatParts(p)));
        track.appendChild(tick);
      }
    }
    axis.appendChild(track);
    return axis;
  }

  function slotClasses(index, cityIndex) {
    var slot = result.slots[index];
    var cls = "slot";
    if (slot.working[cityIndex]) cls += " working";
    else cls += " muted";
    if (slot.overlap) cls += " overlap";
    if (result.nowSlotIndex === index) cls += " now";
    return cls;
  }

  function addDstMarkers(track, city) {
    for (var i = 1; i < result.slots.length; i += 1) {
      var before = TZO.offsetMs(result.slots[i - 1].startUtc, city.tz);
      var after = TZO.offsetMs(result.slots[i].startUtc, city.tz);
      if (before !== after) {
        var marker = createElement("div", "dst-marker");
        marker.style.left = ((i / result.gridSlotCount) * 100) + "%";
        marker.appendChild(createElement("span", "", "Clock change"));
        track.appendChild(marker);
      }
    }
  }

  function renderTimeline() {
    while (els.timeline.firstChild) els.timeline.removeChild(els.timeline.firstChild);
    var inner = createElement("div", "timeline-inner");
    inner.appendChild(buildTimelineAxis());
    state.cities.forEach(function (city, cityIndex) {
      var row = createElement("div", "timeline-row");
      var label = createElement("div", "row-label");
      label.appendChild(createElement("strong", "", city.name));
      label.appendChild(createElement("span", "", city.tz));
      row.appendChild(label);
      var trackWrap = createElement("div", "row-track");
      var track = createElement("div", "slot-track");
      for (var i = 0; i < result.gridSlotCount; i += 1) {
        var slot = createElement("div", slotClasses(i, cityIndex));
        slot.style.left = ((i / result.gridSlotCount) * 100) + "%";
        slot.style.width = ((1 / result.gridSlotCount) * 100) + "%";
        track.appendChild(slot);
      }
      addDstMarkers(track, city);
      trackWrap.appendChild(track);
      row.appendChild(trackWrap);
      inner.appendChild(row);
    });
    var legend = createElement("div", "timeline-legend");
    var l1 = createElement("span", "legend-item"); l1.append(createElement("i", "legend-swatch overlap"), createElement("span", "", "Overlap"));
    var l2 = createElement("span", "legend-item"); l2.append(createElement("i", "legend-swatch"), createElement("span", "", "Working"));
    var l3 = createElement("span", "legend-item"); l3.append(createElement("i", "legend-swatch muted"), createElement("span", "", "Outside working hours"));
    legend.append(l1, l2, l3);
    inner.appendChild(legend);
    els.timeline.appendChild(inner);
    if (result.nowSlotIndex >= 0) els.currentTime.textContent = "NOW is inside the displayed search window.";
    else els.currentTime.textContent = "Current time is outside the selected date.";
  }

  function renderTable() {
    while (els.tableBody.firstChild) els.tableBody.removeChild(els.tableBody.firstChild);
    if (!result.overlapRanges.length) {
      var tr = document.createElement("tr");
      var td = createElement("td", "", "No full overlap range is available. The recommendation above is the fallback window.");
      td.colSpan = 2; tr.appendChild(td); els.tableBody.appendChild(tr); return;
    }
    result.overlapRanges.forEach(function (range, index) {
      var tr = document.createElement("tr");
      var td1 = createElement("td", "", "Range " + (index + 1) + " · " + Math.round((range.endUtc - range.startUtc) / 60000) + " min");
      var td2 = document.createElement("td");
      state.cities.forEach(function (city, cityIndex) {
        var r = range.perCity[cityIndex];
        var line = createElement("div", "", rangeText(r, city));
        td2.appendChild(line);
      });
      tr.append(td1, td2); els.tableBody.appendChild(tr);
    });
  }

  function setActionStatus(text) { els.actionStatus.textContent = text; }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(area);
    if (ok) return Promise.resolve(true);
    return Promise.resolve(false);
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  function copyResult() {
    if (!result || !result.recommendation) return;
    var rec = result.recommendation;
    var text = (rec.kind === "overlap" ? "Recommended overlap" : "Recommended fallback") + "\n" + state.cities[0].name + ": " + formatParts(TZO.localParts(rec.startUtc, state.cities[0].tz)) + "–" + formatParts(TZO.localParts(rec.endUtc, state.cities[0].tz)) + "\n" + state.cities.map(function (city, i) { return rangeText(rec.perCity[i], city); }).join("\n");
    copyText(text).then(function (ok) { setActionStatus(ok ? "Result copied." : "Copy failed. Select the text manually from View as table."); });
  }

  function copyLink() {
    copyText(location.href).then(function (ok) { setActionStatus(ok ? "Share link copied." : "Copy failed. You can copy the address bar URL manually."); });
  }

  function downloadIcs() {
    if (!result || !result.recommendation) return;
    var rec = result.recommendation;
    var description = buildCalendarDescription(rec);
    var uid = "tzo-" + rec.startUtc + "-" + rec.endUtc + "@time-zone-overlap-finder";
    var ics = TZO.buildIcs({ nowMs: NOW_MS, uid: uid, startUtc: rec.startUtc, endUtc: rec.endUtc, title: "Time zone overlap meeting", description: description });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "time-zone-overlap-meeting.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    setActionStatus("Calendar file downloaded.");
  }

  function loadTheme() {
    var theme = null;
    try { theme = localStorage.getItem("tzo-theme"); } catch (e) {}
    if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    els.theme.textContent = theme === "dark" ? "Light" : "Dark";
  }

  function toggleTheme() {
    var current = document.documentElement.dataset.theme;
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    els.theme.textContent = next === "dark" ? "Light" : "Dark";
    try { localStorage.setItem("tzo-theme", next); } catch (e) {}
  }

  function loadFormatPreference(parsed) {
    var stored = null;
    try { stored = localStorage.getItem("tzo-format"); } catch (e) {}
    if (location.search.indexOf("f=") < 0 && (stored === "12" || stored === "24")) parsed.hourFormat = Number(stored);
    return parsed;
  }

  function saveFormatPreference() {
    try { localStorage.setItem("tzo-format", String(state.hourFormat)); } catch (e) {}
  }

  function resetState() {
    var detected = TZO.resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
    state = TZO.parseUrlState("", { cities: CITIES, nowMs: NOW_MS, detectedTz: detected });
    recompute(true);
    renderCities();
    recompute(true);
  }

  function bindGlobalEvents() {
    els.addCity.addEventListener("click", addCity);
    els.reset.addEventListener("click", resetState);
    els.date.addEventListener("change", function () {
      var checked = TZO.validateDate(els.date.value, { nowMs: NOW_MS });
      if (checked.ok) state.date = checked.date;
      recompute(true);
    });
    document.querySelectorAll("[data-format]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.hourFormat = Number(button.dataset.format);
        saveFormatPreference();
        recompute(true);
      });
    });
    document.querySelectorAll("[data-length]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.meetingLength = Number(button.dataset.length);
        recompute(true);
      });
    });
    els.copyResult.addEventListener("click", copyResult);
    els.copyLink.addEventListener("click", copyLink);
    els.downloadIcs.addEventListener("click", downloadIcs);
    els.theme.addEventListener("click", toggleTheme);
    document.addEventListener("click", function (event) {
      if (activeCombobox && !activeCombobox.contains(event.target)) closeCombobox(activeCombobox);
    });
  }

  loadTheme();
  var detectedTz = TZO.resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  state = loadFormatPreference(TZO.parseUrlState(location.search, { cities: CITIES, nowMs: NOW_MS, detectedTz: detectedTz }));
  bindGlobalEvents();
  renderCities();
  recompute(false);
})();
