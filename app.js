'use strict';
const $=id=>document.getElementById(id), stations=['Petro Canada','Esso','Chevron'];
const windows=[['am','5 AM – 8 AM',300,480,stations],['mid','10 AM – 12 PM',600,720,stations],['pm','2 PM – 4 PM',840,960,stations],['eve','6 PM – 8 PM',1080,1200,['Chevron']],['night','9 PM – 11 PM',1260,1380,['Chevron']]];
let code='',role='',view='today',data=null,week='',start='',today='',busy=false,epoch=0; let selectedSurvey=null,adminRequest=null,reportFilter="Missed";
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shift=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const weekday=s=>new Date(s+'T12:00:00Z').getUTCDay();const monday=s=>shift(s,-((weekday(s)+6)%7));
const fmt=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const time=s=>s?new Date(s).toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit',timeZone:'America/Vancouver'}):'—';
const counts=rows=>Object.fromEntries(['Completed','Missed','Pending','Upcoming'].map(s=>[s,rows.filter(r=>r.status===s).length]));
async function api(action,args={}){
 if(!/^https:\/\/script\.google\.com\/(?:macros\/s\/|a\/macros\/[^/]+\/s\/)[^/]+\/exec$/.test(window.SURVEY_API||''))throw Error('Google Sheets is not connected. Follow README setup instructions.');
 const res=await fetch(window.SURVEY_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...args,action,code}),credentials:'omit',redirect:'follow'});if(!res.ok)throw Error('Google connection failed ('+res.status+'). Please refresh.');let result;try{result=await res.json()}catch{throw Error('Google did not return data. Check web app deployment access.')}if(!result.ok)throw Error(result.error||'Request failed');return result;}
function notice(msg='',err=false){$('notice').textContent=msg;$('notice').classList.toggle('error',err);}
function stat(label,val,cls='',sub=''){return `<div class="stat"><span>${label}</span><strong class="${cls}">${val}</strong><small>${sub}</small></div>`;}
function renderToday(){const rows=data.rows,c=counts(rows);$('dateLabel').textContent=fmt(data.clock.date)+' · '+('Updated '+data.clock.time+' PT');$('todayStats').innerHTML=stat('Required',rows.length,'','Station surveys')+stat('Completed',c.Completed,'green','Within window')+stat('Missed',c.Missed,'red','Window closed')+stat('Remaining',c.Pending+c.Upcoming,'','Pending + upcoming');if(!rows.length){$('slots').innerHTML='<div class="panel empty-state">Official tracking begins '+esc(fmt(start))+'. No surveys are counted before this date.</div>';return;} $('slots').innerHTML=windows.map(([id,label])=>{const rr=rows.filter(r=>r.window===id),active=rr.some(r=>r.status==='Pending'),cc=counts(rr);return `<section class="panel slot ${active?'live':''}"><div class="slothead"><h2>${label}</h2><span class="small muted">${active?'Open now · ':''}${cc.Completed}/${rr.length} completed</span></div>${rr.map(r=>{const i=stations.indexOf(r.station);return `<div class="station"><div class="stationicon" style="background:${['#b94347','#365c91','#276b99'][i]}">${['PC','E','C'][i]}</div><div class="stationtext"><b>${esc(r.station)}</b><small>${esc(r.grades.join(' · '))}${r.confirmed?' · '+esc(time(r.confirmed)):''}</small></div>${r.status==='Pending'?`<button class="primary confirm" data-window="${id}" data-station="${esc(r.station)}">Confirm</button>`:`<span class="status ${r.status}">${r.status}</span>`}</div>`}).join('')}</section>`}).join('');document.querySelectorAll('.confirm').forEach(b=>b.onclick=()=>askConfirm(b));}
function firstWeek(){return monday(start)>monday(today)?monday(today):monday(start);}
function reportStat(label,val,cls=''){
 const selected=reportFilter===label;
 return `<button type="button" class="stat report-stat ${selected?'selected':''}" data-filter="${label}" aria-pressed="${selected}" aria-controls="reportDetails"><span>${label}</span><strong class="${cls}">${val}</strong><small class="stat-hint">${selected?'Viewing details':'View details →'}</small></button>`;
}
function renderHistory(){
 if(!data||view!=='week'||!data.week)return;
 const filter=reportFilter;
 const matches=data.rows.filter(r=>filter==='Required'||(filter==='Remaining'?['Pending','Upcoming'].includes(r.status):r.status===filter));
 $('detailTitle').textContent=filter==='Required'?'All surveys':filter+' surveys';
 $('detailCount').textContent=`${matches.length} ${matches.length===1?'survey':'surveys'} · ${fmt(data.week)} – ${fmt(data.end)}`;
 $('history').innerHTML=matches.map(r=>`<tr><td data-label="Day &amp; date"><b>${esc(new Date(r.date+'T12:00:00Z').toLocaleDateString('en-CA',{weekday:'long',timeZone:'UTC'}))}</b><small>${esc(r.date)}</small></td><td data-label="Time window">${esc(r.label)}</td><td data-label="Station &amp; fuel grades"><b>${esc(r.station)}</b><small>${esc(r.grades.join(' · '))}</small></td><td data-label="Status"><span class="status ${esc(r.status)}">${esc(r.status)}</span></td><td data-label="Confirmed at">${r.status==='Completed'&&r.confirmed?esc(time(r.confirmed))+' PT':'—'}</td></tr>`).join('')||`<tr class="detail-empty"><td colspan="5">${filter==='Missed'?'No missed surveys for this week.':filter==='Completed'?'No completed surveys for this week.':filter==='Remaining'?'No surveys remaining for this week.':'No surveys tracked for this week.'}</td></tr>`;
 $('weekStats').querySelectorAll('[data-filter]').forEach(b=>{const selected=b.dataset.filter===filter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.querySelector('.stat-hint').textContent=selected?'Viewing details':'View details →';});
}
function renderWeek(){const rows=data.rows,c=counts(rows),remaining=c.Pending+c.Upcoming;$('weekLabel').textContent=fmt(data.week)+' – '+fmt(data.end);$('weekDate').value=data.week;$('weekDate').min=firstWeek();$('weekDate').max=today;$('prev').disabled=week<=firstWeek();$('next').disabled=week>=monday(today);$('export').disabled=!rows.length;
 $('weekStats').innerHTML=reportStat('Required',rows.length)+reportStat('Completed',c.Completed,'green')+reportStat('Missed',c.Missed,'red')+reportStat('Remaining',remaining);
 $('dayReport').innerHTML=Array.from({length:7},(_,i)=>{const d=shift(data.week,i),rr=rows.filter(r=>r.date===d),cc=counts(rr);return `<tr><td>${esc(fmt(d))}</td>${rr.length?`<td class="green">${cc.Completed}</td><td class="red">${cc.Missed}</td><td>${cc.Pending+cc.Upcoming}</td>`:'<td colspan="3" class="muted">Not tracked</td>'}</tr>`;}).join('')+`<tr><td>Total</td><td class="green">${c.Completed}</td><td class="red">${c.Missed}</td><td>${remaining}</td></tr>`;renderHistory();}
