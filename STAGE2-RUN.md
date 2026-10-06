# Stage 2 — Test Instructions

## Node 18+

From the project root:

```bash
node tests/validate-cities.js
node tests/run.js
```

Expected final summary:

```text
PASS: 37  FAIL: 0
```

To reproduce the deterministic randomized reference test directly:

```bash
node tests/run.js --case 37
```

To run an individual case, use its 1-based case number:

```bash
node tests/run.js --case 4
```

The randomized suite uses seed `20261006` and reports a complete input object on failure.

## Browser

Use any local static server. For example, from the project root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/tests.html
```

For one browser case:

```text
http://localhost:8080/tests.html?case=4
```

The browser runner executes the same case definitions as the Node runner and displays PASS/FAIL diagnostics.
