<script setup>
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {parseContract} from '../../repair/contract.ts';
import stock from '../../repair/examples/stock.contract.json';
import {mapResponse as originalStock} from '../../repair/examples/stock.consumer.ts';
import {mapResponse as repairedStock} from '../../repair/recorded/stock-ide.ts';
import ReviewDesk from './ReviewDesk.vue';
import PreparationLab from './PreparationLab.vue';
import {useWhenVisible} from './useWhenVisible.js';
const recordedSection=ref(null);
const bundle=ref(null),error=ref(''),loading=ref(false),selected=ref('stock'),stage=ref('before'),view=ref('behavior');
const contractText=ref(JSON.stringify(stock,null,2)),contractMessage=ref(''),contractInvalid=ref(false);
const liveText=ref(JSON.stringify(stock.checks[2].input,null,2)),livePhase=ref('before'),liveResult=ref(null),liveError=ref('');
const executedText=ref(null);
const liveStale=computed(()=>executedText.value!==liveText.value);
const liveExamples=[
  {id:'zero-means-out-of-stock',label:'Zero stays zero'},
  {id:'mixed-precedence',label:'Keep the legacy value'},
  {id:'negative-stock',label:'Reject negative stock'},
];
function loadLiveExample(id){
  liveText.value=JSON.stringify(stock.checks.find(check=>check.id===id).input,null,2);
  runLive();
}
function runLive(){
  liveError.value='';liveResult.value=null;executedText.value=liveText.value;
  try{if(new TextEncoder().encode(liveText.value).length>32768)throw new Error('Input exceeds 32 KiB');const value=JSON.parse(liveText.value);if(Array.isArray(value?.items)&&value.items.length>50)throw new Error('Maximum 50 items');liveResult.value=(livePhase.value==='before'?originalStock:repairedStock)(value);}
  catch(reason){liveError.value=reason.message;}
}
const current=computed(()=>bundle.value?.studies.find(item=>item.id===selected.value));
const report=computed(()=>current.value?.report);
const checks=computed(()=>report.value?.[stage.value]?.checks ?? []);
const activeCheck=ref('zero-means-out-of-stock');
const check=computed(()=>checks.value.find(item=>item.id===activeCheck.value) ?? checks.value.find(item=>!item.passed) ?? checks.value[0]);
function selectStudyCheck(){activeCheck.value=checks.value.find(item=>!item.passed)?.id ?? checks.value.find(item=>item.purpose==='migration')?.id ?? checks.value[0]?.id ?? ''; }
let request;
function validReport(row) {
  if(row?.version!==1 || row.kind!=='contract-repair-job' || typeof row.source?.before!=='string' || typeof row.source?.after!=='string')throw new Error('Unsupported repair evidence');
  for(const phase of ['before','after']) {
    const result=row[phase];
    if(!Array.isArray(result?.checks) || !result.checks.length || result.checks.length>50 || result.total!==result.checks.length || result.pass!==result.checks.filter(item=>item.passed===true).length || result.checks.some(item=>typeof item.id!=='string'||typeof item.passed!=='boolean'||item.httpStatus!==200))throw new Error('Inconsistent repair evidence');
  }
  if(row.outcome==='verified-repair' && (row.after.pass!==row.after.total || row.after.failure || row.before.failure || row.before.pass===row.before.total || row.controlsPreserved!==true))throw new Error('Repair claim conflicts with checks');
  return row;
}
async function load(){
  request?.abort(); const active=new AbortController();request=active;loading.value=true;error.value='';bundle.value=null;
  try{const response=await fetch(`${import.meta.env.BASE_URL}evidence/repair-lab.json`,{signal:active.signal,cache:'no-store'});if(!response.ok)throw new Error(`Repair evidence unavailable (${response.status})`);const data=await response.json();
    if(data.version!==1 || !Array.isArray(data.studies) || !data.studies.length)throw new Error('No verified studies available');
    data.studies.forEach(item=>validReport(item.report));if(request===active)bundle.value=data;
  }catch(reason){if(reason.name!=='AbortError' && request===active)error.value=reason.message;}
  finally{if(request===active)loading.value=false;}
}
function download(name,text,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportContract(){
  try{const value=parseContract(contractText.value);contractInvalid.value=false;contractMessage.value=`${value.checks.length} checks validated structurally. Expected business meaning is supplied by you, not certified by this tool.`;download('contract.json',JSON.stringify(value,null,2));}
  catch(reason){contractInvalid.value=true;contractMessage.value=reason.message;}
}
useWhenVisible(recordedSection, load, ['#recorded-jobs', '#verification-guards', '#comparison-study']);
onMounted(runLive);onBeforeUnmount(()=>{request?.abort();request=null;});
</script>

<template>
  <section id="repair-lab" class="repair-lab">
    <div class="intro"><div><p class="eyebrow">HTTP 200. WRONG EXPERIENCE.</p><h1>The request worked.<br><span>The meaning broke.</span></h1><p class="description">Zero units become twenty. See the failure, then try Bob's repair.<br> Package exact failures for Bob. Independently check the fix and the behavior it must preserve.</p></div><a class="secondary" href="#live-adapter">Try the zero-stock failure</a></div>
    <p class="judge-route">Start here: switch to Bob IDE repair and watch 20 become 0. Then try legacy precedence and invalid input. Below, inspect how added review catches gaps after an initial pass.</p>
    <div class="repair-flow" aria-label="Repair workflow"><span>1 · Reproduce the failure</span><span>2 · Give Bob a fixed contract</span><span>3 · Package review gaps</span><span>4 · Recheck the repair</span></div>
    <section id="live-adapter" class="panel live-adapter"><p class="eyebrow">LIVE IN YOUR BROWSER · ACTUAL BOB IDE CODE</p><h2>Try the repaired warehouse adapter.</h2><p class="subtle">The server says zero units remain. The original consumer invents twenty. Edit the synthetic response and run either version. Your input stays in this browser.</p><div class="live-examples" aria-label="Try a contract rule"><button v-for="example in liveExamples" :key="example.id" class="secondary" @click="loadLiveExample(example.id)">{{example.label}}</button></div><div class="comparison"><div><label for="live-payload">Synthetic response JSON</label><textarea id="live-payload" v-model="liveText" spellcheck="false" aria-describedby="live-input-status"></textarea><div class="segmented"><button :aria-pressed="livePhase==='before'" :class="{active:livePhase==='before'}" @click="livePhase='before';runLive()">Original code</button><button :aria-pressed="livePhase==='after'" :class="{active:livePhase==='after'}" @click="livePhase='after';runLive()">Bob IDE repair</button></div><button class="secondary" @click="runLive">Run edited response</button></div><div class="live-output" aria-live="polite"><p class="eyebrow">VISIBLE WAREHOUSE</p><p v-if="liveStale" role="status">Input changed. Run the edited response to see its result.</p><p v-else-if="liveError" id="live-error" role="alert">{{liveError}}</p><template v-else><article v-for="(item,index) in liveResult" :key="index" class="live-stock-row"><span>{{item.label || '(Missing label)'}}<small>{{item.sku}}</small></span><span>{{item.available}} units<small>{{item.available===0?'Out of stock':'Available'}}</small></span></article><p v-if="liveResult?.length===0">No stock items.</p></template></div></div><p id="live-input-status" class="subtle">This executes the selected saved adapter, not a new AI repair. Custom input is not automatically certified by the recorded contract checks.</p></section>
    <ReviewDesk />
    <div id="recorded-jobs" ref="recordedSection"></div>
    <p v-if="loading" role="status">Loading executed repair evidence…</p>
    <div v-if="error" class="rejection" role="alert"><p>{{error}}</p><button class="secondary" @click="load">Retry repair evidence</button></div>
    <template v-if="bundle && report">
      <section class="workbench">
        <div class="workbench-head"><div><p class="eyebrow">RECORDED EXECUTION · REAL LOOPBACK HTTP</p><h2>{{report.name}}</h2><p>{{current.summary}}</p></div><label class="mobile-case">Project<select v-model="selected" @change="selectStudyCheck"><option v-for="item in bundle.studies" :value="item.id" :key="item.id">{{item.report.name}}</option></select></label></div>
        <div class="toolbar"><div class="segmented"><button :aria-pressed="stage==='before'" :class="{active:stage==='before'}" @click="stage='before'">Before repair</button><button :aria-pressed="stage==='after'" :class="{active:stage==='after'}" @click="stage='after'">Bob candidate</button></div><span class="small-tag">{{report[stage].pass}} / {{report[stage].total}} checks pass</span></div>
        <div class="workbench-tabs"><button :aria-pressed="view==='behavior'" :class="{active:view==='behavior'}" @click="view='behavior'">Visible consequence</button><button :aria-pressed="view==='source'" :class="{active:view==='source'}" @click="view='source'">Actual code change</button><button :aria-pressed="view==='checks'" :class="{active:view==='checks'}" @click="view='checks'">All contract checks</button></div>
        <div v-if="view==='behavior' && check" class="preview-content">
          <label class="repair-check-label">Choose a check<select v-model="activeCheck"><option v-for="item in checks" :key="item.id" :value="item.id">{{item.id}}</option></select></label>
          <div class="meaning-card"><span class="small-tag">HTTP {{check.httpStatus}} OK</span><h3>{{check.passed?'The contract holds.':'The request succeeds. The contract fails.'}}</h3><div class="comparison"><div><p class="eyebrow">EXPECTED BY THE DEVELOPER</p><pre tabindex="0">{{JSON.stringify(check.expected,null,2)}}</pre></div><div><p class="eyebrow">ACTUALLY PRODUCED</p><pre tabindex="0">{{JSON.stringify(check.actual,null,2)}}</pre></div></div></div>
          <p class="subtle">{{current.attribution}} This view replays saved execution results; selecting a tab does not call Bob or rerun tests.</p>
          <p v-if="current.supplemental" class="subtle">Additional boundary review: {{current.supplemental.pass}} / {{current.supplemental.total}} passed. This review was added after the initial run; seven passing checks do not establish complete contract coverage.</p>
        </div>
        <div v-else-if="view==='source'" class="preview-content"><div class="comparison code-comparison"><div><p class="eyebrow">PINNED ORIGINAL</p><pre tabindex="0">{{report.source.before}}</pre></div><div><p class="eyebrow">ACTUAL BOB CANDIDATE</p><pre tabindex="0">{{report.source.after}}</pre></div></div><p class="subtle">Source is shown verbatim from the recorded run. The independent verifier, contract and baseline stay unchanged.</p></div>
        <div v-else class="preview-content"><div v-for="item in checks" :key="item.id" class="check-row"><span :class="{failed:!item.passed}">{{item.passed?'PASS':'FAIL'}}</span><span>{{item.id}}<small>{{item.purpose}}</small></span><span>HTTP {{item.httpStatus}}</span></div></div>
        <div class="repair-evidence-foot"><span>{{report.outcome}} · {{report.generatedAt}}</span><button class="secondary" @click="download('repair-evidence.json',JSON.stringify(report,null,2))">Download full evidence</button></div>
      </section>
      <section id="verification-guards" class="panel"><p class="eyebrow">WHAT A GREEN CHECK MUST NOT HIDE</p><h2>Reject the wrong repair.</h2><div class="guard-grid"><article v-for="guard in bundle.guards" :key="guard.id"><h3>{{guard.title}}</h3><p>{{guard.description}}</p><span class="small-tag">{{guard.outcome}}</span></article></div><p class="subtle">These are independently executed verifier checks, not additional Bob repair claims.</p></section>
      <section id="comparison-study" v-if="bundle.benchmark" class="panel benchmark-panel"><p class="eyebrow">RECORDED REPAIR COMPARISON</p><h2>Does the prepared workflow help?</h2><p class="subtle">{{bundle.benchmark.scope}}</p><div class="benchmark-scroll"><table><thead><tr><th>Case</th><th>Condition</th><th>Initial checks</th><th>Later boundary review</th><th>Elapsed</th><th>Bobcoins</th></tr></thead><tbody><tr v-for="run in bundle.benchmark.runs" :key="run.id"><td>{{run.caseId}}</td><td>{{run.condition}}</td><td>{{run.pass}} / {{run.total}}</td><td>{{run.supplemental?.pass}} / {{run.supplemental?.total}}</td><td>{{(run.totalMs/1000).toFixed(1)}} s</td><td>{{Number(run.cost).toFixed(3)}}</td></tr></tbody></table></div><p class="subtle">{{bundle.benchmark.conclusion}}</p><p class="subtle">{{bundle.benchmark.supplementalNote}}</p><p v-for="limit in bundle.benchmark.limitations" :key="limit" class="subtle">{{limit}}</p><p class="subtle">Same source, contract and baseline evidence. Fresh Bob Shell sessions, read/edit tools only; independent checks run afterward. One run per condition per case. This does not measure human time saved or prove an IDE productivity gain.</p></section>
    </template>
    <PreparationLab />
    <section id="bring-contract" class="panel bring-contract"><p class="eyebrow">REUSE THE WORKFLOW</p><h2>Bring the expectation, not a guessed fix.</h2><p class="subtle">Describe one TypeScript response adapter with migration, preservation and rejection checks. Use synthetic data only. This editor validates the contract format locally and downloads a job input; it does not execute your code.</p><label for="own-contract">Contract JSON · up to 64 KiB and 50 checks</label><textarea id="own-contract" v-model="contractText" spellcheck="false" :aria-invalid="contractInvalid" aria-describedby="contract-message"></textarea><button class="secondary" @click="exportContract">Validate & download contract</button><p id="contract-message" :role="contractInvalid?'alert':'status'" class="subtle">{{contractMessage}}</p><ol class="workflow-steps"><li>Export <code>mapResponse(payload)</code> from your trusted <code>consumer.ts</code>.</li><li>Prepare a new job with the command below.</li><li>Open Contract Repair Desk in Bob IDE and ask it to use the <code>contract-repair</code> skill for the job's <code>TASK.md</code>.</li><li>Review the actual candidate and replay the unchanged contract.</li></ol><code class="command">node repair/cli.ts prepare contract.json consumer.ts repair-jobs/my-case<br>node repair/cli.ts check repair-jobs/my-case</code><p class="subtle">No production data, public model endpoint or API key is needed by this site. Bob IDE uses your own authorized account and normal approvals. Only trusted, self-contained adapters are supported. A passing sample is not production certification.</p></section>
  </section>
</template>

<style scoped>
.repair-flow{display:flex;flex-wrap:wrap;gap:var(--personal-space);padding:18px 0;border-top:1px solid var(--personal-line);border-bottom:1px solid var(--personal-line);color:var(--personal-green);font-size:12px;font-weight:650}.repair-lab>.panel{margin-bottom:var(--personal-space)}.repair-lab .intro{align-items:center}.repair-lab .intro>a{white-space:nowrap;text-decoration:none}.repair-check-label{display:grid;gap:8px;font-size:12px;color:var(--personal-muted);margin-bottom:20px}.repair-check-label select{padding:10px;color:var(--personal-ink);border:1px solid var(--personal-line);background:var(--personal-white);border-radius:8px}.meaning-card{padding:20px;background:var(--personal-paper);border-radius:var(--personal-radius);border:1px solid var(--personal-line)}.meaning-card h3{font-size:20px}.repair-lab pre{max-height:400px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--personal-dark);color:var(--personal-white);padding:16px;border-radius:8px;font-size:12px;line-height:1.6}.repair-evidence-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;padding:18px 28px;border-top:1px solid var(--personal-line);font-size:11px;color:var(--personal-muted)}.guard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--personal-space);margin:18px 0}.guard-grid article{padding:16px;background:var(--personal-paper);border:1px solid var(--personal-line);border-radius:10px}.guard-grid h3{font-size:14px;margin-top:0}.guard-grid p{font-size:12px;line-height:1.8;margin:12px 0;color:var(--personal-muted)}.check-row{display:grid;grid-template-columns:54px minmax(0,1fr) 75px;gap:12px;padding:14px 0;border-bottom:1px solid var(--personal-line);font-size:12px;overflow-wrap:anywhere}.check-row>span:first-child{color:var(--personal-green);font-weight:700}.check-row>span.failed{color:var(--personal-danger)}.check-row small{color:var(--personal-muted);margin-top:5px}.benchmark-scroll{overflow:auto}.benchmark-panel table{border-collapse:collapse;width:100%;font-size:12px;margin:18px 0}.benchmark-panel th,.benchmark-panel td{text-align:left;padding:12px;border-bottom:1px solid var(--personal-line);white-space:nowrap}.bring-contract label{display:block;margin:20px 0 10px;font-size:12px}.bring-contract textarea{width:100%;height:220px;padding:16px;border:1px solid var(--personal-line);border-radius:8px;resize:vertical;background:var(--personal-paper);color:var(--personal-ink);font:12px/1.6 monospace;margin-bottom:12px}.bring-contract textarea:focus-visible{outline:3px solid var(--personal-green);outline-offset:3px}.bring-contract code{overflow-wrap:anywhere}.code-comparison>div,.meaning-card .comparison>div{min-width:0}@media(max-width:850px){.guard-grid{grid-template-columns:1fr}.repair-lab .intro{align-items:flex-start;flex-direction:column}.repair-lab .comparison{grid-template-columns:1fr}}@media(max-width:500px){.repair-flow{gap:12px;font-size:10px}.meaning-card{padding:12px}.repair-evidence-foot{padding:16px}.repair-lab pre{font-size:10px}}
</style>
