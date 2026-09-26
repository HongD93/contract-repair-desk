<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { validateReviewReplay } from '../../repair/review-display.ts';

import { useWhenVisible } from './useWhenVisible.js';
const section = ref(null);
const evidence = ref(null), error = ref(''), loading = ref(false);
const selected = ref('booking-guided'), failureId = ref('review-null-precedence'), showHandoff = ref(false);
const current = computed(() => evidence.value?.rows.find(row => row.id === selected.value));
const report = computed(() => current.value?.report);
const failure = computed(() => report.value?.failures.find(row => row.id === failureId.value) ?? report.value?.failures[0]);
let request;
async function load() {
  request?.abort(); const active = new AbortController(); request = active;
  loading.value = true; error.value = ''; evidence.value = null;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}evidence/review-gate.json`, { signal: active.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Review evidence unavailable (${response.status})`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Review evidence is missing or unreadable. Restore the evidence file and retry.'); }
    const result = validateReviewReplay(payload);
    if (request === active) { evidence.value = result; if (!result.rows.some(row => row.id === selected.value)) selected.value = result.rows[0].id; }
  } catch (reason) { if (reason.name !== 'AbortError' && request === active) error.value = reason.message; }
  finally { if (request === active) loading.value = false; }
}
function selectCandidate() { failureId.value = report.value?.failures.find(row => row.id === 'review-null-precedence')?.id ?? report.value?.failures[0]?.id ?? ''; showHandoff.value = false; }
function corrected() { selected.value = 'stock-ide'; selectCandidate(); }
function bookingFollowup() { selected.value = 'booking-followup'; selectCandidate(); }
function download() {
  const url = URL.createObjectURL(new Blob([current.value.handoff], { type: 'text/markdown' }));
  const link = document.createElement('a'); link.href = url; link.download = `${current.value.id}-FOLLOW_UP.md`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
useWhenVisible(section, load); onBeforeUnmount(() => { request?.abort(); request = null; });
</script>

<template>
  <section ref="section" id="review-desk" class="panel review-desk">
    <p class="eyebrow">INDEPENDENT REVIEW · RECORDED, REPLAYABLE EXECUTION</p>
    <h2>Seven green checks. Still not ready.</h2>
    <p class="subtle">A developer adds explicit boundary expectations. One local command reruns both groups and packages every failure for Bob. It keeps the original contract intact.</p>
    <p v-if="loading" role="status">Loading boundary review…</p>
    <div v-if="error" role="alert"><p>{{error}}</p><button class="secondary" @click="load">Retry boundary review</button></div>
    <template v-if="evidence && report">
      <div class="review-impact">
        <article><strong>{{evidence.summary.acceptedByInitialChecks}} / {{evidence.summary.candidates}}</strong><span>passed the initial gate</span></article>
        <article><strong>{{evidence.summary.stoppedByReview}} / {{evidence.summary.candidates}}</strong><span>stopped by added review</span></article>
        <article><strong>{{evidence.summary.failedAssertionsPackaged}}</strong><span>failed assertions packaged</span></article>
      </div>
      <p class="subtle">These are known gaps in unchanged candidates, replayed with more checks. This does not establish a model accuracy gain or measured human time savings.</p>
      <div class="review-toolbar"><label>Recorded candidate<select v-model="selected" @change="selectCandidate"><option v-for="row in evidence.rows" :key="row.id" :value="row.id">{{row.id}}{{row.role==='separate-corrected-ide-control'?' · actual IDE follow-up':row.role==='separate-shell-followup'?' · generated handoff used by Bob':''}}</option></select></label><button class="secondary" @click="bookingFollowup">Show Bob booking follow-up</button><button class="secondary" @click="corrected">Show actual IDE follow-up</button></div>
      <p v-if="selected==='booking-followup'" class="subtle">The generated failure handoff was used in one separate Bob Shell task (0.098678 Bobcoins). Original checks stayed 7/7; added checks improved from 0/4 to 4/4. Codex reran verification independently. This does not alter the original comparison.</p>
      <div class="review-verdict" :class="{passed:report.outcome==='review-passed'}" aria-live="polite"><h3>{{report.outcome==='review-passed'?'Both supplied groups pass. Review the patch.':report.outcome==='inconclusive'?'Execution inconclusive. Do not accept.':'Changes requested. Keep this candidate out.'}}</h3><p>Original {{report.initial.pass}} / {{report.initial.total}} · Additional {{report.additional.pass}} / {{report.additional.total}}</p><p v-if="selected==='stock-ide'" class="subtle">Separate actual IDE follow-up, not a replacement for the original six-run study.</p></div>
      <template v-if="failure">
        <label class="failure-label">Failed expectation<select :value="failure.id" @change="failureId=$event.target.value"><option v-for="item in report.failures" :key="item.id" :value="item.id">{{item.id}} · {{item.scope}}</option></select></label>
        <div class="review-values"><div><p class="eyebrow">INPUT</p><pre tabindex="0">{{JSON.stringify(failure.input,null,2)}}</pre></div><div><p class="eyebrow">EXPECTED</p><pre tabindex="0">{{JSON.stringify(failure.expected,null,2)}}</pre></div><div><p class="eyebrow">ACTUAL</p><pre tabindex="0">{{JSON.stringify(failure.actual,null,2)}}</pre></div></div>
      </template>
      <div class="review-toolbar"><button class="secondary" :aria-expanded="showHandoff" @click="showHandoff=!showHandoff">{{showHandoff?'Hide':'Inspect'}} Bob follow-up</button><button class="secondary" @click="download">Download Bob follow-up</button></div>
      <pre v-if="showHandoff" class="handoff" tabindex="0">{{current.handoff}}</pre>
      <p class="subtle hash">Bound to candidate SHA-256 {{report.bindings.candidate}}</p>
      <details><summary>Why a later edit invalidates the result</summary><p class="subtle">An actual replay appended a comment after the successful IDE review. Status changed from {{evidence.freshness.before.outcome}} to {{evidence.freshness.after.outcome}}. A code or expectation change requires a fresh review; an older green report is not reused.</p><p class="subtle">The CLI checks current local files. This web page displays the recorded demonstration and cannot inspect your workspace.</p></details>
      <details><summary>Scope and comparison limits</summary><ul><li v-for="limit in evidence.limitations" :key="limit" class="subtle">{{limit}}</li></ul></details>
      <code class="command">node repair/cli.ts review repair-jobs/my-stock repair/examples/stock.review.json repair-jobs/review-01<br>node repair/cli.ts status repair-jobs/my-stock repair/examples/stock.review.json repair-jobs/review-01</code>
      <p class="subtle">The handoff contains synthetic inputs, exact failures and hashes. Downloading does not send it to Bob. Review the expectations, then use it in your own authorized IDE task.</p>
    </template>
  </section>
</template>

<style scoped>
.review-toolbar>*{min-width:0}.review-toolbar label{flex:1}.review-desk select{width:100%}
.review-impact{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:24px 0}.review-impact article{border-left:3px solid var(--personal-green);padding-left:16px}.review-impact strong{display:block;font-size:32px;color:var(--personal-green);margin-bottom:10px}.review-impact span{font-size:12px;color:var(--personal-muted)}.review-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:20px 0}.review-desk label{display:grid;gap:8px;font-size:12px;color:var(--personal-muted)}.review-desk select{padding:10px;border:1px solid var(--personal-line);border-radius:8px;color:var(--personal-ink);background:var(--personal-white);max-width:100%}.review-verdict{padding:18px 22px;background:#fff4ef;border-left:4px solid var(--personal-danger);border-radius:8px;margin-bottom:20px}.review-verdict.passed{background:#eef4ee;border-color:var(--personal-green)}.review-verdict h3{font-size:19px;margin:0 0 10px}.review-verdict>p{font-size:13px}.review-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:16px}.review-values>div{min-width:0}.review-desk pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;max-height:330px;background:var(--personal-dark);color:var(--personal-white);padding:14px;border-radius:8px;font:12px/1.6 monospace}.review-desk .handoff{max-height:400px}.review-desk .hash{overflow-wrap:anywhere}.review-desk details{margin:18px 0;font-size:13px}.review-desk summary{cursor:pointer}.review-desk li{margin:12px 0}.review-desk .command{font-size:11px;white-space:normal;overflow-wrap:anywhere}@media(max-width:700px){.review-values{grid-template-columns:1fr}.review-impact{gap:12px}.review-impact strong{font-size:25px}.review-impact span{font-size:11px}.review-toolbar{align-items:stretch;flex-direction:column}}
</style>
