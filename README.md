# Contract Repair Desk

HTTP 200 can still produce the wrong screen. Contract Repair Desk turns intended
consumer behavior into an executable contract, gives IBM Bob a bounded repair job,
and checks the result against unchanged expectations.

A failing test is the start: package the exact failure and preservation rules
for Bob, then independently recheck the resulting candidate.

Built by Hong DaeWoon / Solo Workflow Lab for the IBM Bob 2.0 Hackathon, starting
September 26, 2026 (KST). All example data is fictional.

## Try it

The warehouse demo executes the actual original adapter or the saved Bob IDE
repair in your browser. Change the JSON: zero units must stay zero, legacy fields
keep precedence, and unsupported input is explicitly rejected. Input stays local.
Clicks do not call a model or generate a new repair.

Evidence sections load when approached or linked directly. The original task
board fetches its data only when expanded. Failed or incomplete evidence stays
hidden behind an error with a retry action; it cannot establish a green result.

Below that, three recorded jobs show expected and actual behavior, before/after
source, individual checks and downloadable evidence. These panels replay results;
they do not rerun tests. The original six-case task board remains expandable.

| Job | Visible failure | Evidence |
|---|---|---|
| Warehouse | Zero units displayed as twenty | Actual Bob IDE repair; 7/7 initial checks, 4/4 later boundary checks |
| Dispatch | Urgent assignment loses its meaning | Bob Shell candidate; 7/7 initial, 0/5 later boundary checks |
| Booking | Sold-out capacity displayed as bookable | Bob Shell candidate; 7/7 initial, 0/4 later boundary checks |

Passing the sampled contract does not mean every requirement is covered. The
unmodified Shell candidates and their later failures are retained, not polished
into apparent successes. Independent review found null-handling gaps in the IDE
candidate; a real IDE follow-up repaired them.

## Run a new repair job

Requires Node.js 24.15 or later. The repair runner uses Node built-ins.

```sh
node repair/cli.ts prepare repair/examples/stock.contract.json repair/examples/stock.consumer.ts repair-jobs/my-stock
node repair/cli.ts check repair-jobs/my-stock
```

The first check intentionally fails. Open this repository in IBM Bob IDE and ask:

```text
Use the contract-repair skill for repair-jobs/my-stock/TASK.md.
Reproduce the failure, repair only candidate.ts, preserve the pinned contract
and baseline, and report remaining limitations.
```

Review normal IDE tool approvals. Then run the check command again. It evaluates
both versions against the same contract and writes report.json. Preparation
refuses an existing directory. Use a new directory for retries of preparation;
verification can be repeated after reviewing the candidate. No model call occurs
inside either command.

For another project, export a trusted, self-contained mapResponse(payload)
function. Supply 3 to 50 migration, preservation and rejection checks in a JSON
contract (examples are under repair/examples). The web editor validates structure
and downloads this input. You are responsible for the expected business meaning.

## Verify and build

```sh
npm test
npm run evidence:all
npm --prefix web ci
npm --prefix web run build
npm --prefix web run preview
```

Open http://127.0.0.1:4177/. The project has 69 passing automated tests. This count
includes infrastructure, integrity, regression and replay tests; it is separate
from the seven checks in each new job and the six original task-board checks.

npm run evidence regenerates the original HTTP and task-board reports only.
The recorded Bob study is retained under web/public/evidence/repair-lab.json,
with exact candidates under repair/recorded. Tests verify source and contract
hashes and replay those candidates. To reproduce one recorded candidate without
calling Bob, prepare the matching example job, copy its recorded source over
candidate.ts, and check the job. Timings and run IDs will naturally differ.

## Turn review gaps into a Bob follow-up

A green initial contract is not an acceptance decision. Add explicit boundary
expectations in a separate review plan, without replacing the original checks:

```sh
node repair/cli.ts review repair-jobs/my-stock repair/examples/stock.review.json repair-jobs/review-01
node repair/cli.ts status repair-jobs/my-stock repair/examples/stock.review.json repair-jobs/review-01
```

The review command reruns both groups, then atomically writes review.json,
FOLLOW_UP.md and a local hash receipt into a new directory. It preserves earlier
reports and exits nonzero for failures or inconclusive execution. The handoff
contains exact failed inputs, expected/actual behavior and source hashes. Check
status before using it in an authorized Bob task. After any code or expectation
edit, the previous result is stale: review again into a fresh output directory.
Receipt hashes detect accidental edits, not replacement of both receipt and data.

In a known-gap replay, all six unchanged study candidates passed the initial
gate, but all six required changes under the added review. The CLI packaged 21
failed assertions, not 21 independent bugs. These expectations were written after
observing the gaps; they are not a blind evaluation or automatically found tests.

One separate Bob Shell task then used the generated booking handoff: original
checks stayed 7/7 and added checks changed from 0/4 to 4/4, at 0.098678 Bobcoins.
The exact follow-up is retained as repair/recorded/booking-followup.ts; the six
original candidates remain unchanged. npm run review:evidence independently
replays them, both separate follow-ups and a stale-result demonstration without
calling a model. This proves the handoff-and-recheck path for these examples,
not human time saved or superiority over running the same tests manually.

## Draft expectations, then check the checks

```sh
node repair/cli.ts draft repair-jobs/my-stock repair-jobs/draft-01
node repair/cli.ts inspect-draft repair-jobs/my-stock repair-jobs/draft-01/proposal.json
node repair/cli.ts adopt-draft repair-jobs/my-stock repair-jobs/draft-01/proposal.json decisions.json approved-review.json
node repair/cli.ts mutation-audit repair-jobs/my-stock approved-review.json mutations.json fault-report.json
```

