(function () {
  "use strict";

  var TZO = globalThis.TZO;
  var CITIES = globalThis.TZO_CITIES || [];
  if (!TZO || !CITIES.length) return;

  var NOW_MS = Date.now();
  var DEFAULT_SCHEDULE = { start: 540, end: 1080, lunch: 0 };
  var MAX_CITIES = 3;
  var state;
  var result;
  var commitTimer = null;
  var searchTimers = new Map();
  var activeCombobox = null;
  var language = "en";
  var LANG = {"en":{"brand":"Time Zone Meeting Planner","heroEyebrow":"TIME ZONES · WORKING HOURS · DST AWARE","heroTitle":"Time Zone Meeting Planner","heroCopy":"Find overlapping working hours across cities and choose a meeting time that works for everyone, including daylight-saving changes.","meetingSettings":"Overlap settings","meetingSettingsCopy":"Choose cities, working hours, date, and the minimum overlap length.","reset":"Reset","date":"Date","timeFormat":"Time format","hour24":"24-hour","hour12":"12-hour","meetingLength":"Minimum overlap","min30":"30 min","min60":"60 min","min90":"90 min","recommendationEyebrow":"RECOMMENDATION","bestMeetingTime":"Best overlap time","bestTimeLabel":"BEST TIME","alternativeTimes":"Other available times","whyThisTime":"Why this time?","allCitiesInside":"All cities are within the selected working hours.","fallbackReason":"No full overlap is available, so this is the best available alternative.","calculating":"Calculating","copyResult":"Copy result","copyLink":"Copy link","utcAxis":"UTC AXIS","timelineTitle":"Overlap timeline","timelineCopy":"The anchor city is the first city. The axis follows its local date while every row shows its own local time.","viewTable":"View overlap table","tableCaption":"Overlap ranges and each city's local time","overlap":"Overlap","localTimes":"Local times","helpTitle":"How to use this tool","helpCopy":"The timeline uses one shared UTC axis; each city row shows the local clock for that instant. The anchor city is the first city and defines the selected calendar date. A recommended overlap is fully inside everyone's working hours. If none is long enough, the fallback recommendation is the least disruptive window according to the tool's deterministic scoring rules. Future dates use current time-zone rules, which governments may change.","footerCopy":"Time Zone Overlap Finder runs in your browser. No account or server-side calculation is required.","addCity":"+ Add city","maxCities":"Maximum 3 cities","remove":"Remove","searchPlaceholder":"Search city","noMatchingCity":"No matching city","alreadySelected":"That city is already selected.","startTime":"Start time","endTime":"End time","lunchBreak":"lunch break","lunchLabel":"Lunch 12:00–13:00","sameDay":"same day","daySingular":"day","endDateChanges":"end date changes; ","sameTimezone":"and","sameZone":"use the same time zone.","sameOffset":"have the same UTC offset throughout this window.","non15":"This time zone has a non-15-minute offset in the displayed window; the timeline still uses the tool's 15-minute calculation grid.","noWindow":"No window","noValidWindow":"No valid meeting window is available in this search window.","fits":"Fits","fallback":"Fallback","allWorking":"All cities are working.","bestFallback":"Best available fallback according to the scoring rules.","recommendedOverlap":"Recommended overlap.","recommendedFallback":"Recommended fallback window.","anchorLocal":"Anchor local time","clockChange":"Clock change","legendOverlap":"Overlap","legendWorking":"Working","legendOutside":"Outside working hours","nowInside":"NOW is inside the displayed search window.","nowOutside":"Current time is outside the selected date.","noFullOverlap":"No full overlap range is available. The recommendation above is the fallback window.","range":"Range","minutes":"min","resultCopied":"Result copied.","copyFailedTable":"Copy failed. Select the text manually from View as table.","shareCopied":"Share link copied.","copyFailedUrl":"Copy failed. You can copy the address bar URL manually.","unableCalculate":"Unable to calculate this selection: ","identicalReset":"Start and end cannot be identical; the schedule was reset to 09:00–18:00.","themeDark":"Dark","themeLight":"Light","switchKorean":"Switch to Korean","switchEnglish":"Switch to English","ariaTimeFormat":"Time format","ariaMeetingLength":"Meeting length","ariaTimeline":"Working-hour timeline"},"ko":{"brand":"Time Zone Meeting Planner","heroEyebrow":"시간대 · 근무시간 · 서머타임 지원","heroTitle":"Time Zone Meeting Planner","heroCopy":"여러 도시의 근무시간을 비교해 모두에게 맞는 회의 시간을 찾아보세요. 서머타임 변경도 반영합니다.","meetingSettings":"겹침 시간 설정","meetingSettingsCopy":"도시, 근무시간, 날짜와 최소 겹침 시간을 선택하세요.","reset":"초기화","date":"날짜","timeFormat":"시간 형식","hour24":"24시간","hour12":"12시간","meetingLength":"최소 겹침 시간","min30":"30분","min60":"60분","min90":"90분","recommendationEyebrow":"추천","bestMeetingTime":"가장 적합한 겹침 시간","bestTimeLabel":"가장 좋은 시간","alternativeTimes":"다른 가능한 시간","whyThisTime":"이 시간이 추천되는 이유","allCitiesInside":"모든 도시가 선택한 근무시간 안에 있습니다.","fallbackReason":"모든 도시가 동시에 겹치는 시간이 없어 가장 적합한 대체 시간을 보여줍니다.","calculating":"계산 중","copyResult":"결과 복사","copyLink":"링크 복사","utcAxis":"UTC 축","timelineTitle":"겹침시간 타임라인","timelineCopy":"첫 번째 도시가 기준 도시입니다. 축은 기준 도시의 현지 날짜를 따르며 각 행에는 해당 도시의 현지 시간이 표시됩니다.","viewTable":"겹침시간 표로 보기","tableCaption":"겹치는 시간 범위와 각 도시의 현지 시간","overlap":"겹치는 시간","localTimes":"현지 시간","helpTitle":"사용 방법","helpCopy":"타임라인은 하나의 UTC 축을 사용하며 각 도시 행에는 해당 순간의 현지 시간이 표시됩니다. 첫 번째 도시가 기준 도시이며 선택한 날짜를 결정합니다. 추천 시간은 모든 도시의 근무시간 안에 완전히 포함됩니다. 충분히 긴 겹침이 없으면 도구의 결정적 점수 규칙에 따라 가장 부담이 적은 대체 시간을 추천합니다. 미래 날짜에는 각국 정부가 변경할 수 있는 현재 시간대 규칙이 적용됩니다.","footerCopy":"Time Zone Overlap Finder는 브라우저에서 실행됩니다. 계정이나 서버 측 계산이 필요하지 않습니다.","addCity":"+ 도시 추가","maxCities":"최대 3개 도시","remove":"삭제","searchPlaceholder":"도시 검색","noMatchingCity":"일치하는 도시가 없습니다","alreadySelected":"이미 선택된 도시입니다.","startTime":"시작 시간","endTime":"종료 시간","lunchBreak":"점심시간","lunchLabel":"점심 12:00–13:00","sameDay":"같은 날","daySingular":"일","endDateChanges":"종료 날짜 변경; ","sameTimezone":"및","sameZone":"동일한 시간대를 사용합니다.","sameOffset":"이 시간 범위에서 동일한 UTC 오프셋을 사용합니다.","non15":"이 시간대는 표시된 범위에서 15분 단위가 아닌 오프셋을 사용합니다. 타임라인은 도구의 15분 계산 단위를 그대로 사용합니다.","noWindow":"가능한 시간이 없음","noValidWindow":"이 검색 범위에서 유효한 회의 시간을 찾을 수 없습니다.","fits":"가능","fallback":"대체 시간","allWorking":"모든 도시가 근무시간입니다.","bestFallback":"점수 규칙에 따른 가장 적합한 대체 시간입니다.","recommendedOverlap":"추천 겹침 시간입니다.","recommendedFallback":"추천 대체 시간입니다.","anchorLocal":"기준 도시 현지 시간","clockChange":"시계 변경","legendOverlap":"겹침","legendWorking":"근무시간","legendOutside":"근무시간 외","nowInside":"현재 시간이 표시된 검색 범위 안에 있습니다.","nowOutside":"현재 시간은 선택한 날짜의 범위 밖에 있습니다.","noFullOverlap":"전체 도시가 동시에 겹치는 시간이 없습니다. 위의 추천은 대체 시간입니다.","range":"범위","minutes":"분","resultCopied":"결과를 복사했습니다.","copyFailedTable":"복사하지 못했습니다. 표 보기에서 텍스트를 직접 선택해 주세요.","shareCopied":"공유 링크를 복사했습니다.","copyFailedUrl":"복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.","unableCalculate":"선택한 조건을 계산할 수 없습니다: ","identicalReset":"시작 시간과 종료 시간이 같을 수 없어 09:00–18:00으로 초기화했습니다.","themeDark":"다크","themeLight":"라이트","switchKorean":"한국어로 전환","switchEnglish":"영어로 전환","ariaTimeFormat":"시간 형식","ariaMeetingLength":"회의 시간","ariaTimeline":"겹침시간 타임라인"}};
  function t(key) { return LANG[language][key] || LANG.en[key] || key; }
  function loadLanguage() { var stored = null; try { stored = localStorage.getItem("tzo-language"); } catch (e) {} language = stored === "ko" ? "ko" : "en"; }
  function applyLanguage() {
    document.documentElement.lang = language;
    document.title = "Time Zone Meeting Planner | Find Overlapping Hours";
    document.querySelectorAll("[data-i18n]").forEach(function (node) { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
    els.language.textContent = language === "en" ? "한국어" : "English";
    els.language.setAttribute("aria-label", language === "en" ? t("switchKorean") : t("switchEnglish"));
    els.language.title = language === "en" ? t("switchKorean") : t("switchEnglish");
    els.timeline.setAttribute("aria-label", t("ariaTimeline"));
    els.theme.textContent = document.documentElement.dataset.theme === "dark" ? t("themeLight") : t("themeDark");
  }
  function toggleLanguage() { language = language === "en" ? "ko" : "en"; try { localStorage.setItem("tzo-language", language); } catch (e) {} applyLanguage(); renderCities(); recompute(false); }

  var els = {
    cityList: document.getElementById("city-list"),
    addCity: document.getElementById("add-city"),
    date: document.getElementById("date-input"),
    dateNote: document.getElementById("date-note"),
    recommendation: document.getElementById("recommendation"),
    summaryLive: document.getElementById("summary-live"),
    timeline: document.getElementById("timeline"),
    tableBody: document.querySelector("#overlap-table tbody"),
    notices: document.getElementById("notice-stack"),
    copyResult: document.getElementById("copy-result"),
    copyLink: document.getElementById("copy-link"),
    actionStatus: document.getElementById("action-status"),
    reset: document.getElementById("reset-button"),
    theme: document.getElementById("theme-toggle"),
    language: document.getElementById("language-toggle")
  };

  function cityById(id) {
    for (var i = 0; i < CITIES.length; i += 1) if (CITIES[i].id === id) return CITIES[i];
    return null;
  }

  function cityIndex(city) {
    return state.cities.indexOf(city);
  }

  function continentForRegion(region) {
    var map = { na: "North America", sa: "South America", eu: "Europe", me: "Asia", af: "Africa", as: "Asia", oc: "Oceania" };
    return map[region] || "World";
  }

  function cityLocationLabel(city) {
    return continentForRegion(city.region) + "/" + city.country;
  }


  function nowIsoDate() {
    var d = new Date(NOW_MS);
    return d.toISOString().slice(0, 10);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dateLabel(s) {
    var d = new Date(s + "T00:00:00Z");
    return new Intl.DateTimeFormat(language === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
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
    var day = range.dayOffset === 0 ? t("sameDay") : (language === "ko" ? (range.dayOffset > 0 ? "+" + range.dayOffset + t("daySingular") : range.dayOffset + t("daySingular")) : (range.dayOffset > 0 ? "+" + range.dayOffset + " " + t("daySingular") + (range.dayOffset === 1 ? "" : "s") : range.dayOffset + " " + t("daySingular") + (range.dayOffset === -1 ? "" : "s")));
    if (range.endDateDiffers) return city.name + ": " + s + "–" + e + " (" + t("endDateChanges") + day + ")";
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
    var meta = createElement("span", "", cityLocationLabel(city));
    option.append(strong, meta);
    option.dataset.cityId = city.id;
    return option;
  }

  function searchCities(query, currentCity) {
    var q = String(query || "").trim().toLowerCase();
    var candidates = CITIES.filter(function (city) {
      var selectedElsewhere = state.cities.some(function (selected) {
        return selected.id === city.id && selected.id !== currentCity.id;
      });
      if (selectedElsewhere) return false;
      var hay = [city.name, city.country, city.tz].concat(city.aliases || []).join(" ").toLowerCase();
      return !q || hay.indexOf(q) >= 0;
    });
    candidates.sort(function (a, b) {
      var aa = [a.name.toLowerCase()].concat(a.aliases || []).join(" ");
      var bb = [b.name.toLowerCase()].concat(b.aliases || []).join(" ");
      var aq = a.id === currentCity.id ? -1 : (q ? (aa.indexOf(q) === 0 ? 0 : aa.indexOf(q) >= 0 ? 1 : 2) : 2);
      var bq = b.id === currentCity.id ? -1 : (q ? (bb.indexOf(q) === 0 ? 0 : bb.indexOf(q) >= 0 ? 1 : 2) : 2);
      return aq - bq || b.rank - a.rank || a.name.localeCompare(b.name);
    });
    return candidates;
  }

  function updateListbox(card, index, query) {
    var box = card.querySelector(".city-listbox");
    var current = state.cities[index];
    while (box.firstChild) box.removeChild(box.firstChild);
    var choices = searchCities(query, current);
    if (!choices.length) {
      box.appendChild(createElement("div", "city-option", t("noMatchingCity")));
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
      setActionStatus(t("alreadySelected"));
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
      label.appendChild(createElement("div", "city-zone", cityLocationLabel(city)));
      top.appendChild(label);
      if (state.cities.length > 2) {
        var remove = createElement("button", "remove-city", t("remove"));
        remove.type = "button";
        remove.setAttribute("aria-label", t("remove") + " " + city.name);
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
       input.setAttribute("placeholder", t("searchPlaceholder"));
      var box = createElement("div", "city-listbox");
      box.id = "city-listbox-" + index;
      box.setAttribute("role", "listbox");
      box.hidden = true;
      wrap.append(input, box);
      card.appendChild(wrap);

      input.addEventListener("focus", function () {
        input.select();
        openCombobox(card, index);
        updateListbox(card, index, "");
      });
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
          opts[current].scrollIntoView({ block: "nearest" });
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
      [[t("startTime"), "start"], [t("endTime"), "end"]].forEach(function (item, part) {
         var labelText = item[0];
        var group = createElement("div");
        group.appendChild(createElement("label", "", labelText));
        var inputTime = createElement("input", "time-input");
        inputTime.type = "text";
         inputTime.inputMode = "numeric";
         inputTime.maxLength = 5;
         inputTime.pattern = "\\d{2}:\\d{2}";
         inputTime.placeholder = "HH:MM";
        
        inputTime.value = timeValue(part === 0 ? schedule.start : schedule.end);
        inputTime.setAttribute("aria-label", city.name + " " + labelText);
        inputTime.addEventListener("change", function () {
          var value = parseTime(inputTime.value);
          if (value === null) { inputTime.value = timeValue(schedule[item[1]]); return; }
          schedule[item[1]] = value;
          if (schedule.start === schedule.end) {
            schedule.start = 540; schedule.end = 1080;
            setActionStatus(t("identicalReset"));
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
      lunchInput.setAttribute("aria-label", city.name + " " + t("lunchBreak"));
      lunchInput.addEventListener("change", function () { schedule.lunch = lunchInput.checked ? 1 : 0; commitState(); });
      lunchLabel.append(lunchInput, createElement("span", "", t("lunchLabel")));
      lunch.appendChild(lunchLabel);
      sg.appendChild(lunch);
      card.appendChild(sg);
      els.cityList.appendChild(card);
    });
    els.addCity.hidden = state.cities.length >= MAX_CITIES;
    els.addCity.setAttribute("aria-hidden", state.cities.length >= MAX_CITIES ? "true" : "false");
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
      setActionStatus(t("unableCalculate") + error.message);
    }
  }

  function renderNotices() {
    while (els.notices.firstChild) els.notices.removeChild(els.notices.firstChild);
    result.sameTimezonePairs.forEach(function (pair) {
      var a = state.cities[pair.a], b = state.cities[pair.b];
      var text = pair.reason === "same-id" ? a.name + " " + t("sameTimezone") + " " + b.name + " " + t("sameZone") : a.name + " " + t("sameTimezone") + " " + b.name + " " + t("sameOffset");
      els.notices.appendChild(createElement("div", "notice", text));
    });
    result.warnings.forEach(function (warning) {
      if (warning.code === "non-15-minute-offset") els.notices.appendChild(createElement("div", "notice warning", t("non15")));
    });
  }

  function recommendationDuration() {
    if (!result || !result.recommendation) return 0;
    return Math.round((result.recommendation.endUtc - result.recommendation.startUtc) / 60000);
  }

  function alternativeRanges() {
    if (!result || !result.meetingFits || !Array.isArray(result.overlapRanges)) return [];
    var needed = Number(state.meetingLength) || 60;
    var ranges = [];
    result.overlapRanges.forEach(function (range) {
      var maxStart = range.endUtc - needed * 60000;
      if (maxStart < range.startUtc) return;
      for (var startUtc = range.startUtc; startUtc <= maxStart && ranges.length < 3; startUtc += needed * 60000) {
        var endUtc = startUtc + needed * 60000;
        if (!ranges.some(function (item) { return item.startUtc === startUtc; })) {
          ranges.push({ startUtc: startUtc, endUtc: endUtc });
        }
      }
    });
    return ranges.slice(0, 3);
  }

  function renderResult() {
    while (els.recommendation.firstChild) els.recommendation.removeChild(els.recommendation.firstChild);
    if (!result.recommendation) {
      els.recommendation.appendChild(createElement("div", "recommendation-main", t("noValidWindow")));
      return;
    }

    var rec = result.recommendation;
    var anchorCity = state.cities[0];
    var ap = TZO.localParts(rec.startUtc, anchorCity.tz);
    var ep = TZO.localParts(rec.endUtc, anchorCity.tz);

    var badge = createElement("span", "status-badge " + (rec.kind === "overlap" ? "success" : "fallback"), rec.kind === "overlap" ? t("bestTimeLabel") : t("fallback"));
    var main = createElement("div", "recommendation-main", formatParts(ap) + "–" + formatParts(ep) + " · " + anchorCity.name);
    var dateText = dateLabel(state.date);
    var subText = dateText + " · " + recommendationDuration() + " " + t("minutes");
    var sub = createElement("div", "recommendation-sub", subText);

    var cityList = createElement("div", "per-city-list");
    state.cities.forEach(function (city, cityIndex) {
      var range = rec.perCity[cityIndex];
      var item = createElement("div", "per-city");
      item.append(
        createElement("strong", "", city.name),
        createElement("span", "", formatParts(range.start) + "–" + formatParts(range.end))
      );
      cityList.appendChild(item);
    });

    var why = createElement("div", "recommendation-why");
    why.append(
      createElement("strong", "", t("whyThisTime")),
      createElement("span", "", rec.kind === "overlap" ? t("allCitiesInside") : t("fallbackReason"))
    );

    els.recommendation.append(badge, main, sub, cityList, why);

    var alternatives = alternativeRanges().filter(function (range) {
      return range.startUtc !== rec.startUtc;
    }).slice(0, 2);

    if (alternatives.length) {
      var altBlock = createElement("div", "recommendation-alternatives");
      altBlock.appendChild(createElement("div", "alternative-title", t("alternativeTimes")));
      alternatives.forEach(function (range) {
        var start = TZO.localParts(range.startUtc, anchorCity.tz);
        var end = TZO.localParts(range.endUtc, anchorCity.tz);
        altBlock.appendChild(createElement("div", "alternative-time", formatParts(start) + "–" + formatParts(end) + " · " + anchorCity.name));
      });
      els.recommendation.appendChild(altBlock);
    }
  }


  function buildLocalTimeScale(city) {
    var scale = createElement("div", "row-time-scale");
    var points = 13;
    for (var i = 0; i < points; i += 1) {
      var slotIndex = Math.min(result.gridSlotCount, i * 8);
      var instant = result.baseStartUtc + slotIndex * TZO.STEP_MS;
      var parts = TZO.localParts(instant, city.tz);
      var tick = createElement("span", "row-time-tick", String(parts.hh));
      tick.style.left = ((i / (points - 1)) * 100) + "%";
      if (i === 0) tick.classList.add("first");
      if (i === points - 1) tick.classList.add("last");
      scale.appendChild(tick);
    }
    return scale;
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
        marker.appendChild(createElement("span", "", t("clockChange")));
        track.appendChild(marker);
      }
    }
  }

  function renderTimeline() {
    while (els.timeline.firstChild) els.timeline.removeChild(els.timeline.firstChild);
    var inner = createElement("div", "timeline-inner");
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
      trackWrap.appendChild(buildLocalTimeScale(city));
      trackWrap.appendChild(track);
      row.appendChild(trackWrap);
      inner.appendChild(row);
    });
    var legend = createElement("div", "timeline-legend");
    var l1 = createElement("span", "legend-item"); l1.append(createElement("i", "legend-swatch overlap"), createElement("span", "", t("legendOverlap")));
    var l2 = createElement("span", "legend-item"); l2.append(createElement("i", "legend-swatch"), createElement("span", "", t("legendWorking")));
    var l3 = createElement("span", "legend-item"); l3.append(createElement("i", "legend-swatch muted"), createElement("span", "", t("legendOutside")));
    legend.append(l1, l2, l3);
    inner.appendChild(legend);
    els.timeline.appendChild(inner);
  }

  function renderTable() {
    while (els.tableBody.firstChild) els.tableBody.removeChild(els.tableBody.firstChild);
    if (!result.overlapRanges.length) {
      var tr = document.createElement("tr");
      var td = createElement("td", "", t("noFullOverlap"));
      td.colSpan = 2; tr.appendChild(td); els.tableBody.appendChild(tr); return;
    }
    result.overlapRanges.forEach(function (range, index) {
      var tr = document.createElement("tr");
      var duration = Math.round((range.endUtc - range.startUtc) / 60000);
      var td1 = createElement("td");
      td1.appendChild(createElement("strong", "table-range-title", t("range") + " " + (index + 1)));
      td1.appendChild(createElement("span", "table-range-duration", duration + " " + t("minutes")));
      var td2 = createElement("td", "table-city-times");
      state.cities.forEach(function (city, cityIndex) {
        var r = range.perCity[cityIndex];
        var line = createElement("div", "table-city-time");
        line.appendChild(createElement("strong", "", city.name));
        line.appendChild(createElement("span", "", formatParts(r.start) + "–" + formatParts(r.end)));
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
    var text = (rec.kind === "overlap" ? t("recommendedOverlap") : t("recommendedFallback")) + "\n" + state.cities[0].name + ": " + formatParts(TZO.localParts(rec.startUtc, state.cities[0].tz)) + "–" + formatParts(TZO.localParts(rec.endUtc, state.cities[0].tz)) + "\n" + state.cities.map(function (city, i) { return rangeText(rec.perCity[i], city); }).join("\n");
    copyText(text).then(function (ok) { setActionStatus(ok ? t("resultCopied") : t("copyFailedTable")); });
  }

  function copyLink() {
    copyText(location.href).then(function (ok) { setActionStatus(ok ? t("shareCopied") : t("copyFailedUrl")); });
  }

  function loadTheme() {
    var theme = null;
    try { theme = localStorage.getItem("tzo-theme"); } catch (e) {}
    if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    els.theme.textContent = theme === "dark" ? t("themeLight") : t("themeDark");
  }

  function toggleTheme() {
    var current = document.documentElement.dataset.theme;
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    els.theme.textContent = next === "dark" ? t("themeLight") : t("themeDark");
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

  function addCity() {
    if (state.cities.length >= MAX_CITIES) return;
    var nextCity = CITIES.find(function (city) {
      return !state.cities.some(function (selected) { return selected.id === city.id; });
    });
    if (!nextCity) return;
    state.cities.push(nextCity);
    state.schedules.push(Object.assign({}, DEFAULT_SCHEDULE));
    renderCities();
    commitState();
  }

  function bindGlobalEvents() {
    els.reset.addEventListener("click", resetState);
    els.addCity.addEventListener("click", addCity);
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
    els.theme.addEventListener("click", toggleTheme);
    els.language.addEventListener("click", toggleLanguage);
    document.addEventListener("click", function (event) {
      if (activeCombobox && !activeCombobox.contains(event.target)) closeCombobox(activeCombobox);
    });
  }

  loadLanguage();
  loadTheme();
  applyLanguage();
  var detectedTz = TZO.resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  state = loadFormatPreference(TZO.parseUrlState(location.search, { cities: CITIES, nowMs: NOW_MS, detectedTz: detectedTz }));
  if (!state.cities || !state.cities.length) {
    var detectedCity = null;
    for (var ci = 0; ci < CITIES.length; ci += 1) {
      if (CITIES[ci].tz === detectedTz) { detectedCity = CITIES[ci]; break; }
    }
    var london = cityById("london");
    var firstCity = detectedCity || CITIES[0];
    var secondCity = london && london.id !== firstCity.id ? london : CITIES.find(function (city) { return city.id !== firstCity.id; });
    state.cities = [firstCity, secondCity || firstCity];
    state.schedules = [Object.assign({}, DEFAULT_SCHEDULE), Object.assign({}, DEFAULT_SCHEDULE)];
  }
  if (!state.schedules || state.schedules.length < state.cities.length) {
    while (state.schedules.length < state.cities.length) state.schedules.push(Object.assign({}, DEFAULT_SCHEDULE));
  }
  if (state.cities.length > MAX_CITIES) { state.cities = state.cities.slice(0, MAX_CITIES); state.schedules = state.schedules.slice(0, MAX_CITIES); }
  bindGlobalEvents();
  renderCities();
  recompute(false);
})();
