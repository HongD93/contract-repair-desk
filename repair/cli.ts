import { prepareJob, checkJob } from './engine.ts';
import { reviewJob, reviewStatus } from './review.ts';
import { prepareProposal, inspectProposal, adoptProposal } from './proposal.ts';
import { auditMutations } from './mutation.ts';
try {
  const [command,...args]=process.argv.slice(2);
  if(command==='draft' && args.length===2) console.log(JSON.stringify(prepareProposal(...args as [string,string]),null,2));
  else if(command==='inspect-draft' && args.length===2) { const result=inspectProposal(...args as [string,string]); console.log(JSON.stringify({state:result.state,proposalHash:result.proposalHash,contractHash:result.contractHash,grounding:result.grounding,proposal:result.proposal},null,2)); }
  else if(command==='adopt-draft' && args.length===4) console.log(JSON.stringify(adoptProposal(...args as [string,string,string,string]),null,2));
  else if(command==='mutation-audit' && args.length===4) { const result=await auditMutations(...args as [string,string,string,string]); console.log(JSON.stringify(result.summary,null,2)); if(result.summary.survived || result.summary.inconclusive || result.summary.controlsPreserved !== result.summary.equivalentControls) process.exitCode=1; }
  else if(command==='prepare' && args.length===3) console.log(JSON.stringify(prepareJob(...args as [string,string,string]),null,2));
  else if(command==='check' && args.length===1) {
    const report=await checkJob(args[0]);
    console.log(JSON.stringify({outcome:report.outcome,before:report.before.pass,after:report.after.pass,total:report.after.total,controlsPreserved:report.controlsPreserved,checks:report.after.checks,report:'report.json in the job directory'},null,2));
    if(!['verified-repair','already-passing'].includes(report.outcome))process.exitCode=1;
  } else if(command==='review' && args.length===3) {
    const report=await reviewJob(...args as [string,string,string]);
    console.log(JSON.stringify({outcome:report.outcome,initial:report.initial.pass,initialTotal:report.initial.total,additional:report.additional.pass,additionalTotal:report.additional.total,failures:report.failures.length,bundle:args[2]},null,2));
    if(report.outcome!=='review-passed')process.exitCode=1;
  } else if(command==='status' && args.length===3) {
    const status=reviewStatus(...args as [string,string,string]);
    console.log(JSON.stringify(status,null,2));
    if(!status.usable)process.exitCode=1;
  } else throw new Error('Usage: node repair/cli.ts prepare <contract.json> <consumer.ts> <new-job-directory> | check <job> | review <job> <plan> <new-bundle> | status <job> <plan> <bundle> | draft <job> <new-draft-directory> | inspect-draft <job> <proposal.json> | adopt-draft <job> <proposal.json> <decisions.json> <new-plan.json> | mutation-audit <job> <plan> <mutations.json> <new-report.json>');
} catch(error) {console.error(JSON.stringify({outcome:'blocked',error:error.message}));process.exitCode=2;}
