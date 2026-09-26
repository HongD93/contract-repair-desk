<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { cases } from '../../sample/cases.ts';
import { toVisibleTasks } from '../../sample/view-model.ts';
import { toVisibleTasks as legacyTasks } from '../../fixtures/view-model-before.ts';
import RepairLab from './RepairLab.vue';

const baseUrl = import.meta.env.BASE_URL;
const originalStarted = ref(false);
const selected = ref('renamed-title');
const phase = ref('after');
const tab = ref('preview');
const report = ref(null);
const reportError = ref('');
const reportLoading = ref(false);
const body = ref(null);
const tasks = ref([]);
const previewError = ref('');
const loading = ref(false);
let previewRequest, reportRequest;
const currentCase = computed(() => cases.find(item => item.id === selected.value));
const verified = computed(() => report.value?.outcome === 'verified-repair');
const currentLog = computed(() => report.value?.[phase.value]);
const selectedResult = computed(() => report.value?.[phase.value]?.cases.find(item => item.id === selected.value));
const outcomeText = computed(() => ({'verified-repair':'Three repairs verified','inconclusive':'Verification incomplete','not-repaired':'Repair not verified'})[report.value?.outcome] || 'Evidence unavailable');

async function runPreview() {
  previewRequest?.abort();
  const request = new AbortController(); previewRequest = request;
  loading.value = true; previewError.value = ''; tasks.value = []; body.value = null;
  try {
    const response = await fetch(`${baseUrl}fixtures/${selected.value}.json`, {signal:request.signal,cache:'no-store'});
    if (!response.ok) throw new Error(`Fixture unavailable (HTTP ${response.status})`);
    const payload = await response.json();
    if(previewRequest !== request) return;
    body.value = payload;
    tasks.value = (phase.value === 'before' ? legacyTasks : toVisibleTasks)(payload);
  } catch(error) {
    if(error.name !== 'AbortError' && previewRequest === request) previewError.value = error.message;
  } finally { if(previewRequest === request) loading.value = false; }
}
function validate(data) {
  if(data?.schemaVersion !== 2 || data.kind !== 'recorded-suite-verification' || !['verified-repair','inconclusive','not-repaired'].includes(data.outcome) || typeof data.runId !== 'string' || Number.isNaN(Date.parse(data.generatedAt))) throw new Error('Unsupported evidence format');
  for(const stage of ['before','after']) {
    const result=data[stage];
    if(!result || !['total','pass','fail','skip','cancel'].every(key=>Number.isInteger(result[key]) && result[key]>=0) || typeof result.stdout !== 'string' || typeof result.stderr !== 'string' || typeof result.inconclusive !== 'boolean' || !Array.isArray(result.cases) || !cases.every(item=>result.cases.filter(row=>row.id===item.id && typeof row.passed==='boolean').length===1)) throw new Error('Incomplete test results');
  }
  if(data.outcome==='verified-repair' && (data.before.exitCode!==1 || data.before.pass!==3 || data.before.fail!==3 || data.after.exitCode!==0 || data.after.pass!==6 || data.after.fail!==0 || ['before','after'].some(stage=>data[stage].total!==6 || data[stage].skip || data[stage].cancel || data[stage].inconclusive || data[stage].spawnError) || cases.some(item=>data.before.cases.find(row=>row.id===item.id).passed !== (item.category!=='repair') || !data.after.cases.find(row=>row.id===item.id).passed))) throw new Error('Verification claim conflicts with the recorded results');
  return data;
}
async function loadReport() {
  reportRequest?.abort(); const request=new AbortController(); reportRequest=request;
  reportLoading.value=true; reportError.value=''; report.value=null;
  try {
    const response=await fetch(`${baseUrl}evidence/suite.json`,{signal:request.signal,cache:'no-store'});
    if(!response.ok) throw new Error(`Evidence unavailable (HTTP ${response.status})`);
    const data=validate(await response.json());
    if(reportRequest===request) report.value=data;
  } catch(error) { if(error.name!=='AbortError' && reportRequest===request) reportError.value=error.message; }
  finally { if(reportRequest===request) reportLoading.value=false; }
}
watch([selected,phase],()=>{if(originalStarted.value)runPreview();});
function openOriginal(event) {
  if (!event.target.open || originalStarted.value) return;
  originalStarted.value = true; runPreview(); loadReport();
}
onBeforeUnmount(()=>{previewRequest?.abort();reportRequest?.abort();previewRequest=null;reportRequest=null;});
</script>