function renderAdmin(){const locked=!!data.launchLocked;$('currentStart').textContent=fmt(start);$('launchState').textContent=locked?'Official launch locked':'Setup / testing controls available';$('startDate').min=today;$('startDate').value=start<today?shift(today,1):start;$('saveStart').disabled=locked;$('startDate').disabled=locked;$('clearTesting').disabled=locked||today>=start||!data.excludedCount;$('testCount').textContent=data.excludedCount+' confirmation(s) before the official start date';$('lockLaunch').disabled=locked;}
function applyResult(result){if(!['staff','admin'].includes(result.role))throw Error('Backend needs the V3 update. Please deploy the supplied Code.gs first.');data=result;role=result.role;today=result.clock.date;start=result.trackingStart;$('connection').textContent=role==='admin'?'Administrator':'Staff connected';$('adminTab').hidden=role!=='admin';}
async function load(silent=false){if(busy)return;busy=true;const token=epoch;try{const result=await api(view,view==='week'?{week}:{});if(token!==epoch)return;applyResult(result);if(view==='today')renderToday();else if(view==='week')renderWeek();else renderAdmin();if(!silent)notice(today<start?'Tracking starts '+fmt(start)+'. No earlier surveys count.':'');return true;}catch(e){if(token===epoch){notice(e.message+' — Refresh to check the latest saved status.',true);if(view==='today')document.querySelectorAll('.confirm').forEach(b=>b.disabled=true);}}finally{busy=false;}}
function askConfirm(b){
 if(busy||!data||view!=='today')return;
 const row=data.rows.find(r=>r.window===b.dataset.window&&r.station===b.dataset.station&&r.status==='Pending');
 if(!row)return;
 selectedSurvey={date:row.date,window:row.window,station:row.station,acknowledged:true};
 $('dialogStation').textContent=row.station;
 $('dialogWindow').textContent=fmt(row.date)+' · '+row.label+' PT';
 $('dialogGrades').replaceChildren(...row.grades.map(g=>{const li=document.createElement('li');li.textContent=g;return li}));
 $('confirmDialog').showModal();
}
$('cancelConfirm').onclick=()=>$('confirmDialog').close();
$('confirmDialog').addEventListener('close',()=>{selectedSurvey=null;});
$('acceptConfirm').onclick=()=>{
 if(busy||!selectedSurvey)return;
 const request={...selectedSurvey};$('confirmDialog').close();confirmRow(request);
};
async function confirmRow(request){
 if(busy)return;busy=true;const token=epoch;
 document.querySelectorAll('.confirm').forEach(x=>{x.disabled=true;if(x.dataset.window===request.window&&x.dataset.station===request.station)x.textContent='Saving…'});
 let error='',already=false;
 try{const result=await api('confirm',request);already=!!result.already;}catch(e){error=e.message;}
 finally{busy=false;if(token===epoch){const refreshed=await load(true);if(error)notice(error+' — Check the refreshed status before retrying.',true);else if(refreshed)notice(already?'Survey was already completed. Record unchanged.':'Survey confirmed. Permanently locked.');else notice('Confirmation saved, but the dashboard could not refresh. Use Refresh to check the record.',true);}}
}
function showView(v){view=v;epoch++;for(const name of ['today','week','admin']){$(name+'View').hidden=name!==v;$(name+'Tab').classList.toggle('active',name===v);}}
function setView(v){if(busy||v==='admin'&&role!=='admin')return;showView(v);if(v==='week'){reportFilter='Missed';if(!week||week<firstWeek()||week>monday(today))week=monday(today);$('export').disabled=true;}load();}
async function enter(){if(busy)return;busy=true;const loginButton=$('loginForm').querySelector('button');loginButton.disabled=true;try{const result=await api('today');applyResult(result);week=monday(today);$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;showView('today');renderToday();notice(today<start?'Tracking starts '+fmt(start)+'. No earlier surveys count.':'');}catch(e){$('setupHint').textContent=e.message;code='';}finally{busy=false;loginButton.disabled=false;}}
$('loginForm').onsubmit=e=>{e.preventDefault();code=$('code').value;enter();};
$('logout').onclick=()=>{if(busy)return;epoch++;code='';role='';data=null;week='';$('code').value='';$('slots').innerHTML='';$('history').innerHTML='';$('dashboard').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('adminTab').hidden=true;$('connection').textContent='Not connected';$('setupHint').textContent='Access code is required on each new browser session.';};
$('todayTab').onclick=()=>setView('today');$('weekTab').onclick=()=>setView('week');$('adminTab').onclick=()=>setView('admin');$('refresh').onclick=()=>load();$('weekStats').onclick=e=>{const button=e.target.closest('button[data-filter]');if(!button||busy||!data||data.week!==week)return;reportFilter=button.dataset.filter;renderHistory();};
function pick(w){if(busy||w<firstWeek()||w>monday(today))return;week=w;$('export').disabled=true;load();}$('prev').onclick=()=>pick(shift(week,-7));$('next').onclick=()=>pick(shift(week,7));$('current').onclick=()=>pick(monday(today));$('weekDate').onchange=()=>{if($('weekDate').value)pick(monday($('weekDate').value))};
$('export').onclick=()=>{if(busy||view!=='week'||!data||data.week!==week||!data.rows.length)return;const csv=[['Date','Window','Station','Fuel grades','Status','Confirmed UTC'],...data.rows.map(r=>[r.date,r.label,r.station,r.grades.join(', '),r.status,r.confirmed||''])].map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`surveys-${data.week}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function askAdmin(action,args,title,text){if(busy||role!=='admin'||!data||data.launchLocked)return;adminRequest={action,args:{...args,acknowledged:true}};$('adminDialogTitle').textContent=title;$('adminDialogText').textContent=text;$('adminDialog').showModal();}
$('saveStart').onclick=()=>{const date=$('startDate').value;if(!date||date<today){notice('Choose today or a future date.',true);return;}askAdmin('setStart',{start:date},'Set official start date?','All dates before '+date+' will be excluded from reports. Existing confirmations will remain in the spreadsheet unless you separately archive the testing data.');};
$('clearTesting').onclick=()=>askAdmin('clearTesting',{},'Clear testing confirmations?','Only records dated before the official start date will be archived to a backup tab, then removed from Confirmations. This cannot be undone in the app.');
$('lockLaunch').onclick=()=>askAdmin('lockLaunch',{},'Lock the official launch?','This permanently disables start-date changes and testing resets through the app. Make sure the launch date is correct.');
$('cancelAdmin').onclick=()=>$('adminDialog').close();$('adminDialog').addEventListener('close',()=>{adminRequest=null;});
$('acceptAdmin').onclick=async()=>{if(busy||!adminRequest)return;const request=adminRequest; $('adminDialog').close();busy=true;let result,error;try{result=await api(request.action,request.args);}catch(e){error=e.message;}finally{busy=false;}const refreshed=await load(true);if(error)notice(error,true);else if(!refreshed)notice('Change saved. Refresh to verify.',true);else notice(request.action==='clearTesting'?`${result.cleared} testing record(s) archived${result.backup?' to '+result.backup:''}.`:request.action==='lockLaunch'?'Official launch locked.':'Tracking start date updated.');};
$('setupHint').textContent=window.SURVEY_API?'Access code is required on each new browser session.':'Google Sheets is not configured. Follow the setup guide.';
function autoRefresh(){if(!$('dashboard').hidden&&view!=='admin'&&!$('confirmDialog').open&&!$('adminDialog').open&&document.visibilityState==='visible')load(true);}
setInterval(autoRefresh,30000);document.addEventListener('visibilitychange',autoRefresh);
