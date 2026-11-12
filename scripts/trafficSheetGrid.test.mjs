import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignDraft, reviewPayload, validateReview } from '../src/lib/trafficWeeklyReview.js';
import { filledSheetRows, padSheetRows, parseSheetClipboard, pasteSheetCells, sheetCellTarget, sheetInitialRows } from '../src/lib/trafficSheetGrid.js';
import { buildSheetColumns, inferSheetMetrics } from '../src/lib/trafficSheetLayout.js';
const account={platform:'meta',account_id:'qa',account_name:'QA',conversion_label:'Lead'};
test('spare rows and account defaults never enter payload or totals',()=>{
 const rows=padSheetRows([],account);assert.equal(rows.length,6);assert.equal(filledSheetRows(rows).length,0);
 rows[0]={...rows[0],campaign_name:'Campaign',spend:'0',messages:'0',conversions:'0'};
 const payload=reviewPayload({kind:'review',metric_mode:'campaign',campaign_metrics:rows});
 assert.equal(payload.campaign_metrics.length,1);assert.equal(payload.campaign_metrics[0].spend,0);
 assert.equal(validateReview({...payload,analysis:'Checked',action_mode:'none'},true),'');
 const last=rows.map((r,i)=>({...r,campaign_name:`C${i}`}));assert.equal(padSheetRows(last,account).length,7);
});
test('new week reuses identities but clears every number; existing records stay intact',()=>{
 const previous={metric_mode:'campaign',campaign_metrics:[campaignDraft({...account,campaign_name:'Campaign',adset_name:'Set',spend:100,messages:12,appointments:3,conversions:2,daily_budget:30})]};
 const next=sheetInitialRows({revision:0},previous,account);
 assert.equal(next[0].campaign_name,'Campaign');assert.equal(next[0].id,previous.campaign_metrics[0].id);
 assert.equal(next[0].spend,'');assert.equal(next[0].messages,'');assert.equal(next[0].daily_budget,'');
 const existing=sheetInitialRows({revision:1,campaign_metrics:previous.campaign_metrics},previous,account);assert.equal(existing[0].spend,'100');
});
test('TSV header paste maps inputs and discards calculated costs, quoted cells supported',()=>{
 const copied='Campanha\tConjunto\tGasto R$\tMensagens\tCusto / mensagem\tAgendamentos\tConversões\tConversão contada\r\n"Promo\nsetembro"\tSet 1\tR$ 350,00\t12\t999\t3\t2\tLead\r\nCamp 2\tSet 2\t400,00\t30\t999\t2\t4\tLead\r\n';
 const rows=pasteSheetCells(padSheetRows([],account),copied,0,0,account);const payload=reviewPayload({kind:'review',metric_mode:'campaign',campaign_metrics:rows});
 assert.equal(payload.campaign_metrics.length,2);assert.equal(payload.campaign_metrics[0].spend,350);assert.equal(payload.campaign_metrics[0].messages,12);
 assert.equal(rows[0].campaign_name,'Promo\nsetembro');assert.equal(rows[1].appointments,'2');assert.equal(rows[0].cpc,'');
 assert.deepEqual(parseSheetClipboard('"a""b"\t1\n'),[['a"b','1']]);
});
test('cell range paste retains untouched cells and rejects too many rows atomically',()=>{
 const rows=padSheetRows([campaignDraft({...account,campaign_name:'Existing',adset_name:'Keep'})],account);
 const next=pasteSheetCells(rows,'100\t2\t999\t3\n200\t4\t999\t5',0,2,account);
 assert.equal(next[0].campaign_name,'Existing');assert.equal(next[0].adset_name,'Keep');assert.equal(next[0].appointments,'3');
 assert.equal(rows[0].spend,'');assert.throws(()=>pasteSheetCells(rows,Array(51).fill('name').join('\n'),0,0,account),/50/);
});
test('appointment clients finalize without a generic conversion count',()=>{
 const row=campaignDraft({...account,conversion_label:'Agendamentos',campaign_name:'Campaign',spend:'100',messages:'12',appointments:'3'});
 const draft={kind:'review',metric_mode:'campaign',result_label:'Agendamentos',campaign_metrics:[row],analysis:'Checked',action_mode:'none'};
 assert.equal(validateReview(draft,true),'');
 assert.match(validateReview({...draft,campaign_metrics:[{...row,appointments:''}]},true),/resultados desta planilha/);
});
test('spreadsheet navigation skips calculated cells and wraps Tab across rows',()=>{
 assert.deepEqual(sheetCellTarget(0,3,'Tab',false,6),{row:0,column:5});
 assert.deepEqual(sheetCellTarget(0,10,'Tab',false,6),{row:1,column:0});
 assert.deepEqual(sheetCellTarget(1,0,'Tab',true,6),{row:0,column:10});
 assert.deepEqual(sheetCellTarget(0,2,'Enter',false,6),{row:1,column:2});
 assert.deepEqual(sheetCellTarget(1,2,'Enter',true,6),{row:0,column:2});
 assert.deepEqual(sheetCellTarget(1,5,'ArrowRight',false,6),{row:1,column:7});
 assert.deepEqual(sheetCellTarget(1,5,'ArrowLeft',false,6),{row:1,column:3});
 assert.deepEqual(sheetCellTarget(1,5,'ArrowDown',false,6),{row:2,column:5});
 assert.deepEqual(sheetCellTarget(1,5,'ArrowUp',false,6),{row:0,column:5});
});
test('sheet boundaries allow leaving the grid; optimization only navigates its visible columns',()=>{
 assert.equal(sheetCellTarget(0,0,'Tab',true,6),null);
 assert.equal(sheetCellTarget(5,10,'Tab',false,6),null);
 assert.equal(sheetCellTarget(0,3,'ArrowUp',false,6),null);
 assert.equal(sheetCellTarget(5,3,'Enter',false,6),null);
 assert.equal(sheetCellTarget(0,10,'ArrowRight',false,6),null);
 assert.equal(sheetCellTarget(0,3,'x',false,6),null);
 assert.deepEqual(sheetCellTarget(0,1,'Tab',false,6,true),{row:1,column:0});
 assert.deepEqual(sheetCellTarget(1,0,'Tab',true,6,true),{row:0,column:1});
 assert.equal(sheetCellTarget(0,1,'ArrowRight',false,6,true),null);
 const agend=buildSheetColumns(inferSheetMetrics('Agendamentos'),'Agendamentos');
 assert.deepEqual(sheetCellTarget(0,3,'Tab',false,6,false,agend),{row:0,column:5});
 assert.deepEqual(sheetCellTarget(0,8,'Tab',false,6,false,agend),{row:1,column:0});
});
