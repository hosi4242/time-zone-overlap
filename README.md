# Time Zone Overlap Finder

A browser-based tool for finding overlapping working hours across time zones.

## What it does

Time Zone Overlap Finder compares working hours for 2–5 cities on a common UTC timeline. The first city is the anchor, and the selected date is interpreted using the anchor city's local calendar date. Calculations use real UTC instants and the browser's IANA time-zone data, including daylight-saving transitions.

The project is a standalone static page. It has no backend, account system, analytics, advertising, runtime API, CDN dependency, or Service Worker. Core calculations work offline.

## Run locally

The page can be hosted by any simple static server. From the project directory, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Do not open the project through a build tool or framework; no build step is required.

## Run the tests

### Node

Node 18+ is required.

```bash
node tests/run.js
node tests/validate-cities.js
```

The test suite uses the same engine, city database, and case entry point as the browser tests. A successful run reports PASS for all 37 cases and PASS for city validation.

### Browser

Serve the project with a local static server and open:

```text
http://localhost:8000/tests.html
```

The browser runner displays PASS/FAIL diagnostics without requiring a server-side testing framework.

## Deploy to a static host

Deploy the contents of this directory as-is to any static hosting service that supports HTML, CSS, and JavaScript. No package installation or build command is required.

The site entry point is:

```text
/index.html
```

Keep the `/assets/` and `/tests/` paths unchanged. The tests are useful for development but are not required for the public page.

## Add a city

City data is stored in:

```text
/assets/cities.js
```

Add a city object following the existing schema. Use a valid IANA time-zone identifier in `tz`, a unique lowercase `id`, a valid region, and a rank from 1 to 5. Add useful search aliases where appropriate.

After editing the city database, run:

```bash
node tests/validate-cities.js
node tests/run.js
```

A city must resolve through the engine's time-zone handling and must not introduce search-alias collisions.

## Time-zone data caveat

The tool uses the visitor's browser `Intl.DateTimeFormat` time-zone data. Results therefore depend on the time-zone data supplied by the browser/runtime. Future dates use current time-zone rules, which governments may change.

The tool does not hardcode UTC offsets or daylight-saving rules.

## Technical structure

```text
index.html
assets/
  engine.js       # timezone calculation engine and pure helpers
  cities.js       # city database
  style.css       # UI styles
  app.js          # DOM/UI wiring

tests.html
 tests/
  reference.js
  cases.js
  cases/core.js
  cases/url.js
  cases/ics.js
  cases/random.js
  browser-runner.js
  run.js
  validate-cities.js
```

`engine.js` is the single source of truth for timezone calculations. The UI does not duplicate calculation logic.

## Browser compatibility and constraints

The project uses plain HTML, CSS, and vanilla JavaScript with ES2020-compatible syntax. It has no third-party runtime libraries, external fonts, CDN resources, backend, or runtime network dependency. The page is designed for mobile-first use, including a 360px viewport, and wide timeline content scrolls inside its own container rather than causing horizontal body scrolling.

The application is designed to remain compatible with a strict self-hosted CSP and renders URL/user data through DOM APIs rather than HTML injection.