<template>
  <div class="desk">
    <aside class="rail">
      <a class="brand" href="#main"><span class="brand-mark">cr<span>↗</span></span><span>CONTRACT<br>REPAIR DESK</span></a>
      <div class="rail-label">REPAIR WORKSPACE</div>
      <div class="workspace"><span class="square">03</span><div>Consumer contracts<small>Synthetic migration jobs</small></div></div>
      <div class="rail-label">EXPLORE THE WORKFLOW</div>
      <nav class="case-nav" aria-label="Repair sections"><a href="#live-adapter">Live warehouse</a><a href="#review-desk">Independent review</a><a href="#recorded-jobs">Recorded repair jobs</a><a href="#verification-guards">Verification guards</a><a href="#comparison-study">Comparison study</a><a href="#preparation-lab">Check the checks</a><a href="#bring-contract">Use your own contract</a></nav>
      <div class="rail-bottom"><span class="status-dot"></span> No account or API key needed<small>IBM Bob IDE + Bob Shell<br>Solo Workflow Lab · 2026</small></div>
    </aside>
    <main id="main">
      <header class="topbar"><span>DEVELOPER WORKFLOW / CONTRACT REPAIR</span><span class="replay-label">Working sample · Recorded evidence</span></header>
      <RepairLab />
      <details class="original-sample" @toggle="openOriginal"><summary>Explore the original six-case task board and first Bob repair</summary>
      <section class="intro"><div><p class="eyebrow">BREAKAGE → REPAIR → PROOF</p><h1>Keep the change.<br><span>Repair the experience.</span></h1><p class="description">See what an API change breaks. Inspect Bob-assisted repairs.<br>Verify them against the same expectations.</p></div><div class="intro-action"><a class="secondary" href="#workbench">Try the sample ↓</a><small>Six cases. No inference charges.</small></div></section>
      <section class="verdict" :class="{verified}"><div class="verdict-icon">{{verified?'✓':'?'}}</div><div><h2>{{outcomeText}}</h2><p>{{reportLoading?'Loading recorded test results…':reportError || 'Two controls preserved. Unsupported input rejected explicitly.'}}</p></div><span v-if="report" class="check-count">{{report.after.pass}} / 6 checks pass</span><button v-if="reportError" class="secondary" @click="loadReport">Retry evidence</button></section>
      <section id="workbench" class="workbench">
        <div class="workbench-head"><div><p class="eyebrow">INTERACTIVE SAMPLE</p><h2>{{currentCase.title}}</h2><p>{{currentCase.reason}}</p></div><label class="mobile-case">Choose a case<select v-model="selected"><option v-for="item in cases" :key="item.id" :value="item.id">{{item.title}}</option></select></label></div>
        <div class="toolbar"><div class="segmented" aria-label="Consumer version"><button :aria-pressed="phase==='before'" :class="{active:phase==='before'}" @click="phase='before'">Before repair</button><button :aria-pressed="phase==='after'" :class="{active:phase==='after'}" @click="phase='after'">After repair</button></div><button class="secondary" :disabled="loading" @click="runPreview">{{loading?'Fetching fixture…':'Run sample again'}}</button></div>
        <p class="mode-note">Runs the actual {{phase==='before'?'saved original':'repaired'}} mapping in your browser against a fetched static JSON fixture. This does not call Bob.</p>
        <div class="workbench-tabs"><button :aria-pressed="tab==='preview'" :class="{active:tab==='preview'}" @click="tab='preview'">Task preview</button><button :aria-pressed="tab==='payload'" :class="{active:tab==='payload'}" @click="tab='payload'">API payload</button><button :aria-pressed="tab==='evidence'" :class="{active:tab==='evidence'}" @click="tab='evidence'">Recorded test log</button></div>
        <div v-if="tab==='preview'" class="preview-content">
          <p v-if="loading" role="status">Loading sample…</p>
          <div v-else-if="previewError" class="rejection" role="alert"><h3>{{previewError==='Unsupported task response'?'Response rejected':'Sample unavailable'}}</h3><p>{{previewError}}</p><small>{{previewError==='Unsupported task response'?'No task was fabricated. The payload stays available for investigation.':'Retry the sample after the fixture becomes available.'}}</small></div>
          <template v-else><div class="task-app-header"><span>TASK BOARD</span><small>{{tasks.length}} task · {{phase==='before'?'Original consumer':'Repaired consumer'}}</small></div><div v-for="task in tasks" :key="task.id" class="task-row"><span class="task-circle"></span><div><h3>{{task.title || '(Missing task title)'}}</h3><small>{{task.id}}</small></div><span class="task-status" :class="{bad:task.statusLabel==='Unknown'}">{{task.statusLabel}}</span><span class="priority" :class="{critical:task.priorityLabel==='Critical'}">{{task.priorityLabel}}</span></div><p v-if="!tasks.length" class="empty-state">No tasks returned.</p></template>
        </div>
        <pre v-else-if="tab==='payload'" class="payload" tabindex="0">{{body ? JSON.stringify(body,null,2) : 'No payload loaded.'}}</pre>
        <div v-else class="embedded-log"><p>Recorded at {{report ? new Date(report.generatedAt).toLocaleString() : 'unavailable'}}. Switching the preview does not rerun these tests.</p><p v-if="selectedResult">Selected case: {{selectedResult.passed?'PASS':'FAIL'}}{{selected==='unsupported'?' (PASS means explicit rejection)':''}}</p><pre tabindex="0">{{currentLog ? currentLog.stdout + currentLog.stderr : reportError || 'No report loaded.'}}</pre></div>
      </section>
      <section class="details-grid"><article class="panel"><div class="section-heading"><span class="eyebrow">A REPEATABLE LOCAL WORKFLOW</span></div><h2>One command collects the proof.</h2><ol class="workflow-steps"><li>Pin the intended contract and acceptance checks.</li><li>Reproduce failures in isolated copies.</li><li>Ask Bob to repair the consumer; review its changes.</li><li>Replay both versions and export logs, hashes and outcomes.</li></ol><code class="command">npm run evidence</code><p class="subtle">The command does not call Bob or modify the working consumer. The web demo is read-only.</p></article><article class="panel"><div class="section-heading"><span class="eyebrow">OBSERVED RESULT</span><span class="small-tag">{{report?.nodeVersion || 'Node.js'}}</span></div><h2>Three defects. Same six checks.</h2><div class="result-numbers"><div><strong>{{report?.before.pass ?? '—'}} / 6</strong><span>Before · three defects fail</span></div><div><strong>{{report?.after.pass ?? '—'}} / 6</strong><span>After · all expectations pass</span></div></div><p class="subtle">Includes two controls and one required rejection. These are sample correctness results, not a measured human productivity improvement.</p><p v-if="report" class="subtle">This recorded local capture took {{(report.elapsedMs/1000).toFixed(2)}} s. It excludes Bob work and human review.</p></article></section>
      <section v-if="report" class="provenance"><details><summary>Inspect pinned files and provenance <span>SHA-256</span></summary><p>Run {{report.runId}} · {{report.generatedAt}}</p><dl><div v-for="(hash,file) in report.inputs" :key="file"><dt>{{file}}</dt><dd>{{hash}}</dd></div></dl><p>The manifest detects accidental fixture changes. It is not third-party attestation.</p></details><div class="downloads"><a :href="`${baseUrl}evidence/suite.json`" download="contract-repair-evidence.json">Download JSON</a><a :href="`${baseUrl}evidence/suite.html`" target="_blank" rel="noopener">Open HTML report ↗</a><a :href="`${baseUrl}evidence/report.html`" target="_blank" rel="noopener">First IDE repair evidence ↗</a></div></section>
      <footer><h2>Built with Bob. Checked independently.</h2><p>IBM Bob IDE repaired the first HTTP consumer. Bob Shell drafted evidence capture and the expanded view mapper. Codex prepared fixtures, reviewed and hardened the code, and built this viewer. All data is fictional; no production claims or benchmarked time savings.</p><span>THREE SUPPORTED REPAIRS · TWO CONTROLS · EXPLICIT UNSUPPORTED INPUT</span></footer>
      </details>
    </main>
  </div>
</template>
