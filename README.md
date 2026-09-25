# Contract Repair Desk

A Bob-assisted API repair workflow with a working sample and reproducible
before-and-after evidence. Built by Hong DaeWoon / Solo Workflow Lab during the
IBM Bob 2.0 Hackathon, starting September 26, 2026 (KST).

## Try the sample

Choose a case, switch between Before repair and After repair, then inspect the
task preview, raw JSON payload or recorded test log. The browser executes the
actual saved or repaired mapper against a fetched fictional fixture. It never
calls Bob and needs no account or API key.

| Case | Original behavior | Repaired behavior |
|---|---|---|
| Baseline | Task displayed | Preserved |
| Extra field | Task displayed | Preserved |
| Renamed title | Title missing | Reads displayName fallback |
| New status | Unknown | Shows In progress |
| Zero priority | Not set | Shows Critical |
| Unsupported envelope | Rejected | Still explicitly rejected |

The six fixed acceptance checks produce 3 passes / 3 failures before repair and
6 passes / 0 failures afterward. The required rejection counts as a pass, not as
a successful repair of an unsupported payload.

## Reproduce locally

Requires Node.js 24.15 or later. The fixture and evidence runners use Node built-ins.

```sh
npm test
npm run evidence
npm --prefix web ci
npm --prefix web run build
npm --prefix web run preview
```

Open http://127.0.0.1:4177/. The test command runs 35 checks, including the original
HTTP consumer, six-case suite, malformed input handling and evidence integrity.
This total is separate from the six acceptance checks shown in the viewer.

The evidence command runs original and repaired source in separate temporary
directories and publishes JSON and HTML under web/public/evidence/.
It preserves the working consumer and makes no model call. Rebuild the viewer
after regenerating evidence. Reloading a deployed page does not run tests.

## What the evidence proves

- Pinned acceptance files and original source are checked against SHA-256 hashes.
- Changed fixtures abort capture; a still-broken consumer cannot yield a verified repair.
- Each result retains exit codes, individual case outcomes, process logs and hashes.
- Missing or inconsistent TAP summaries are inconclusive; child timeouts are bounded.
- Temporary file paths are masked and HTML output escapes log content.
- The original three-case loopback HTTP suite remains separate from the expanded
  six-case pure mapper suite. Browser interactions exercise that same pure mapper.

Hashes detect changes against a local manifest. They do not prove authenticity
against someone who can replace both manifest and source. Execute trusted source only.
Process elapsed time is machine verification time, not human time saved.

## Contribution disclosure

| Contributor | Actual contribution |
|---|---|
| IBM Bob IDE | Diagnosed and repaired sample/consumer.ts, preserving old titles and accepting displayName. The original completion screenshot is in bob_sessions/. |
| IBM Bob Shell | Drafted evidence capture and tests; that run hit a configured turn limit. A later completed run repaired sample/view-model.ts for title, status and zero priority. |
| Codex | Prepared fictional fixtures and fixed acceptance tests; reviewed and corrected Bob drafts; added strict evidence parsing, isolation, path masking and regression checks; removed unsupported status aliases and fixed inherited-key handling; built the Vue viewer and submission media. |
| Participant | Selected the project, operated the first IDE task and supplied its screenshot; reviews and authorizes publication and submission. |

Observed costs: IDE task screenshot 0.264 Bobcoins; Shell evidence draft
0.540662; Shell mapper repair 0.069808; separate tool-free probe 0.008686.
These are individual observations, not a current account balance.

The completion/chat screenshot is not the official IDE task consumption-summary
export. Required consumption-summary PNG verification is tracked separately
before final submission; it must be an actual screenshot, never recreated.

## Boundaries

This is a six-case fictional migration sample and reproducible review workflow,
not a general repository analyzer or autonomous production repair service.
No human productivity gain, production coverage or market validation is claimed.
There is no backend, secret key, telemetry or model call in the public viewer.
Broader migration coverage and independent developer evaluation are future work.

Presentation narration is synthetic English speech. The demo uses actual browser
interactions captured at their original pace and an original Bob IDE screenshot.

## Deployment

The prepared GitHub Pages workflow tests the project, regenerates evidence and
builds only web/dist. BASE_PATH selects the repository subpath; local builds
default to /. Publication requires repository and Pages setup.

## Third-party materials

See THIRD_PARTY_NOTICES.md. IBM Bob screenshots demonstrate tool use and retain
their respective owners' rights; they are not covered by an own-source license.