Draft preparation copies only the contract and a bounded instruction into a new
workspace; it does not call a model. Ask your authorized Bob IDE or Shell task to
write proposal.json there. Each check needs an exact requirement quote and reason.
A separate reviewer records accept/reject decisions bound to the proposal and
contract hashes. Unresolved questions block adoption; accepted unmatched quotes,
missing decisions, stale files and overwrite attempts are rejected. A quote match
is not semantic proof. Review expected values independently before adoption.

The seeded-fault audit requires a passing candidate and explicit, uniquely
matching source changes pinned to its hash. It modifies isolated copies only,
compares initial and combined checks, and keeps surviving faults visible.
Equivalent controls and inconclusive runs are not counted as caught faults.

The public unit-counter fixture is independently authored synthetic code. Its
illustrative proposals are not attributed to Bob. `npm run preparation:evidence`
replays the real local adoption and seeded-error checks without a model call.

A separate, anonymized execution record preserves measured outcomes from one
privately retained adapter: Bob proposed 10 checks; Codex accepted 8 and rejected
2 unsupported quotations. The repaired candidate passed 3 original checks, 8
adopted checks and 12 evaluator cases withheld from both Bob calls. Initial checks
caught 2/5 selected errors; reviewed proposals caught 3/5. Two Codex checks added
after seeing the survivors caught the same errors 5/5. The equivalent control
passed 1/1. These are actual recorded observations, not results from the public
unit-counter fixture. Supporting source and inputs are private, so this record
cannot be independently replayed from the public repository. The evaluator also
authored the requirements; this is not external validation, a blind hardening
score, measured productivity or production coverage.

## What verification establishes

- Every case is served through real loopback HTTP with status 200. A separate
  Node process runs each adapter version against those synthetic inputs.
- Baseline and contract SHA-256 pins are checked before and after execution.
  Changing expectations is blocked; breaking a preservation case fails repair.
- Timeouts, malformed output and incomplete results are inconclusive, never green.
- Child processes receive no inherited credentials, have bounded execution and
  output, and use Node permission restrictions. This is not a hostile-code sandbox.
- Reports retain exact expected/actual values, source, hashes, outcomes and timing.

Use trusted code only. Local pins cannot attest authenticity if someone replaces
both manifest and inputs. The workflow supports pure TypeScript adapters, not
arbitrary repositories, production migrations or a hosted autonomous repair agent.

## Comparison study and limits

Three synthetic cases were prepared before six fresh Bob Shell runs: plain and
guided for each case. Both conditions received the same source, contract and
baseline evidence; guided additionally received a compact workflow and failure
index, without a reference solution. Only read/edit tools were enabled.

Every run passed its seven initial checks. The experiment establishes no accuracy
advantage for the guide. One run per condition, concurrent local activity, and no
human active-work measurements preclude a productivity or controlled speed claim.

| Case | Plain initial | Guided initial | Plain later review | Guided later review |
|---|---|---|---|---|
| Stock | 7/7 | 7/7 | 2/4 | 2/4 |
| Dispatch | 7/7 | 7/7 | 0/5 | 0/5 |
| Booking | 7/7 | 7/7 | 1/4 | 0/4 |

The later review was added after observing results. It is not a preregistered or
independent holdout evaluation. The separate IDE stock follow-up passes all four
of its additional checks; it does not change the original six-run comparison.

## Actual contributions and Bob use

| Contributor | Contribution |
|---|---|
| IBM Bob IDE | Repaired the original HTTP title consumer. Used the project contract-repair skill to repair the warehouse adapter, then fixed null boundaries after independent review. |
| IBM Bob Shell | Drafted the first evidence runner (that run hit its turn limit), repaired the original expanded mapper, produced six comparison candidates, repaired booking boundaries using the generated review handoff, proposed ten additional checks and repaired the isolated existing sample-page mapping. |
| Codex | Prepared fictional contracts, implemented the independent verifier and Vue UI, reviewed outputs, ran verification, operated the later IDE task through native UI, and prepared submission materials. Bob did not run terminal commands in that later IDE task. |
| Participant | Selected and directed the project, operated the first IDE task, and reviews and authorizes publication and submission. |

Actual, unedited IDE task consumption-summary screenshots:

- [First title repair: 0.264 Bobcoins](bob_sessions/soloworkflowlab_task01_title_repair_consumption.png)
- [Warehouse repair and follow-up: 0.350 Bobcoins](bob_sessions/soloworkflowlab_task02_stock_repair_consumption.png)

The earlier completion screenshot is retained separately. Shell observations:
evidence draft 0.540662, expanded mapper 0.069808, tool-free probe 0.008686,
six-run comparison 0.661568, separate booking follow-up 0.098678 Bobcoins. These are task observations, not a live
account balance. Shell supplements the actual IDE work.

## Deployment and materials

The GitHub Pages workflow reruns tests against the saved candidates and regenerates the original-suite, review and synthetic-preparation evidence,
checks the public asset allowlist and aggregate-only schema, then builds
web/dist. BASE_PATH selects the repository subpath; local builds default to /.
Pull requests targeting main run the same verification and build steps. Pages
configuration, artifact upload and deployment run only for non-PR events on main.
The viewer has no public model endpoint, API key, telemetry or inference cost.

Demo narration is synthetic English speech. Browser segments show real
interactions at original pace; IDE images are actual session screenshots.
No production coverage, market validation or human time savings is claimed.

See THIRD_PARTY_NOTICES.md. IBM screenshots retain their owners' rights and are
not included in the own-source MIT license.
