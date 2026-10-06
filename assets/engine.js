(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TZO = factory();
  }
})(globalThis, function () {
  "use strict";

  var STEP_MS = 15 * 60 * 1000;
  var MINUTE_MS = 60 * 1000;
  var HOUR_MS = 60 * MINUTE_MS;
  var MAX_CORRECTION_ITERATIONS = 8;
  var SCAN_BACK_MS = 36 * HOUR_MS;
  var SCAN_SPAN_MS = 72 * HOUR_MS;
  var COARSE_STEP_MS = STEP_MS;
  var EXTENSION_SLOTS = 96;

  var TZ_ALIASES = Object.freeze({
    "Asia/Calcutta": "Asia/Kolkata",
    "Europe/Kiev": "Europe/Kyiv",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "America/Godthab": "America/Nuuk",
    "America/Atka": "America/Adak",
    "America/Ensenada": "America/Tijuana",
    "America/Shiprock": "America/Denver",
    "Pacific/Ponape": "Pacific/Pohnpei",
    "Pacific/Truk": "Pacific/Chuuk",
    "Pacific/Yap": "Pacific/Chuuk",
    "Pacific/Samoa": "Pacific/Pago_Pago",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Asia/Rangoon": "Asia/Yangon",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
    "Asia/Tel_Aviv": "Asia/Jerusalem",
    "Europe/Belfast": "Europe/London",
    "Europe/Tiraspol": "Europe/Chisinau",
    "Europe/Zaporozhye": "Europe/Zaporizhzhia",
    "America/Argentina/Buenos_Aires": "America/Argentina/Buenos_Aires"
  });

  var formatterCache = new Map();
  var midnightCache = new Map();
  var localPartsCache = new Map();
  var LOCAL_PARTS_CACHE_LIMIT = 50000;
  var computeCache = new Map();
  var COMPUTE_CACHE_LIMIT = 8;

  function canonicalAlias(tz) {
    if (typeof tz !== "string") return null;
    var s = tz.trim();
    if (!s) return null;
    return TZ_ALIASES[s] || s;
  }

  function acceptsTimeZone(tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format();
      return true;
    } catch (e) {
      return false;
    }
  }

  function resolveTimeZone(tz) {
    var canonical = canonicalAlias(tz);
    if (!canonical) return null;
    if (acceptsTimeZone(canonical)) return canonical;
    var keys = Object.keys(TZ_ALIASES);
    for (var i = 0; i < keys.length; i += 1) {
      if (TZ_ALIASES[keys[i]] === canonical && acceptsTimeZone(keys[i])) {
        return keys[i];
      }
    }
    return null;
  }

  function getFormatter(tz) {
    var resolved = resolveTimeZone(tz);
    if (!resolved) throw new RangeError("Invalid time zone: " + tz);
    if (!formatterCache.has(resolved)) {
      formatterCache.set(resolved, new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
        timeZone: resolved,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }));
    }
    return formatterCache.get(resolved);
  }

  function partsObject(utcMs, tz) {
    var parts = getFormatter(tz).formatToParts(new Date(utcMs));
    var out = {};
    for (var i = 0; i < parts.length; i += 1) {
      if (parts[i].type !== "literal") out[parts[i].type] = Number(parts[i].value);
    }
    if (out.hour === 24) out.hour = 0;
    return {
      y: out.year,
      m: out.month,
      d: out.day,
      hh: out.hour,
      mm: out.minute,
      ss: out.second
    };
  }

  function localParts(utcMs, tz) {
    var resolved = resolveTimeZone(tz);
    if (!resolved) throw new RangeError("Invalid time zone: " + tz);
    var key = resolved + "|" + String(utcMs);
    if (localPartsCache.has(key)) return localPartsCache.get(key);
    var value = partsObject(utcMs, resolved);
    if (localPartsCache.size >= LOCAL_PARTS_CACHE_LIMIT) {
      var firstKey = localPartsCache.keys().next().value;
      localPartsCache.delete(firstKey);
    }
    localPartsCache.set(key, value);
    return value;
  }

  function floorToSecond(ms) {
    return Math.floor(ms / 1000) * 1000;
  }

  function offsetMs(utcMs, tz) {
    var p = localParts(utcMs, tz);
    var localAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    return localAsUtc - floorToSecond(utcMs);
  }

  function sameDate(a, y, m, d) {
    return a.y === y && a.m === m && a.d === d;
  }

  function localMidnightUtc(tz, y, m, d) {
    var resolved = resolveTimeZone(tz);
    if (!resolved) throw new RangeError("Invalid time zone: " + tz);
    var cacheKey = resolved + "|" + y + "-" + m + "-" + d;
    if (midnightCache.has(cacheKey)) return midnightCache.get(cacheKey);
    var target = Date.UTC(y, m - 1, d, 0, 0, 0);
    var guess = target;
    for (var i = 0; i < MAX_CORRECTION_ITERATIONS; i += 1) {
      var next = target - offsetMs(guess, resolved);
      if (next === guess) break;
      guess = next;
    }

    var scanStart = guess - SCAN_BACK_MS;
    var foundBucket = -1;
    for (var t = scanStart; t <= scanStart + SCAN_SPAN_MS; t += COARSE_STEP_MS) {
      if (sameDate(localParts(t, resolved), y, m, d)) {
        foundBucket = t;
        break;
      }
    }
    if (foundBucket < 0) {
      throw new RangeError("Unable to resolve local calendar date " +
        pad4(y) + "-" + pad2(m) + "-" + pad2(d) + " in " + resolved);
    }

    var refineStart = foundBucket - COARSE_STEP_MS;
    var refineEnd = foundBucket;
    var result = -1;
    for (var u = refineStart; u <= refineEnd; u += MINUTE_MS) {
      if (sameDate(localParts(u, resolved), y, m, d)) {
        result = u;
        break;
      }
    }
    if (result < 0) {
      for (var v = foundBucket; v <= foundBucket + COARSE_STEP_MS; v += MINUTE_MS) {
        if (sameDate(localParts(v, resolved), y, m, d)) {
          result = v;
          break;
        }
      }
    }
    if (result < 0 || !sameDate(localParts(result, resolved), y, m, d)) {
      throw new RangeError("Unable to resolve local calendar date " +
        pad4(y) + "-" + pad2(m) + "-" + pad2(d) + " in " + resolved);
    }
    while (sameDate(localParts(result - MINUTE_MS, resolved), y, m, d)) {
      result -= MINUTE_MS;
    }
    midnightCache.set(cacheKey, result);
    return result;
  }

  function datePartsFromUtcDate(ms) {
    var d = new Date(ms);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  function addUtcDays(y, m, d, days) {
    return datePartsFromUtcDate(Date.UTC(y, m - 1, d + days));
  }

  function dateKey(y, m, d) {
    return pad4(y) + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseDateKey(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var y = Number(s.slice(0, 4));
    var m = Number(s.slice(5, 7));
    var d = Number(s.slice(8, 10));
    var check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return null;
    return { y: y, m: m, d: d };
  }

  function defaultDateFor(city, opts) {
    var p = localParts(opts.nowMs, city.tz);
    return dateKey(p.y, p.m, p.d);
  }

  function validateDate(dateString, opts) {
    var p = parseDateKey(dateString);
    if (!p) return { ok: false, date: null, clamped: false, reason: /^\d{4}-\d{2}-\d{2}$/.test(String(dateString || "")) ? "calendar" : "format" };
    var now = datePartsFromUtcDate(opts.nowMs);
    var lower = addUtcDays(now.y, now.m, now.d, 0);
    lower = { y: now.y - 2, m: now.m, d: now.d };
    var upper = { y: now.y + 2, m: now.m, d: now.d };
    if (now.m === 2 && now.d === 29) {
      if (!isLeapYear(lower.y)) lower.d = 28;
      if (!isLeapYear(upper.y)) upper.d = 28;
    }
    var key = dateKey(p.y, p.m, p.d);
    var lo = dateKey(lower.y, lower.m, lower.d);
    var hi = dateKey(upper.y, upper.m, upper.d);
    if (key < lo) return { ok: true, date: lo, clamped: true, reason: null };
    if (key > hi) return { ok: true, date: hi, clamped: true, reason: null };
    return { ok: true, date: key, clamped: false, reason: null };
  }

  function isLeapYear(y) {
    return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  }

  function findCityByTz(tz, opts) {
    var resolved = resolveTimeZone(tz);
    if (!resolved) return null;
    var cities = opts && opts.cities ? opts.cities : [];
    var matches = [];
    for (var i = 0; i < cities.length; i += 1) {
      var cityResolved = resolveTimeZone(cities[i].tz);
      if (cityResolved === resolved) matches.push(cities[i]);
    }
    matches.sort(function (a, b) {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return matches.length ? matches[0] : null;
  }

  function zoneDisplayName(resolved, nowMs) {
    var last = resolved.split("/").pop().replace(/_/g, " ");
    if (/^Etc\/GMT[+-]\d+$/.test(resolved)) {
      var off = offsetMs(nowMs, resolved);
      var sign = off < 0 ? "-" : "+";
      var abs = Math.abs(off);
      return "UTC" + sign + pad2(Math.floor(abs / HOUR_MS)) + ":" + pad2(Math.floor((abs % HOUR_MS) / MINUTE_MS)) + " (" + resolved + ")";
    }
    return last;
  }

  function createSyntheticCity(tz, opts) {
    var resolved = resolveTimeZone(tz);
    if (!resolved) return null;
    return {
      id: "z:" + resolved,
      synthetic: true,
      name: opts && opts.name ? String(opts.name) : zoneDisplayName(resolved, opts.nowMs),
      country: "",
      region: "",
      tz: resolved,
      rank: 0,
      aliases: []
    };
  }

  function minutesOfDay(p) {
    return p.hh * 60 + p.mm;
  }

  function scheduleWorking(minute, schedule) {
    if (schedule.start === schedule.end) throw new RangeError("Schedule start and end must differ");
    var working = schedule.start < schedule.end ? minute >= schedule.start && minute < schedule.end : (minute >= schedule.start || minute < schedule.end);
    if (working && schedule.lunch === 1 && minute >= 720 && minute < 780) return false;
    return working;
  }

  function validateState(state) {
    if (!state || !Array.isArray(state.cities) || state.cities.length < 2 || state.cities.length > 5) throw new RangeError("State must contain 2 to 5 cities");
    if (!Array.isArray(state.schedules) || state.schedules.length !== state.cities.length) throw new RangeError("Schedules must match cities");
    if ([30, 60, 90].indexOf(state.meetingLength) < 0) throw new RangeError("Invalid meeting length");
    for (var i = 0; i < state.schedules.length; i += 1) {
      var s = state.schedules[i];
      if (!s || s.start === s.end) throw new RangeError("Schedule start and end must differ");
      if (s.start < 0 || s.start > 1425 || s.end < 0 || s.end > 1425 || s.start % 15 || s.end % 15 || (s.lunch !== 0 && s.lunch !== 1)) throw new RangeError("Invalid schedule");
    }
    var d = parseDateKey(state.date);
    if (!d) throw new RangeError("Invalid date");
  }

  function buildCityRange(startUtc, endUtc, cityIndex, city, anchorDate) {
    var start = localParts(startUtc, city.tz);
    var end = localParts(endUtc, city.tz);
    var anchor = parseDateKey(anchorDate);
    var startDateMs = Date.UTC(start.y, start.m - 1, start.d);
    var anchorDateMs = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
    var dayOffset = Math.round((startDateMs - anchorDateMs) / 86400000);
    return {
      cityIndex: cityIndex,
      start: { y: start.y, m: start.m, d: start.d, hh: start.hh, mm: start.mm },
      end: { y: end.y, m: end.m, d: end.d, hh: end.hh, mm: end.mm },
      dayOffset: dayOffset,
      endDateDiffers: end.y !== start.y || end.m !== start.m || end.d !== start.d,
      offsetChangedInRange: offsetMs(startUtc, city.tz) !== offsetMs(Math.max(startUtc, endUtc - MINUTE_MS), city.tz)
    };
  }

  function rangesFromBooleanStarts(starts, bools) {
    var ranges = [];
    var begin = null;
    for (var i = 0; i < starts.length; i += 1) {
      if (bools[i] && begin === null) begin = starts[i];
      if ((!bools[i] || i === starts.length - 1) && begin !== null) {
        var end = bools[i] && i === starts.length - 1 ? starts[i] + STEP_MS : starts[i];
        ranges.push({ startUtc: begin, endUtc: end });
        begin = null;
      }
    }
    return ranges;
  }

  function detectOffsetChange(starts, city) {
    if (!starts.length) return false;
    var previous = offsetMs(starts[0], city.tz);
    for (var i = 1; i < starts.length; i += 1) {
      var current = offsetMs(starts[i], city.tz);
      if (current !== previous) return true;
      previous = current;
    }
    return false;
  }

  function nearestDistances(working, stepMs) {
    var n = working.length;
    var forward = new Array(n);
    var backward = new Array(n);
    var last = Infinity;
    for (var i = 0; i < n; i += 1) {
      if (working[i]) last = 0;
      else if (last !== Infinity) last += 15;
      forward[i] = last;
    }
    last = Infinity;
    for (var j = n - 1; j >= 0; j -= 1) {
      if (working[j]) last = 0;
      else if (last !== Infinity) last += 15;
      backward[j] = last;
    }
    var out = new Array(n);
    for (var k = 0; k < n; k += 1) {
      var d = Math.min(forward[k], backward[k]);
      out[k] = d === Infinity ? 1440 : d;
    }
    return out;
  }

  function buildRangeInfo(startUtc, endUtc, cities, anchorDate) {
    var perCity = [];
    for (var i = 0; i < cities.length; i += 1) perCity.push(buildCityRange(startUtc, endUtc, i, cities[i], anchorDate));
    return { startUtc: startUtc, endUtc: endUtc, lengthMin: Math.round((endUtc - startUtc) / MINUTE_MS), perCity: perCity };
  }

  function computeOverlap(state, opts) {
    validateState(state);
    if (!opts || typeof opts.nowMs !== "number") throw new RangeError("nowMs is required");
    var cacheKey = String(opts.nowMs) + "|" + JSON.stringify(state);
    if (computeCache.has(cacheKey)) return computeCache.get(cacheKey);
    var cities = state.cities;
    var schedules = state.schedules;
    var anchor = cities[0];
    var date = parseDateKey(state.date);
    var d1 = addUtcDays(date.y, date.m, date.d, 1);
    var d2 = addUtcDays(date.y, date.m, date.d, 2);
    var baseStartUtc = localMidnightUtc(anchor.tz, date.y, date.m, date.d);
    var baseEndUtc = localMidnightUtc(anchor.tz, d1.y, d1.m, d1.d);
    var d2MidnightUtc = localMidnightUtc(anchor.tz, d2.y, d2.m, d2.d);
    var overnight = schedules[0].start > schedules[0].end;
    var tailEndUtc = baseEndUtc;
    if (overnight && schedules[0].end > 0) {
      var last = -1;
      for (var scan = baseEndUtc; scan < d2MidnightUtc; scan += STEP_MS) {
        var ap = localParts(scan, anchor.tz);
        if ((ap.y === d1.y && ap.m === d1.m && ap.d === d1.d) && minutesOfDay(ap) < schedules[0].end) last = scan;
      }
      if (last >= 0) tailEndUtc = last + STEP_MS;
    }

    var baseDuration = baseEndUtc - baseStartUtc;
    var warnings = [];
    if (baseDuration % STEP_MS !== 0) warnings.push({ code: "non-grid-aligned-day" });
    var baseSlotCount = Math.floor(baseDuration / STEP_MS);
    var gridDuration = tailEndUtc - baseStartUtc;
    var gridSlotCount = Math.max(0, Math.floor(gridDuration / STEP_MS));
    var slots = [];
    var gridStarts = [];
    for (var g = 0; g < gridSlotCount; g += 1) {
      var instant = baseStartUtc + g * STEP_MS;
      var ap2 = localParts(instant, anchor.tz);
      var inSession;
      if (!overnight) inSession = instant >= baseStartUtc && instant < baseEndUtc;
      else inSession = (ap2.y === date.y && ap2.m === date.m && ap2.d === date.d && minutesOfDay(ap2) >= schedules[0].start) ||
        (ap2.y === d1.y && ap2.m === d1.m && ap2.d === d1.d && minutesOfDay(ap2) < schedules[0].end);
      gridStarts.push(instant);
      slots.push({ startUtc: instant, inSession: inSession, working: [], overlap: false });
    }

    var extStart = baseStartUtc - EXTENSION_SLOTS * STEP_MS;
    var extCount = gridSlotCount + EXTENSION_SLOTS * 2;
    var extStarts = new Array(extCount);
    for (var e = 0; e < extCount; e += 1) extStarts[e] = extStart + e * STEP_MS;

    var workingArrays = [];
    var distanceArrays = [];
    var nightArrays = [];
    var offsetArrays = [];
    var outsidePrefixArrays = [];
    var nightPrefixArrays = [];
    var distancePrefixArrays = [];
    for (var c = 0; c < cities.length; c += 1) {
      var city = cities[c];
      var schedule = schedules[c];
      var works = new Array(extCount);
      var nights = new Array(extCount);
      var offsets = new Array(extCount);
      var non15 = false;
      for (var w = 0; w < extCount; w += 1) {
        var lp = localParts(extStarts[w], city.tz);
        var mins = minutesOfDay(lp);
        works[w] = scheduleWorking(mins, schedule);
        nights[w] = mins >= 1380 || mins < 360;
        var off = Date.UTC(lp.y, lp.m - 1, lp.d, lp.hh, lp.mm, lp.ss) - floorToSecond(extStarts[w]);
        offsets[w] = off;
        if (off % (15 * MINUTE_MS) !== 0) non15 = true;
      }
      if (city.synthetic) {
        for (var minuteScan = extStart; minuteScan <= extStarts[extCount - 1]; minuteScan += MINUTE_MS) {
          if (offsetMs(minuteScan, city.tz) % (15 * MINUTE_MS) !== 0) {
            non15 = true;
            break;
          }
        }
      }
      if (non15) warnings.push({ code: "non-15-minute-offset", cityIndex: c });
      workingArrays.push(works);
      nightArrays.push(nights);
      offsetArrays.push(offsets);
      var distances = nearestDistances(works, STEP_MS);
      distanceArrays.push(distances);
      var op = new Array(gridSlotCount + 1);
      var np = new Array(gridSlotCount + 1);
      var dp = new Array(gridSlotCount + 1);
      op[0] = 0; np[0] = 0; dp[0] = 0;
      for (var pi = 0; pi < gridSlotCount; pi += 1) {
        var extIndex = EXTENSION_SLOTS + pi;
        op[pi + 1] = op[pi] + (works[extIndex] ? 0 : 15);
        np[pi + 1] = np[pi] + (!works[extIndex] && nights[extIndex] ? 15 : 0);
        dp[pi + 1] = dp[pi] + (!works[extIndex] ? distances[extIndex] : 0);
      }
      outsidePrefixArrays.push(op);
      nightPrefixArrays.push(np);
      distancePrefixArrays.push(dp);
      for (var q = 0; q < gridSlotCount; q += 1) slots[q].working.push(works[EXTENSION_SLOTS + q]);
    }

    for (var o = 0; o < slots.length; o += 1) {
      var overlap = slots[o].inSession;
      if (overlap) for (var oc = 0; oc < cities.length; oc += 1) if (!slots[o].working[oc]) { overlap = false; break; }
      slots[o].overlap = overlap;
    }
    var overlapRanges = [];
    var overlapStarts = slots.map(function (s) { return s.startUtc; });
    var overlapFlags = slots.map(function (s) { return s.overlap; });
    var rawOverlap = rangesFromBooleanStarts(overlapStarts, overlapFlags);
    for (var r = 0; r < rawOverlap.length; r += 1) overlapRanges.push(buildRangeInfo(rawOverlap[r].startUtc, rawOverlap[r].endUtc, cities, state.date));

    var workingRanges = [];
    var gridBooleanStarts = gridStarts;
    for (var wc = 0; wc < cities.length; wc += 1) {
      var bools = [];
      for (var wb = 0; wb < gridSlotCount; wb += 1) bools.push(workingArrays[wc][EXTENSION_SLOTS + wb]);
      var raw = rangesFromBooleanStarts(gridBooleanStarts, bools);
      var cr = [];
      for (var wr = 0; wr < raw.length; wr += 1) cr.push({ startUtc: raw[wr].startUtc, endUtc: raw[wr].endUtc });
      workingRanges.push(cr);
    }

    var meetingSlots = state.meetingLength / 15;
    var sufficient = null;
    for (var oi = 0; oi < overlapRanges.length; oi += 1) {
      if (overlapRanges[oi].lengthMin >= state.meetingLength) { sufficient = overlapRanges[oi]; break; }
    }
    var meetingFits = sufficient !== null;

    function candidateInfo(index) {
      var startUtc = gridStarts[index];
      var endUtc = startUtc + meetingSlots * STEP_MS;
      var outsideCityIndexes = [];
      var nightCityIndexes = [];
      var totalOutsideMin = 0;
      var totalNightMin = 0;
      var totalDistanceMin = 0;
      var perCity = [];
      var maxOutside = 0;
      for (var ci = 0; ci < cities.length; ci += 1) {
        var outside = outsidePrefixArrays[ci][index + meetingSlots] - outsidePrefixArrays[ci][index];
        var night = nightPrefixArrays[ci][index + meetingSlots] - nightPrefixArrays[ci][index];
        var dist = distancePrefixArrays[ci][index + meetingSlots] - distancePrefixArrays[ci][index];
        if (outside > 0) outsideCityIndexes.push(ci);
        if (night > 0) nightCityIndexes.push(ci);
        totalOutsideMin += outside;
        totalNightMin += night;
        totalDistanceMin += dist;
        if (outside > maxOutside) maxOutside = outside;
        perCity.push({ cityIndex: ci, outsideMin: outside, nightMin: night, distanceMin: dist });
      }
      return {
        kind: "fallback",
        startUtc: startUtc,
        endUtc: endUtc,
        perCity: perCity,
        outsideCityIndexes: outsideCityIndexes,
        nightCityIndexes: nightCityIndexes,
        totalOutsideMin: totalOutsideMin,
        totalNightMin: totalNightMin,
        totalDistanceMin: totalDistanceMin,
        rankKey: [outsideCityIndexes.length, totalOutsideMin + totalNightMin, maxOutside, totalDistanceMin]
      };
    }

    var recommendation;
    if (meetingFits) {
      var sr = buildRangeInfo(sufficient.startUtc, sufficient.startUtc + state.meetingLength * MINUTE_MS, cities, state.date);
      var p = [];
      for (var pc = 0; pc < cities.length; pc += 1) {
        var pr = buildCityRange(sr.startUtc, sr.endUtc, pc, cities[pc], state.date);
        pr.outsideMin = 0; pr.nightMin = 0; pr.distanceMin = 0;
        p.push(pr);
      }
      recommendation = {
        kind: "overlap", startUtc: sr.startUtc, endUtc: sr.endUtc, perCity: p,
        outsideCityIndexes: [], nightCityIndexes: [], totalOutsideMin: 0, totalNightMin: 0, totalDistanceMin: 0, rankKey: [0, 0, 0, 0]
      };
    } else {
      var candidates = [];
      for (var ci2 = 0; ci2 + meetingSlots <= gridSlotCount; ci2 += 1) {
        var valid = true;
        for (var cs = 0; cs < meetingSlots; cs += 1) if (!slots[ci2 + cs].inSession) { valid = false; break; }
        if (valid) candidates.push(candidateInfo(ci2));
      }
      candidates.sort(function (a, b) {
        for (var k = 0; k < a.rankKey.length; k += 1) if (a.rankKey[k] !== b.rankKey[k]) return a.rankKey[k] - b.rankKey[k];
        return a.startUtc - b.startUtc;
      });
      recommendation = candidates.length ? candidates[0] : null;
      if (recommendation) {
        var hydrated = [];
        for (var hc = 0; hc < cities.length; hc += 1) {
          var hr = buildCityRange(recommendation.startUtc, recommendation.endUtc, hc, cities[hc], state.date);
          hr.outsideMin = recommendation.perCity[hc].outsideMin;
          hr.nightMin = recommendation.perCity[hc].nightMin;
          hr.distanceMin = recommendation.perCity[hc].distanceMin;
          hydrated.push(hr);
        }
        recommendation.perCity = hydrated;
      }
    }

    var sameTimezonePairs = [];
    for (var a = 0; a < cities.length; a += 1) {
      for (var b = a + 1; b < cities.length; b += 1) {
        var za = resolveTimeZone(cities[a].tz);
        var zb = resolveTimeZone(cities[b].tz);
        if (za && zb && za === zb) {
          sameTimezonePairs.push({ a: a, b: b, reason: "same-id" });
        } else {
          var equal = true;
          for (var ss = 0; ss < gridStarts.length; ss += 1) {
            if (offsetArrays[a][EXTENSION_SLOTS + ss] !== offsetArrays[b][EXTENSION_SLOTS + ss]) { equal = false; break; }
          }
          if (equal) sameTimezonePairs.push({ a: a, b: b, reason: "same-offset" });
        }
      }
    }

    var dstChangeInWindow = [];
    for (var dc = 0; dc < cities.length; dc += 1) {
      var changed = false;
      for (var dci = EXTENSION_SLOTS + 1; dci < EXTENSION_SLOTS + gridSlotCount; dci += 1) {
        if (offsetArrays[dc][dci] !== offsetArrays[dc][dci - 1]) { changed = true; break; }
      }
      dstChangeInWindow.push(changed);
    }
    var nowSlotIndex = -1;
    if (opts.nowMs >= baseStartUtc && opts.nowMs < tailEndUtc) nowSlotIndex = Math.floor((opts.nowMs - baseStartUtc) / STEP_MS);

    var result = {
      date: state.date,
      anchorIndex: 0,
      baseStartUtc: baseStartUtc,
      baseEndUtc: baseEndUtc,
      tailEndUtc: tailEndUtc,
      baseSlotCount: baseSlotCount,
      gridSlotCount: gridSlotCount,
      slots: slots,
      overlapRanges: overlapRanges,
      workingRanges: workingRanges,
      meetingFits: meetingFits,
      recommendation: recommendation,
      dstChangeInWindow: dstChangeInWindow,
      warnings: warnings,
      sameTimezonePairs: sameTimezonePairs,
      nowSlotIndex: nowSlotIndex
    };
    if (computeCache.size >= COMPUTE_CACHE_LIMIT) computeCache.delete(computeCache.keys().next().value);
    computeCache.set(cacheKey, result);
    return result;
  }

  function strictToken(s, max) {
    return typeof s === "string" && s.length > 0 && s.length <= max && /^[A-Za-z0-9._~!$'()*:@/?+-]+$/.test(s);
  }

  function decodeValue(value) {
    try { return decodeURIComponent(String(value)); } catch (e) { return null; }
  }

  function parseQueryRaw(raw) {
    var out = {};
    if (!raw) return out;
    var pairs = raw.split("&");
    for (var i = 0; i < pairs.length; i += 1) {
      if (!pairs[i]) continue;
      var eq = pairs[i].indexOf("=");
      var keyRaw = eq < 0 ? pairs[i] : pairs[i].slice(0, eq);
      var valueRaw = eq < 0 ? "" : pairs[i].slice(eq + 1);
      var key = decodeValue(keyRaw);
      var value = decodeValue(valueRaw);
      if (key !== null && value !== null && !Object.prototype.hasOwnProperty.call(out, key)) out[key] = value;
    }
    return out;
  }

  function encodeCanonical(value) {
    return encodeURIComponent(String(value)).replace(/%2C/gi, ",").replace(/%3A/gi, ":").replace(/%2F/gi, "/");
  }

  function validTimeToken(s) {
    if (!/^\d{4}$/.test(s)) return false;
    var h = Number(s.slice(0, 2));
    var m = Number(s.slice(2, 4));
    return h >= 0 && h <= 23 && [0, 15, 30, 45].indexOf(m) >= 0;
  }

  function timeTokenToMin(s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4)); }
  function minToTimeToken(n) { return pad2(Math.floor(n / 60)) + pad2(n % 60); }

  function syntheticTokenToCity(token, opts) {
    var raw = token.slice(2).replace(/ /g, "+");
    if (!/^[A-Za-z0-9_\/+\-]{1,40}$/.test(raw)) return null;
    var resolved = resolveTimeZone(raw);
    if (!resolved) return null;
    var known = findCityByTz(resolved, { cities: opts.cities });
    if (known) return known;
    return createSyntheticCity(resolved, { nowMs: opts.nowMs });
  }

  function defaultCities(opts) {
    var detected = resolveTimeZone(opts.detectedTz || "UTC") || "UTC";
    var first = findCityByTz(detected, { cities: opts.cities });
    if (!first) first = createSyntheticCity(detected, { nowMs: opts.nowMs, name: "Your time zone" });
    var result = [first];
    var defaults = ["london", "new-york", "tokyo", "seoul"];
    for (var i = 0; i < defaults.length && result.length < 2; i += 1) {
      var city = null;
      for (var j = 0; j < opts.cities.length; j += 1) if (opts.cities[j].id === defaults[i]) city = opts.cities[j];
      if (city && result.every(function (x) { return x.id !== city.id; })) result.push(city);
    }
    if (result.length < 2) for (var k = 0; k < opts.cities.length && result.length < 2; k += 1) if (result.every(function (x) { return x.id !== opts.cities[k].id; })) result.push(opts.cities[k]);
    return result.slice(0, 5);
  }

  function parseUrlState(search, opts) {
    var defaults = defaultCities(opts);
    function defaultState() {
      var date = defaultDateFor(defaults[0], { nowMs: opts.nowMs });
      return { v: 1, cities: defaults.slice(0, 2), schedules: [{ start: 540, end: 1080, lunch: 0 }, { start: 540, end: 1080, lunch: 0 }], date: date, hourFormat: 24, meetingLength: 60 };
    }
    if (typeof search !== "string") return defaultState();
    var raw = search.charAt(0) === "?" ? search.slice(1) : search;
    if (raw.length > 500) return defaultState();
    var params = parseQueryRaw(raw);
    if (Object.prototype.hasOwnProperty.call(params, "v") && params.v !== "1") return defaultState();
    var cityTokens = Object.prototype.hasOwnProperty.call(params, "c") ? params.c : null;
    if (!cityTokens) return defaultState();
    var tokenList = cityTokens.split(",");
    var cities = [];
    for (var i = 0; i < tokenList.length && cities.length < 5; i += 1) {
      var tok = tokenList[i];
      var city = null;
      if (/^z:/.test(tok)) city = syntheticTokenToCity(tok, opts);
      else if (/^[a-z0-9-]{1,80}$/.test(tok)) for (var j = 0; j < opts.cities.length; j += 1) if (opts.cities[j].id === tok) { city = opts.cities[j]; break; }
      if (city && cities.every(function (x) { return x.id !== city.id; })) cities.push(city);
    }
    if (cities.length < 2) cities = defaults.slice(0, 2);
    var sRaw = Object.prototype.hasOwnProperty.call(params, "s") ? params.s : "";
    var eRaw = Object.prototype.hasOwnProperty.call(params, "e") ? params.e : "";
    var lRaw = Object.prototype.hasOwnProperty.call(params, "l") ? params.l : "";
    var ss = sRaw ? sRaw.split(",") : [];
    var ee = eRaw ? eRaw.split(",") : [];
    var ll = lRaw ? lRaw.split(",") : [];
    var schedules = [];
    for (var q = 0; q < cities.length; q += 1) {
      var st = validTimeToken(ss[q]) ? timeTokenToMin(ss[q]) : 540;
      var en = validTimeToken(ee[q]) ? timeTokenToMin(ee[q]) : 1080;
      var lunch = ll[q] === "1" ? 1 : 0;
      if (st === en) { st = 540; en = 1080; }
      schedules.push({ start: st, end: en, lunch: lunch });
    }
    var dateCandidate = Object.prototype.hasOwnProperty.call(params, "d") ? params.d : null;
    var valid = validateDate(dateCandidate, { nowMs: opts.nowMs });
    var date = valid.ok ? valid.date : defaultDateFor(cities[0], { nowMs: opts.nowMs });
    var f = Object.prototype.hasOwnProperty.call(params, "f") ? params.f : "24";
    var hourFormat = f === "12" ? 12 : 24;
    var m = Object.prototype.hasOwnProperty.call(params, "m") ? params.m : "60";
    var meetingLength = [30, 60, 90].indexOf(Number(m)) >= 0 ? Number(m) : 60;
    return { v: 1, cities: cities, schedules: schedules, date: date, hourFormat: hourFormat, meetingLength: meetingLength };
  }

  function canonicalCityToken(city) {
    if (city && city.synthetic) {
      var resolved = resolveTimeZone(city.tz);
      if (!resolved) return null;
      return "z:" + resolved;
    }
    if (city && typeof city.id === "string") return city.id;
    return null;
  }

  function buildUrlState(state) {
    var tokens = [];
    var starts = [];
    var ends = [];
    var lunches = [];
    var cities = Array.isArray(state.cities) ? state.cities.slice(0, 5) : [];
    for (var i = 0; i < cities.length; i += 1) {
      var token = canonicalCityToken(cities[i]);
      if (!token) {
        var fallback = cities[i] && resolveTimeZone(cities[i].tz);
        if (fallback) token = "z:" + fallback;
      }
      if (!token) token = "z:UTC";
      tokens.push(token);
      var s = state.schedules && state.schedules[i] ? state.schedules[i] : { start: 540, end: 1080, lunch: 0 };
      starts.push(minToTimeToken(s.start));
      ends.push(minToTimeToken(s.end));
      lunches.push(s.lunch ? "1" : "0");
    }
    return "?v=1&c=" + encodeCanonical(tokens.join(",")) +
      "&s=" + encodeCanonical(starts.join(",")) +
      "&e=" + encodeCanonical(ends.join(",")) +
      "&l=" + encodeCanonical(lunches.join(",")) +
      "&d=" + encodeCanonical(state.date) +
      "&f=" + encodeCanonical(state.hourFormat === 12 ? "12" : "24") +
      "&m=" + encodeCanonical([30, 60, 90].indexOf(Number(state.meetingLength)) >= 0 ? Number(state.meetingLength) : 60);
  }

  function utcStamp(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear().toString().padStart(4, "0") + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }

  function escapeIcsText(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  function foldIcsLine(line) {
    var out = [];
    var current = "";
    var limit = 75;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line.charAt(i);
      var bytes = utf8Length(current + ch);
      if (bytes > limit && current.length > 0) {
        out.push(current);
        current = " " + ch;
        limit = 74;
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out.join("\r\n");
  }

  function utf8Length(s) {
    var n = 0;
    for (var i = 0; i < s.length; i += 1) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i += 1; continue; }
      }
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }

  function buildIcs(opts) {
    if (!opts || typeof opts.nowMs !== "number" || typeof opts.uid !== "string") throw new RangeError("nowMs and uid are required");
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Time Zone Overlap Finder//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + opts.uid,
      "DTSTAMP:" + utcStamp(opts.nowMs),
      "DTSTART:" + utcStamp(opts.startUtc),
      "DTEND:" + utcStamp(opts.endUtc),
      "SUMMARY:" + escapeIcsText(opts.title || "Time Zone Overlap Meeting")
    ];
    if (opts.description) lines.push("DESCRIPTION:" + escapeIcsText(opts.description));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.map(foldIcsLine).join("\r\n") + "\r\n";
  }

  function buildGoogleCalUrl(opts) {
    var title = encodeURIComponent(String(opts.title || "Time Zone Overlap Meeting"));
    var description = encodeURIComponent(String(opts.description || ""));
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + title + "&dates=" + utcStamp(opts.startUtc) + "/" + utcStamp(opts.endUtc) + "&details=" + description;
  }

  function formatTimeParts(parts, opts) {
    var hh = Number(parts.hh);
    var mm = Number(parts.mm);
    if (opts && opts.hourFormat === 12) {
      var suffix = hh >= 12 ? "PM" : "AM";
      var h = hh % 12;
      if (h === 0) h = 12;
      return String(h) + ":" + pad2(mm) + " " + suffix;
    }
    return pad2(hh) + ":" + pad2(mm);
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function cityRangeText(range, city, hourFormat) {
    var s = formatTimeParts(range.start, { hourFormat: hourFormat });
    var e = formatTimeParts(range.end, { hourFormat: hourFormat });
    if (range.endDateDiffers) {
      var startDate = range.start.y + "-" + pad2(range.start.m) + "-" + pad2(range.start.d);
      var endDate = range.end.y + "-" + pad2(range.end.m) + "-" + pad2(range.end.d);
      return city.name + ": " + s + " (" + startDate + ")–" + e + " (" + endDate + ")";
    }
    return city.name + ": " + s + "–" + e;
  }

  function summaryText(result, opts) {
    opts = opts || {};
    var locale = opts.locale === "en-US" ? "en-US" : "en-US";
    var hourFormat = opts.hourFormat === 12 ? 12 : 24;
    var parts = [];
    if (result && result.recommendation) {
      var r = result.recommendation;
      parts.push(r.kind === "overlap" ? "Recommended overlap:" : "Recommended fallback:");
      for (var i = 0; i < r.perCity.length; i += 1) {
        var cr = r.perCity[i];
        var cityName = result.cities && result.cities[i] ? result.cities[i].name : "City " + (i + 1);
        parts.push(cityName + " " + formatTimeParts(cr.start, { hourFormat: hourFormat }) + "–" + formatTimeParts(cr.end, { hourFormat: hourFormat }));
      }
    }
    if (result && result.overlapRanges && result.overlapRanges.length) parts.push(result.overlapRanges.length + " overlap range" + (result.overlapRanges.length === 1 ? "" : "s") + ".");
    return parts.join(" ");
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function pad4(n) { return String(n).padStart(4, "0"); }

  return {
    STEP_MS: STEP_MS,
    TZ_ALIASES: TZ_ALIASES,
    resolveTimeZone: resolveTimeZone,
    localParts: localParts,
    offsetMs: offsetMs,
    localMidnightUtc: localMidnightUtc,
    findCityByTz: findCityByTz,
    createSyntheticCity: createSyntheticCity,
    defaultDateFor: defaultDateFor,
    validateDate: validateDate,
    computeOverlap: computeOverlap,
    parseUrlState: parseUrlState,
    buildUrlState: buildUrlState,
    buildIcs: buildIcs,
    buildGoogleCalUrl: buildGoogleCalUrl,
    formatTimeParts: formatTimeParts,
    summaryText: summaryText
  };
});
