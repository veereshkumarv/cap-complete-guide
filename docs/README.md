<!--
What: Index of the docs/ folder: glossary, decision matrix, the generated Definition-of-Done report
    and the UI screenshots per stage.
Why: [CAP-S04] the repository layout requires docs/ with a README; [CAP-S08] every folder explains
    itself.
If missing or unlinked: Readers do not know which documents exist beside the master guide and the
    stage READMEs.
-->

# docs

## Purpose

Reference material that belongs to the whole guide rather than to a single stage: short lookup
pages copied from the master guide, the generated Definition-of-Done report, and screenshots of the
Fiori UI.

## Contents

| File / folder | What | Maintained by |
|---------------|------|---------------|
| [glossary.md](glossary.md) | CAP / BTP terms (copy of [CAP-S12]) | by hand - keep in sync with the master guide |
| [decision-matrix.md](decision-matrix.md) | when to use / avoid / impact + decision rules (copy of [CAP-S13], 11.3) | by hand - keep in sync |
| [security-guardrails.md](security-guardrails.md) | security and S/4HANA-access review: fixed findings with their tests, guardrails required before production | by hand - update when features or findings change |
| [client-demo-guide.md](client-demo-guide.md) | step-by-step client demo: storyline, commands, value message, effort worksheet, honest limits | by hand |
| [client-adoption-guide.md](client-adoption-guide.md) | step-by-step adoption in a client environment: hosting, template (`npm run new-project`), daily workflows, CI, BTP/S4, maintenance, rollout | by hand |
| [dod-report.md](dod-report.md) | pass/fail table of the Definition of Done for every folder | generated: `npm run dod` |
| [images/](images) | screenshots of UI stages, named `<folder>-<view>.png` | by hand / headless browser (see stage 05 README) |

## Screenshot naming

`scripts/dod-report.js` marks a UI folder (stage 05+, final app, UI samples) as done only if at
least one `docs/images/<folder>-*.png` exists, e.g. `stage-05-fiori-elements-list-report.png`.
For samples replace the slash: `samples-draft-workflow-object-page.png`.

Taking a screenshot without manual clicks (server running on port 4004):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1440,900 --virtual-time-budget=30000 \
  --screenshot=docs/images/stage-05-fiori-elements-list-report.png \
  "http://localhost:4004/procurement/webapp/index.html"
```

From stage 06 on every request needs a user, and some views need interaction (typing a search,
pressing a button). A small Playwright script driving the installed Chrome covers both - keep it
outside the repository, e.g. in `/tmp`:

```sh
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright-core
```

```js
// /tmp/pw/shot.js - node shot.js <url> <user> <out.png>
const { chromium } = require('playwright-core');
(async () => {
  const [url, user, out] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 }, httpCredentials: { username: user, password: '' } });
  await page.goto(url);
  await page.locator('input[type="search"]').first().waitFor();   // UI5 finished rendering
  await page.screenshot({ path: out });
  await browser.close();
})();
```
