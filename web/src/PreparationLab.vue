<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { validatePreparationEvidence, validateAnonymousObservation } from '../../repair/preparation-display.ts';
import { useWhenVisible } from './useWhenVisible.js';
const section = ref(null);
const data = ref(null), observed = ref(null), error = ref(''), selected = ref('zero');
let controller;
async function load() {
  controller?.abort(); const current = new AbortController(); controller = current;
  data.value = null; observed.value = null; error.value = '';
  try {
    const [result, anonymous] = await Promise.all([
      ['preparation-lab.json', validatePreparationEvidence],
      ['anonymous-observation.json', validateAnonymousObservation],
    ].map(async ([file, validate]) => {
      const response = await fetch(`${import.meta.env.BASE_URL}evidence/${file}`, { signal: current.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      return validate(await response.json());
    }));
    if (!current.signal.aborted) { data.value = result; observed.value = anonymous; }
  } catch { if (!current.signal.aborted) error.value = 'Example evidence is unreadable. Restore the file and retry.'; }
}
useWhenVisible(section, load); onBeforeUnmount(() => controller?.abort());
const proposal = computed(() => data.value?.proposal.checks.find(row => row.check.id === selected.value));
const decision = computed(() => data.value?.decisions.decisions.find(row => row.id === selected.value));
</script>

<template>
  <section ref="section" id="preparation-lab" class="panel preparation-lab">
    <div class="panel-body">
      <p class="eyebrow">ANONYMIZED OBSERVATION · REPRODUCIBLE TEACHING EXAMPLE</p>
      <h2>Who checks the checks?</h2>
      <p>Preserve zero. Reject invalid counts. Use this invented unit counter to inspect proposal decisions and test the tests.</p>
      <p class="muted">Codex authored the example code, proposals and decisions. This demonstrates the local workflow; it is not an actual Bob-generated repair or a source-project case.</p>
      <div v-if="error" role="alert"><p>{{error}}</p><button class="secondary" @click="load">Retry example evidence</button></div>
      <p v-else-if="!data">Loading example evidence…</p>
      <template v-else>
        <article class="example-decision">
          <p class="eyebrow">SEPARATE ACTUAL EXECUTION · ANONYMIZED AGGREGATES</p>
          <h3>Keep the measured result. Keep the source private.</h3>
          <p>Bob proposed {{observed.drafted}} checks. Codex accepted {{observed.accepted}} and excluded {{observed.rejected}}. The repaired candidate passed {{observed.original.pass}}/{{observed.original.total}} original checks, {{observed.adopted.pass}}/{{observed.adopted.total}} adopted checks and {{observed.withheld.pass}}/{{observed.withheld.total}} cases withheld from both Bob calls.</p>
          <p>Selected errors caught: initial {{observed.faults.detectedByInitial}}/{{observed.faults.seededFaults}}, reviewed proposals {{observed.faults.detectedByCombined}}/{{observed.faults.seededFaults}}. Two Codex checks added after the audit catch the same errors {{observed.postAuditDetected}}/{{observed.faults.seededFaults}}. Equivalent control: {{observed.faults.controlsPreserved}}/{{observed.faults.equivalentControls}}.</p>
          <p class="muted">{{observed.scope}} {{observed.limitations}}</p>
        </article>
        <h3>Try the separate, reproducible teaching example.</h3>
        <div class="example-stats"><span>3 illustrative proposals</span><span>2 accepted</span><span>1 rejected</span></div>
        <label for="example-proposal">Proposed expectation</label>
        <select id="example-proposal" v-model="selected"><option v-for="row in data.proposal.checks" :key="row.check.id" :value="row.check.id">{{row.check.id}}</option></select>
        <button class="secondary" @click="selected='invented-default'">Show an unsupported proposal</button>
        <div class="example-decision" :class="{rejected:decision.action==='reject'}"><h3>{{decision.action === 'accept' ? 'Accepted against the stated rule' : 'Rejected: the default was invented'}}</h3><p>{{decision.reason}}</p></div>
        <div class="comparison"><div><p>CLAIMED REQUIREMENT</p><blockquote>{{proposal.quote}}</blockquote><p>Exact quote: {{data.contract.requirements.includes(proposal.quote) ? 'matches' : 'does not match'}}. Matching text still requires review of the expected result.</p></div><pre>{{JSON.stringify(proposal.check,null,2)}}</pre></div>
        <h3>Deliberately wrong patches test the expectations.</h3>
        <p>Initial checks catch {{data.audit.summary.detectedByInitial}} / {{data.audit.summary.seededFaults}} seeded errors. Combined checks catch {{data.audit.summary.detectedByCombined}} / {{data.audit.summary.seededFaults}}. Behavior-preserving control: {{data.audit.summary.controlsPreserved}} / {{data.audit.summary.equivalentControls}} stays green.</p>
        <div class="fault-scroll"><table><thead><tr><th>Seeded change</th><th>Initial failures</th><th>Added failures</th><th>Result</th></tr></thead><tbody><tr v-for="row in data.audit.rows" :key="row.id"><td>{{row.reason}}</td><td>{{row.initialFailures}}</td><td>{{row.addedFailures}}</td><td>{{row.state}}</td></tr></tbody></table></div>
        <p class="muted">These results come from real local execution on the invented fixture. Selected errors are not a benchmark, comprehensive coverage or a production detection rate. Selecting an example displays saved results.</p>
        <details><summary>Inspect the complete synthetic fixture</summary><pre>{{data.source}}</pre><p>{{data.contract.requirements}}</p><code>npm run preparation:evidence</code></details>
      </template>
    </div>
  </section>
</template>

<style scoped>
.example-stats{display:flex;gap:24px;flex-wrap:wrap;padding:20px 0;color:var(--personal-green);font-weight:600}.preparation-lab label{display:block;margin-top:20px}.preparation-lab select{max-width:100%;padding:12px;margin:10px 12px 16px 0;border:1px solid var(--personal-line);border-radius:8px;background:white}.example-decision{padding:18px;border-left:4px solid var(--personal-green);background:var(--personal-soft);border-radius:8px}.example-decision.rejected{border-color:var(--personal-danger);background:#fff4ef}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}.comparison>div{min-width:0}.preparation-lab blockquote{margin:20px 0;overflow-wrap:anywhere}.preparation-lab pre{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;background:var(--personal-dark);color:var(--personal-white);padding:16px;border-radius:8px}.fault-scroll{overflow:auto}.fault-scroll table{border-collapse:collapse;width:100%;font-size:12px}.fault-scroll th,.fault-scroll td{padding:12px;text-align:left;border-bottom:1px solid var(--personal-line)}.preparation-lab details{margin-top:20px}.preparation-lab summary{cursor:pointer}@media(max-width:700px){.comparison{grid-template-columns:1fr}.fault-scroll th,.fault-scroll td{padding:8px}.example-stats{gap:12px}}
</style>
