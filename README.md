# makefun-csv-reader-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/yzrzlrizal-blip/makefun-csv-reader-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/yzrzlrizal-blip/makefun-csv-reader-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast CSV reader that answers exactly like csv-reader 1.0.0 — same columns, rows and errors on every input, including its broken-row policy (BOM, CRLF/LF/lone CR, quoted fields with `""` escapes and embedded line breaks, quote junk, unterminated quotes, short/long rows) — but much faster. It never walks character by character on the common path: a record whose line holds no quote and no stray CR is taken whole with one slice + `split(',')`, and every other field is cut out with `indexOf` jumps between delimiters. Only quoted fields with escapes or embedded breaks, stray CRs and quote junk take a slower segmented path. Dependency-free; `run({text, header})` in `solve.js` is pure and deterministic.

## Run it

```sh
node main.ts
```

Reads cases from `$MAKEFUN_INPUT_DIR/cases.json` (defaults to `/input`) and writes answers to `$MAKEFUN_OUTPUT_DIR/answers.json` (defaults to `/output`).

<sub>Entered on [make.fun](https://make.fun/?ref=wdbz3sg5&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
