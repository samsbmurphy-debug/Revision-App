/* Revision Flow — v0.1. No external JS frameworks or paid APIs. */
(() => {
'use strict';
const KEY = 'revision-flow-v1';
const PALETTE = ['#5369ee','#16a884','#e3a04e','#956af1','#e76f87','#3795d8','#d28e4c','#6b83a7','#c66abd','#6a9c78','#266a91'];
const STARTER_NAMES = ['Maths','Further Maths','English Language','English Literature','Biology','Chemistry','Physics','Combined Science','Geography','History','Spanish','French','Mandarin','Computer Science','Religious Studies','Business Studies','Economics','Art','Music','Drama','Physical Education'];
const $ = q => document.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pad = n => String(n).padStart(2, '0');
const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate()+n); return dateStr(d); };
const prettyDate = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const prettyWeekday = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB',{weekday:'long'});
const today = () => dateStr();
const minsText = n => n >= 60 ? `${Math.floor(n/60)}h${n%60 ? ` ${n%60}m` : ''}` : `${n}m`;
const defaultData = () => ({ version:1, subjects:[], publishedPlanEnabled:false, topics:[], sessions:[], activity:[], settings:{dailyGoal:90,reminderInterval:10,reminderEnabled:false,quietStart:21,quietEnd:7} });
// Previously saved published timetables remain local; new visitors do not receive them.
function inferPublishedPlanEnabled(obj){return typeof obj.publishedPlanEnabled==='boolean'?obj.publishedPlanEnabled:obj.sessions.some(s=>typeof s.planKey==='string'&&s.planKey.startsWith('christmas-2026:'));}
function load(){try{const raw=localStorage.getItem(KEY);if(!raw)return defaultData();const obj=JSON.parse(raw);if(!obj||!Array.isArray(obj.subjects)||!Array.isArray(obj.sessions)||!Array.isArray(obj.topics))return defaultData();const base=defaultData();return {...base,...obj,publishedPlanEnabled:inferPublishedPlanEnabled(obj),activity:Array.isArray(obj.activity)?obj.activity:[],settings:{...base.settings,...obj.settings}};}catch{return defaultData();}}
let data = load(), view='dashboard', weekShift=0, topicFilter='all', reviewFilter='all', focusId=null, alertId=null, toastTimeout=0;
function save(){ try{localStorage.setItem(KEY,JSON.stringify(data));}catch{toast('Storage is full or unavailable. Export a backup from Settings.');}}
/* Merge the published timetable into existing browser data without erasing
   personally created or edited sessions. Removing a published slot stays removed. */
function mergePublishedPlan(){
  if(!data.publishedPlanEnabled)return;
  const plan=window.REVISION_FLOW_DECEMBER_PLAN_2026;
  if(!Array.isArray(plan))return;
  // Retire a previously published slot when the user corrects its time.
  const legacyKey='christmas-2026:2026-11-17:20:40';
  const newSession=plan.find(s=>s.date==='2026-11-17'&&s.subject==='Biology'&&s.time==='20:05');
  const legacy=data.sessions.find(s=>s.planKey===legacyKey&&s.status==='planned'&&s.title==='Cell biology: organelles, microscopy and transport — active recall');
  if(newSession&&legacy){
    if(data.sessions.some(s=>s!==legacy&&s.date===newSession.date&&s.time===newSession.time)){
      data.sessions=data.sessions.filter(s=>s!==legacy);
    }else{
      legacy.time=newSession.time;legacy.duration=newSession.duration;
      legacy.planKey='christmas-2026:'+newSession.date+':'+newSession.time;
    }
    save();
  }
  if(!Array.isArray(data.skippedPlanKeys))data.skippedPlanKeys=[];
  // Nov 18 catch-up: the untouched, missed Spanish and Chemistry slots were
  // incorporated into Nov 20 and Nov 21 sessions so no extra late-night study is needed.
  // Completed, active or manually edited local work is always preserved.
  if(!data.nov18CatchupMigration2026){
    const missed=[
      {key:'christmas-2026:2026-11-18:19:20',title:'Present, preterite and imperfect: narrating experiences'},
      {key:'christmas-2026:2026-11-18:20:40',title:'Atomic structure, electron arrangement and periodic trends'}
    ];
    for(const m of missed){
      const existing=data.sessions.find(s=>s.planKey===m.key);
      if(existing&&existing.status==='planned'&&existing.title===m.title){
        data.sessions=data.sessions.filter(s=>s!==existing);
      }
      if(!data.skippedPlanKeys.includes(m.key))data.skippedPlanKeys.push(m.key);
    }
    data.nov18CatchupMigration2026=true;
    save();
  }
  // One-time migration for changed weekend rules. Only old built-in Saturday
  // slots are replaced; manually edited sessions and completed work remain.
  // Planned Sundays are cleared once, so future Sundays can be scheduled ad hoc.
  if(!data.christmasWeekendMigrationV2 && Array.isArray(window.REVISION_FLOW_PREVIOUS_WEEKENDS_2026)){
    const prior=window.REVISION_FLOW_PREVIOUS_WEEKENDS_2026;
    const isSun=p=>new Date(p.date+'T12:00:00Z').getUTCDay()===0;
    const sundays=new Set(prior.filter(isSun).map(p=>p.date));
    const sat=prior.filter(p=>!isSun(p));
    const byOldKey=new Map(sat.map(p=>['christmas-2026:'+p.date+':'+p.time,p]));
    // Preserve any intentionally skipped Saturday slot at its new time.
    const newSaturdayTimes=['15:00','16:20','17:40','19:00','20:20'];
    for(const date of new Set(sat.map(p=>p.date))){
      const originals=sat.filter(p=>p.date===date).sort(bySessionTime);
      originals.forEach((p,i)=>{
        const oldKey='christmas-2026:'+date+':'+p.time;
        const newKey='christmas-2026:'+date+':'+newSaturdayTimes[i];
        if(data.skippedPlanKeys.includes(oldKey)&&!data.skippedPlanKeys.includes(newKey))data.skippedPlanKeys.push(newKey);
      });
    }
    data.sessions=data.sessions.filter(s=>{
      if(s.status!=='planned')return true;
      if(sundays.has(s.date))return false;
      const previous=byOldKey.get(s.planKey);
      if(previous&&s.title===previous.title&&s.time===previous.time)return false;
      return true;
    });
    data.christmasWeekendMigrationV2=true;
    save();
  }
  let changed=false;
  // Update only untouched, still-planned published sessions after tutor feedback.
  // Preserve completed sessions and any titles the user edited locally.
  const previousPublishedTitles={
    'christmas-2026:2026-11-20:20:40':'Future and conditional: plans and hypothetical situations',
    'christmas-2026:2026-11-21:16:20':'Bonding, structure, properties and nanoparticles',
    'christmas-2026:2026-11-19:18:20':'Cell biology: microscopy, mitosis and transport practicals',
    'christmas-2026:2026-12-16:20:40':'Required practicals, data skills and mixed Biology questions',
    'christmas-2026:2026-11-19:20:40':'Family and friends: opinions, descriptions and characters',
    'christmas-2026:2026-11-21:17:40':'Home and local area: places, amenities and comparison',
    'christmas-2026:2026-11-23:18:20':'School: timetable, subjects, rules and routine',
    'christmas-2026:2026-11-25:20:40':'Food, health, sport and measure words',
    'christmas-2026:2026-11-27:20:40':'Free time, entertainment, hobbies and technology',
    'christmas-2026:2026-12-01:20:40':'Culture and festivals: Chinese New Year and celebrations',
    'christmas-2026:2026-12-03:20:40':'Work, ambitions, future plans and opportunities',
    // Match the previously published titles exactly so only untouched planned sessions are updated.
    'christmas-2026:2026-11-24:18:20':'Speaking photo: description, speculation and opinions',
    'christmas-2026:2026-12-11:18:20':'Listening, dictation, reading and translation skills',
    'christmas-2026:2026-12-15:19:20':'Speaking: roleplay, follow-up questions and repair phrases',
    'christmas-2026:2026-12-17:19:20':'Timed mixed practice: speaking, reading, listening and writing',
    'christmas-2026:2026-12-09:20:40':'Poetry anthology: your studied cluster, comparison themes',
    'christmas-2026:2026-12-12:19:00':'Poetry anthology: form, structure and comparative quotations',
    'christmas-2026:2026-12-18:20:40':'Timed essays: Macbeth, A Christmas Carol and set texts',
    'christmas-2026:2026-12-14:19:20':'Writing: 75-character email and 125-character blog',
    'christmas-2026:2026-12-16:19:20':'Timed translation, writing and speaking accuracy'
  };
  for(const p of plan){
    const key='christmas-2026:'+p.date+':'+(p.time||'flex');
    if(data.skippedPlanKeys.includes(key))continue;
    const existing=data.sessions.find(s=>s.planKey===key);
    if(existing){
      const previousTitle=previousPublishedTitles[key];
      if(previousTitle && existing.status==='planned' && existing.title===previousTitle && p.title!==previousTitle){
        existing.title=p.title;
        changed=true;
      }
      continue;
    }
    // Respect a user's own session if it already occupies this timetable slot.
    if(p.time&&data.sessions.some(s=>s.date===p.date&&s.time===p.time))continue;
    if(!p.time&&data.sessions.some(s=>s.date===p.date&&subject(s.subjectId).name===p.subject&&s.title===p.title))continue;
    let sub=subjectByName(p.subject);
    if(!sub){
      sub={id:uid(),name:p.subject,color:PALETTE[data.subjects.length%PALETTE.length]};
      data.subjects.push(sub);
    }
    data.sessions.push({id:uid(),planKey:key,subjectId:sub.id,topicId:'',
      title:p.title,date:p.date,time:p.time,duration:p.duration,status:'planned'});
    changed=true;
  }
  if(changed)save();
}

function toast(msg){let node=$('#toast');node.textContent=msg;node.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>node.classList.remove('visible'),3300);}
const subject = id=>data.subjects.find(x=>x.id===id)||{name:'Other',color:'#7b89a5'};
const subjectByName = name=>data.subjects.find(x=>x.name.toLowerCase()===String(name||'').trim().toLowerCase());
const topic = id=>data.topics.find(x=>x.id===id);
const session = id=>data.sessions.find(x=>x.id===id);
const sessionDay = s => `${s.date}T${s.time || '00:00'}:00`;
const timeLabel = s => s.time || 'Flexible';
const bySessionTime = (a,b) => (a.time||'99:99').localeCompare(b.time||'99:99');
const isPast = s => s.time ? new Date(sessionDay(s)).getTime() < Date.now() : s.date < today();
const dueTopics = () => data.topics.filter(t=>!t.nextReview || t.nextReview<=today());
const doneToday = () => data.activity.filter(a=>a.type==='session'&&a.date===today()).reduce((n,a)=>n+(Number(a.minutes)||0),0);
const doneWeek = () => data.activity.filter(a=>a.type==='session'&&a.date>=addDays(today(),-6)&&a.date<=today()).reduce((n,a)=>n+(Number(a.minutes)||0),0);
const doneCount = () => data.sessions.filter(s=>s.status==='complete').length;
const getTodaySessions = () => data.sessions.filter(s=>s.date===today()).sort(bySessionTime);
function statCard(label,num,footer,icon){return `<div class="stat-card"><div class="stat-top"><span>${esc(label)}</span><div class="stat-symbol">${icon}</div></div><div class="stat-number">${esc(num)}</div><div class="stat-footer">${footer}</div></div>`;}
function header(eyebrow,title,desc,button=''){return `<div class="page-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${button}</div>`;}
const btn = (label,action,extra='',classes='btn') => `<button type="button" class="${classes}" data-action="${action}" ${extra}>${label}</button>`;
function pct(a,b){return b>0?Math.max(0,Math.min(100,Math.round(a/b*100))):0;}
const sDot = id => `<span class="subject-dot" style="--subject:${subject(id).color}"></span>`;
function statusBadge(s){if(s.status==='complete')return '<span class="tag complete">✓ Done</span>';if(s.status==='active')return '<span class="tag active">In progress</span>';if(isPast(s))return '<span class="tag missed">Not started</span>';return '<span class="tag">Planned</span>';}
function renderDashboard(){const ds=getTodaySessions(),done=doneToday(), goal=data.settings.dailyGoal, pctToday=pct(done,goal), due=dueTopics().slice(0,4), scheduled=ds.reduce((n,s)=>n+s.duration,0);
let rows=ds.length ? ds.map(s=>`<div class="session-row"><div class="time-col">${esc(timeLabel(s))}</div><div class="subject-stripe" style="--subject:${subject(s.subjectId).color}"></div><div class="session-body"><strong>${esc(s.title||topic(s.topicId)?.name||subject(s.subjectId).name)}</strong><small>${esc(subject(s.subjectId).name)} · ${s.duration} minutes</small></div><div class="session-actions">${s.status==='complete'?statusBadge(s):btn(s.status==='active'?'Resume':'Start','start-session',`data-id="${s.id}"`,'btn small ghost')}${btn('•••','edit-session',`data-id="${s.id}"`,'btn small secondary')}</div></div>`).join('') : empty('▦','Your day is yours to plan','Add a revision session to start building a consistent routine.',btn('+ Add a session','add-session','','btn small'));
let dueHtml=due.length?due.map(t=>`<div class="due-item">${sDot(t.subjectId)}<div class="due-item-text"><strong>${esc(t.name)}</strong><small>${esc(subject(t.subjectId).name)} · ${t.reviewCount||0} previous reviews</small></div>${btn('Review','review-topic',`data-id="${t.id}"`,'btn small ghost')}</div>`).join(''):`<div class="empty"><div class="empty-symbol">◎</div><strong>No reviews due</strong><p>Add topics to make spaced repetition part of your study routine.</p>${btn('+ Add topic','add-topic','','btn small secondary')}</div>`;
return header('THE BIG PICTURE',`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}.`,'A little progress, consistently made, adds up.',btn('+ Plan a session','add-session'))+
(data.subjects.length===0?`<section class='panel' style='margin-bottom:18px;padding:20px'><h2>Make this timetable yours</h2><p class='mini-text'>Choose your subjects and build a personalised revision plan. Your sessions and progress are saved in this browser, separate from other people's devices.</p>${btn('Choose my subjects','setup-subjects')}</section>`:'')+
`<section class="stats-grid" aria-label="Today at a glance">${statCard('Time revised today',minsText(done),`of ${goal}m daily goal`,'◷')}${statCard('Sessions today',ds.length,`${ds.filter(x=>x.status==='complete').length} completed · ${minsText(scheduled)} planned`,'▦')}${statCard('Topics due',dueTopics().length,'Ready for active recall','◎')}${statCard('This week',minsText(doneWeek()),`${doneCount()} sessions completed overall`,'↗')}</section>
<div class="dashboard-grid"><div class="stack"><section class="panel"><div class="panel-header"><div><h2>Today's schedule</h2><div class="panel-subtitle">${prettyWeekday(today())}, ${prettyDate(today())}</div></div><button class="text-action" data-view="timetable">See timetable →</button></div>${rows}</section><section class="panel"><div class="panel-header"><div><h2>Topics to revisit</h2><div class="panel-subtitle">Recall first, then check your understanding</div></div><button class="text-action" data-view="topics">All topics →</button></div>${dueHtml}</section></div>
<div class="stack"><section class="panel"><div class="panel-header"><div><h2>Daily goal</h2><div class="panel-subtitle">Focus on learning, not just the clock</div></div><div class="ring" data-label="${pctToday}%" style="--progress:${pctToday}%"></div></div><div class="progress-head"><strong>${minsText(done)}</strong><span>/ ${minsText(goal)} goal</span></div><div class="progress-track"><div class="progress-bar" style="width:${pctToday}%"></div></div><div class="mini-text">${done>=goal?'You reached your target. Nice work.':`${Math.max(0,goal-done)} minutes to reach your target. You can adjust it any time.`}</div></section><section class="panel"><div class="panel-header"><div><h2>Start with ChatGPT</h2><div class="panel-subtitle">Practise, get feedback, repeat</div></div><span class="stat-symbol">✳</span></div><p class="mini-text" style="margin-top:0">Ask for exam-style questions one at a time. After each answer, get feedback and target your next weakness.</p>${btn('Open ChatGPT ↗','open-general-chat','','btn wide')}<div class="priority-strip">✦ Tip: Explain an answer from memory before looking at the solution.</div></section><section class="panel"><div class="panel-header"><h2>Your data</h2><span class="tag">Device-only</span></div><p class="mini-text">This first version saves progress in this browser. Open <strong>ChatGPT bridge</strong> to apply structured changes without editing the website. Automatic cloud syncing comes next.</p>${btn('Explore AI updates','go-bridge','','btn small secondary')}</section></div></div>`;}
function empty(icon,title,body,action=''){return `<div class="empty"><div class="empty-symbol">${icon}</div><strong>${esc(title)}</strong><p>${esc(body)}</p>${action}</div>`;}
function weekDates(){const d=new Date(`${today()}T12:00:00`);const offset=(d.getDay()+6)%7;d.setDate(d.getDate()-offset+weekShift*7);return Array.from({length:7},(_,i)=>{const next=new Date(d);next.setDate(d.getDate()+i);return dateStr(next);});}
function renderTimetable(){const dates=weekDates(),start=dates[0],end=dates[6];return header('STRUCTURE CREATES FREEDOM','Your revision timetable','Plan realistic sessions, move them when needed, and keep momentum.',btn('+ New session','add-session'))+
(data.publishedPlanEnabled?`<div class="secondary-panel" style="margin:0 0 18px;padding:14px 18px"><strong>Timetable updated · Economics & Investing</strong><p>Mon/Tue/Thu/Fri: flexible 1 hour; Wednesday: none; Saturday and Sunday: flexible 2 hours each. GCSE sessions stay in place. Tap a flexible session → Edit to choose a start time, or Start now. Mandarin speaking is provisionally expected on 4 December; scheduled Mandarin sessions before then now focus on speaking, not word recap.</p></div>`:'')+
`<section class="panel"><div class="panel-header" style="align-items:center"><div><h2>Weekly planner</h2><div class="panel-subtitle">Tap any session to start, edit or complete it</div></div><div class="week-tools"><button class="btn small secondary" data-action="prev-week" aria-label="Previous week">←</button><span class="week-label">${prettyDate(start)} – ${prettyDate(end)}</span><button class="btn small secondary" data-action="next-week" aria-label="Next week">→</button><button class="btn small ghost" data-action="current-week">Today</button></div></div><div class="week-grid">${dates.map(date=>{const ss=data.sessions.filter(s=>s.date===date).sort(bySessionTime);const d=new Date(`${date}T12:00:00`);return `<div class="day-card ${date===today()?'today':''}"><div class="day-head"><span>${d.toLocaleDateString('en-GB',{weekday:'short'})}</span><strong>${d.getDate()}</strong></div>${ss.map(s=>`<button class="week-session" style="--subject:${subject(s.subjectId).color}" data-action="session-options" data-id="${s.id}"><strong>${esc(subject(s.subjectId).name)}</strong><small>${esc(timeLabel(s))} · ${s.duration}m ${s.status==='complete'?'✓':''}</small></button>`).join('')}<button class="day-add" data-action="add-session" data-date="${date}" aria-label="Add revision on ${date}">+</button></div>`;}).join('')}</div></section><div class="secondary-panel"><strong style="font-size:12px">A timetable you can recover from</strong><p>Missed sessions aren't automatically marked as complete. Move them to another day or delete them; your progress figures only count revision you actually finish.</p></div>`;}
function renderTopics(){let ts=data.topics.filter(t=>(topicFilter==='all'||t.subjectId===topicFilter)&&(reviewFilter!=='due'||!t.nextReview||t.nextReview<=today())).sort((a,b)=>(a.nextReview||'').localeCompare(b.nextReview||''));let chips=`<button class="chip ${topicFilter==='all'?'selected':''}" data-action="filter-subject" data-id="all">All subjects</button>`+data.subjects.map(s=>`<button class="chip ${topicFilter===s.id?'selected':''}" data-action="filter-subject" data-id="${s.id}">${esc(s.name)}</button>`).join('');return header('LEARN IT. KEEP IT.','Topic mastery','Track what you know and schedule the right topics for recall.',btn('+ Add topic','add-topic'))+
`<div class="filterbar">${chips}</div><div class="panel" style="margin-bottom:22px"><div class="panel-header"><div><h2>Topic library</h2><div class="panel-subtitle">${data.topics.length} total topics · ${dueTopics().length} due for review</div></div><div class="btn-row"><button class="chip ${reviewFilter==='all'?'selected':''}" data-action="filter-review" data-id="all">All</button><button class="chip ${reviewFilter==='due'?'selected':''}" data-action="filter-review" data-id="due">Due now</button></div></div><div class="topic-list">${ts.length?ts.map(t=>`<div class="topic-card">${sDot(t.subjectId)}<div class="topic-info"><strong>${esc(t.name)}</strong><small>${esc(subject(t.subjectId).name)} · ${t.reviewCount||0} reviews</small></div><div class="confidence" title="Confidence: ${t.confidence||0} of 5">${Array.from({length:5},(_,i)=>`<span class="${i<(t.confidence||0)?'filled':''}"></span>`).join('')}</div><div class="topic-meta"><small>Next review</small><b>${t.nextReview&&t.nextReview>today()?prettyDate(t.nextReview):'Due now'}</b></div><div class="btn-row">${btn('Review','review-topic',`data-id="${t.id}"`,'btn small ghost')}${btn('•••','edit-topic',`data-id="${t.id}"`,'btn small secondary')}</div></div>`).join(''):empty('◎','Nothing here yet','Add your first topic and review it from memory.',btn('+ Add topic','add-topic','','btn small'))}</div></div>`;}
function renderInsights(){let past=Array.from({length:7},(_,i)=>addDays(today(),i-6));let daily=past.map(date=>({date,value:data.activity.filter(a=>a.type==='session'&&a.date===date).reduce((n,a)=>n+(a.minutes||0),0)}));let max=Math.max(data.settings.dailyGoal,...daily.map(d=>d.value),1);let bars=daily.map(x=>`<div class="bar-group"><div class="bar-value">${x.value?x.value+'m':''}</div><div class="bar" style="height:${Math.max(2,x.value/max*148)}px"></div><div class="bar-label">${new Date(`${x.date}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short'})}</div></div>`).join('');let completed=data.sessions.filter(s=>s.status==='complete');let total=completed.reduce((n,s)=>n+s.duration,0);let averages=data.subjects.map(s=>({name:s.name,time:completed.filter(x=>x.subjectId===s.id).reduce((n,x)=>n+x.duration,0)})).filter(x=>x.time>0).sort((a,b)=>b.time-a.time);let maxBySubject=Math.max(1,...averages.map(x=>x.time));return header('YOUR EFFORT, MADE VISIBLE','Progress & insights','Measure completion and topic recall rather than relying on guesswork.')+`<div class="stats-grid">${statCard('Total completed',minsText(total),'Across all your sessions','◷')}${statCard('Sessions finished',completed.length,'Recorded revision sessions','✓')}${statCard('Topics tracked',data.topics.length,'In your topic library','◎')}${statCard('Due for recall',dueTopics().length,'Your next reviews','↻')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Revision over the last 7 days</h2><div class="panel-subtitle">Minutes completed per day</div></div></div><div class="chart">${bars}</div></section><section class="panel"><div class="panel-header"><div><h2>Time by subject</h2><div class="panel-subtitle">Your completed revision distribution</div></div></div><div class="subject-performance">${averages.length?averages.map(x=>`<div class="subject-performance-row"><b>${esc(x.name)}</b><div class="progress-track"><div class="progress-bar" style="width:${pct(x.time,maxBySubject)}%"></div></div><small>${minsText(x.time)}</small></div>`).join(''):empty('▥','No data yet','Complete a session to see which subjects you are revising.')}</div></section></div><div class="secondary-panel"><strong style="font-size:12px">A useful measurement</strong><p>Time spent studying is only one indicator. Use topic review ratings to check whether you can actually recall the material later.</p></div>`;}
const EXAMPLE = JSON.stringify({ops:[{type:'add_session',subject:'Spanish',topic:'Imperfect subjunctive',date:today(),time:'17:00',duration:45},{type:'add_topic',subject:'Chemistry',name:'Electrolysis',confidence:1}]},null,2);
const INSTRUCTION = `When I ask you to change my Revision Flow revision app, return a SINGLE valid JSON object in a fenced json code block, following this specification. Only use subjects already in my app or add them first. Structure: {"ops":[...]}. Supported operations:\n- {"type":"add_session","subject":"Spanish","topic":"Imperfect subjunctive","date":"YYYY-MM-DD","time":"17:00","duration":45}\n- {"type":"add_topic","subject":"Chemistry","name":"Electrolysis","confidence":1}\n- {"type":"update_topic","subject":"Chemistry","name":"Electrolysis","confidence":3,"nextReview":"YYYY-MM-DD"}\n- {"type":"add_subject","name":"Computer Science"}\n- {"type":"complete_session","id":"EXACT_SESSION_ID"}\nUse concrete local dates, in Europe/London time, and durations in minutes. Never overwrite unrelated data. If dates or times are unspecified, ask me. This is an import format; it does not mean ChatGPT has directly updated my app. My existing subjects are: ${data.subjects.map(s=>s.name).join(', ')}.`;
function renderBridge(){return header('AI + YOUR TIMETABLE','ChatGPT bridge','Apply changes from a conversation without editing or redeploying the website.')+`<section class="panel"><div class="panel-header"><div><h2>Send changes from ChatGPT</h2><div class="panel-subtitle">A working manual bridge — automatic cloud synchronisation is not set up yet</div></div><span class="tag">Local v1</span></div><div class="bridge-steps"><div class="bridge-step"><b>STEP 01</b><strong>Describe a change</strong><p>Tell ChatGPT what you learnt or what to schedule.</p></div><div class="bridge-step"><b>STEP 02</b><strong>Get an update</strong><p>Ask ChatGPT to return Revision Flow JSON. Use the instruction below.</p></div><div class="bridge-step"><b>STEP 03</b><strong>Paste and apply</strong><p>The app updates its saved revision data — not its code.</p></div></div><div class="btn-row">${btn('Copy AI instructions','copy-bridge','','btn secondary small')}${btn('Open ChatGPT ↗','open-general-chat','','btn small')}</div><div class="divider"></div><div class="form-grid"><div class="field full"><label for="bridge-input">Paste your JSON update here</label><textarea id="bridge-input" spellcheck="false" placeholder='{"ops":[{"type":"add_session", ...}]}'></textarea><small>Only supported revision operations are accepted. No code is executed.</small></div></div><div class="btn-row" style="margin-top:14px">${btn('Apply changes','apply-bridge')}${btn('Show example','bridge-example','','btn secondary')}</div><details style="margin-top:22px"><summary style="cursor:pointer;font-size:12px;color:#6170b6;font-weight:700">See an example update</summary><pre class="code-sample">${esc(EXAMPLE)}</pre></details></section><div class="secondary-panel"><strong style="font-size:12px">The next upgrade: genuine syncing</strong><p>Right now this copy-and-paste bridge works on a single device. The planned cloud stage would link a private sheet to the app, letting ChatGPT update the sheet and your devices refresh automatically. It will require configuring access safely; we won't make your revision records publicly editable.</p></div>`;}
function renderSettings(){return header('YOUR SYSTEM, YOUR RULES','Settings','Personalise your goals, notifications and revision data.')+
`<div class="dashboard-grid"><div class="stack"><section class="panel"><div class="panel-header"><div><h2>Revision preferences</h2><div class="panel-subtitle">Settings apply on this device</div></div></div><div class="settings-row"><div><strong>Daily revision goal</strong><small>Set a sustainable target in minutes; it's not a minimum requirement.</small></div><input type="number" min="10" max="480" step="5" data-setting="dailyGoal" value="${data.settings.dailyGoal}" aria-label="Daily goal in minutes"></div><div class="settings-row"><div><strong>In-app reminders</strong><small>Repeat reminders for planned sessions while this page is running. You can snooze or dismiss them.</small></div><input type="checkbox" data-setting="reminderEnabled" ${data.settings.reminderEnabled?'checked':''} aria-label="Enable in-app reminders"></div><div class="settings-row"><div><strong>Reminder repeat interval</strong><small>Only repeats until the session is started, dismissed or snoozed.</small></div><select data-setting="reminderInterval" aria-label="Reminder repeat interval">${[5,10,15,30].map(n=>`<option value="${n}" ${data.settings.reminderInterval===n?'selected':''}>${n} min</option>`).join('')}</select></div><div class="settings-row"><div><strong>Quiet hours</strong><small>In-app reminders will be silent during this window.</small></div><div class="inline-input"><select data-setting="quietStart" aria-label="Quiet hours start">${Array.from({length:24},(_,n)=>`<option value="${n}" ${data.settings.quietStart===n?'selected':''}>${pad(n)}:00</option>`).join('')}</select><span>–</span><select data-setting="quietEnd" aria-label="Quiet hours end">${Array.from({length:24},(_,n)=>`<option value="${n}" ${data.settings.quietEnd===n?'selected':''}>${pad(n)}:00</option>`).join('')}</select></div></div><div class="settings-row"><div><strong>Desktop notification permission</strong><small>Browsers may show notifications while the app is running. Background phone push is not available in this version.</small></div>${btn('Request permission','enable-notifications','','btn small secondary')}</div></section><section class="panel"><div class="panel-header"><div><h2>Your subjects</h2><div class="panel-subtitle">Change the subjects available when planning</div></div>${btn('+ Add','add-subject','','btn small secondary')}</div><div class="subject-list">${data.subjects.map(s=>`<span class="subject-pill"><span style="color:${s.color}">●</span> ${esc(s.name)} <button title="Remove subject" data-action="delete-subject" data-id="${s.id}">×</button></span>`).join('')}</div></section></div><div class="stack"><section class="panel"><div class="panel-header"><div><h2>Export to your calendar</h2><div class="panel-subtitle">Google Calendar and Apple Calendar</div></div><p class="mini-text">Download your whole timetable as an .ics calendar file. Apple Calendar can open the file; for Google Calendar, download it first, then open Import & export and select the .ics file.</p><div class="btn-row">${btn("Download whole timetable (.ics)","export-calendar","","btn small")}${btn("Open Google Calendar import ↗","google-calendar-import","","btn small secondary")}</div><p class="mini-text">For one session, open its timetable card and choose Google Calendar or Apple Calendar. Imports are one-time copies, not automatic two-way sync; importing again may create duplicates. Flexible sessions are exported as all-day reminders.</p></section><section class="panel"><div class="panel-header"><div><h2>Backups & portability</h2><div class="panel-subtitle">Keep your work safe</div></div><p class="mini-text">Each browser has a separate workspace. Your revision data stays in this browser, not in other visitors' browsers. Export it regularly, especially before clearing browsing data. You can manually transfer the backup to your other device.</p><div class="btn-row">${btn('Download backup','export-data','','btn small')}${btn('Merge backup','merge-data','','btn small secondary')}${btn('Replace with backup','import-data','','btn small ghost')}</div><p class="mini-text">Merge adds missing sessions, subjects and topics from another Revision Flow browser without replacing your current timetable. Replace overwrites everything on this device. Neither option syncs changes automatically.</p><input type="file" id="backup-file" hidden accept=".json,application/json"><input type="file" id="merge-file" hidden accept=".json,application/json"></section><section class="panel"><div class="panel-header"><div><h2>Install the app</h2><div class="panel-subtitle">Use one website on PC and phone</div></div><div class="callout"><h3>On iPhone</h3><p>After hosting this website over HTTPS: open it in Safari → Share → Add to Home Screen.</p></div><div class="callout" style="margin-top:10px"><h3>On Windows</h3><p>Open the hosted site in Chrome or Edge → select Install app in the address bar or browser menu.</p></div></section><section class="panel"><div class="panel-header"><h2>Privacy & limitations</h2></div><p class="mini-text">No accounts, tracking, analytics, external AI API or paid services are required for this version. Google Fonts are loaded online when available. No automatic cross-device sync or background push notifications are connected yet.</p><div class="notice blue">New visitors start with a blank timetable. Your phone and PC still have separate data until a secure account and cloud-sync system is added.</div></section></div></div>`;}
const titles={dashboard:'Overview',timetable:'Timetable',topics:'Topic mastery',insights:'Insights',bridge:'ChatGPT bridge',settings:'Settings'};
const renders={dashboard:renderDashboard,timetable:renderTimetable,topics:renderTopics,insights:renderInsights,bridge:renderBridge,settings:renderSettings};
function navigate(target){if(!renders[target])return;view=target;render();window.scrollTo({top:0,behavior:'instant'});}
function render(){document.title=`${titles[view]} · Revision Flow`;
$('#breadcrumb-page').textContent=titles[view];document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));$('#app-main').innerHTML=renders[view]();}
function modal(inner,wide=false){$('#modal-root').innerHTML=`<div class="modal-scrim"><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true">${inner}</div></div>`;const first=$('#modal-root input, #modal-root select, #modal-root textarea');if(first)first.focus();}
function closeModal(){alertId=null;$('#modal-root').innerHTML='';}
function modalHead(title,desc=''){return `<div class="modal-header"><div><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div><button class="close-btn" data-action="close-modal" aria-label="Close dialog">×</button></div>`;}
function subjectOptions(current){return data.subjects.map(s=>`<option value="${s.id}" ${current===s.id?'selected':''}>${esc(s.name)}</option>`).join('');}
function openSessionModal(existing=null,prefDate=null){if(data.subjects.length===0){toast('Add a subject first.');navigate('settings');return;}let s=existing||{date:prefDate||today(),time:`${pad(Math.min(23,new Date().getHours()+1))}:00`,duration:45,subjectId:data.subjects[0].id,title:'',topicId:''};modal(`${modalHead(existing?'Edit session':'Plan a revision session','Choose a fixed start time or leave it blank to study whenever suits you that day.')}<form id="session-form"><input type="hidden" name="id" value="${esc(existing?.id||'')}"><div class="form-grid"><div class="field"><label for="session-subject">Subject</label><select id="session-subject" name="subjectId" required>${subjectOptions(s.subjectId)}</select></div><div class="field"><label for="session-duration">Duration</label><select name="duration" id="session-duration">${[15,25,30,45,60,90,120].map(n=>`<option value="${n}" ${s.duration===n?'selected':''}>${n} minutes</option>`).join('')}</select></div><div class="field"><label for="session-date">Date</label><input id="session-date" type="date" name="date" required value="${esc(s.date)}"></div><div class="field"><label for="session-time">Start time (optional)</label><input id="session-time" type="time" name="time" value="${esc(s.time||'')}"><small>Leave blank for a flexible session; pick a time later.</small></div><div class="field full"><label for="session-title">Focus (optional)</label><input id="session-title" name="title" maxlength="100" value="${esc(s.title||'')}" placeholder="e.g. Imperfect subjunctive practice"></div><div class="field full"><label for="session-topic">Linked topic (optional)</label><select id="session-topic" name="topicId">${topicOptions(s.subjectId,s.topicId)}</select></div></div><div class="modal-actions">${existing?btn('Delete','delete-session',`data-id="${s.id}"`,'btn danger'):''}<button type="button" class="btn secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn">${existing?'Save changes':'Add session'}</button></div></form>`);}
function topicOptions(subId,selected){return `<option value="">No linked topic</option>`+data.topics.filter(t=>t.subjectId===subId).map(t=>`<option value="${t.id}" ${selected===t.id?'selected':''}>${esc(t.name)}</option>`).join('');}
function openTopicModal(existing=null){if(data.subjects.length===0){toast('Add a subject first.');navigate('settings');return;}modal(`${modalHead(existing?'Edit topic':'Add a topic','The next recall date adjusts as you review.')}<form id="topic-form"><input type="hidden" name="id" value="${esc(existing?.id||'')}"><div class="form-grid"><div class="field full"><label for="topic-name">Topic name</label><input id="topic-name" name="name" maxlength="100" required value="${esc(existing?.name||'')}" placeholder="e.g. Electrolysis"></div><div class="field"><label for="topic-subject">Subject</label><select name="subjectId" id="topic-subject">${subjectOptions(existing?.subjectId||data.subjects[0].id)}</select></div><div class="field"><label for="topic-confidence">Confidence</label><select id="topic-confidence" name="confidence">${Array.from({length:6},(_,n)=>`<option value="${n}" ${Number(existing?.confidence||0)===n?'selected':''}>${n} / 5</option>`).join('')}</select></div><div class="field full"><label for="topic-next-review">Next review</label><input id="topic-next-review" type="date" name="nextReview" value="${esc(existing?.nextReview||today())}"></div></div><div class="modal-actions">${existing?btn('Delete','delete-topic',`data-id="${existing.id}"`,'btn danger'):''}<button type="button" class="btn secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn">${existing?'Save topic':'Add topic'}</button></div></form>`);}
function openSetupModal(){
 const choices=STARTER_NAMES.map(name=>`<label style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:14px"><input type="checkbox" name="subjectNames" value="${esc(name)}">${esc(name)}</label>`).join('');
 modal(`${modalHead('Choose your subjects','Create your own timetable. You can add or remove subjects later in Settings.')}<form id="setup-form"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:0 16px;max-height:340px;overflow:auto">${choices}</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn">Create my workspace</button></div></form>`,true);
}
function openSubjectModal(){modal(`${modalHead('Add a subject','Choose a subject you want to track.')}<form id="subject-form"><div class="field"><label for="new-subject">Subject name</label><input id="new-subject" name="name" maxlength="60" placeholder="e.g. Computer Science" required></div><div class="modal-actions"><button class="btn secondary" type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn">Add subject</button></div></form>`);}
function askReview(id){const t=topic(id);if(!t)return;modal(`${modalHead('How well did you recall it?',`${subject(t.subjectId).name} · ${t.name}`)}<div class="notice blue">Try answering questions from memory <strong>before</strong> selecting a rating. Your next review date will update.</div><div class="rating-grid" style="margin-top:19px"><button class="rating-choice" data-action="rate-topic" data-id="${id}" data-rating="1">Again<small>Forgot it</small></button><button class="rating-choice" data-action="rate-topic" data-id="${id}" data-rating="2">Hard<small>Some gaps</small></button><button class="rating-choice" data-action="rate-topic" data-id="${id}" data-rating="3">Good<small>Mostly recalled</small></button><button class="rating-choice" data-action="rate-topic" data-id="${id}" data-rating="4">Easy<small>Confident</small></button></div><div class="modal-actions">${btn('Practice with ChatGPT ↗','open-topic-chat',`data-id="${id}"`,'btn secondary')}</div>`);}
function reviewTopic(id,rating){const t=topic(id);if(!t)return;let streak=Number(t.streak||0);if(rating===1)streak=0;else if(rating===2)streak=Math.max(0,streak-1);else streak=Math.min(5,streak+(rating===4?2:1));let intervals=[1,3,7,14,30,60];t.streak=streak;t.reviewCount=(t.reviewCount||0)+1;t.confidence=rating===1?1:rating===2?2:rating===3?4:5;t.lastReviewed=today();t.nextReview=addDays(today(),intervals[streak]);data.activity.push({id:uid(),type:'review',date:today(),subjectId:t.subjectId,topicId:t.id,rating});save();closeModal();render();toast(`Next recall: ${prettyDate(t.nextReview)}`);}
function sessionOptions(id){const s=session(id);if(!s)return;modal(`${modalHead('Revision session',`${subject(s.subjectId).name} · ${prettyDate(s.date)} · ${timeLabel(s)}`)}<div style="font-size:14px;font-weight:700;color:#30415c;margin-bottom:15px">${esc(s.title||topic(s.topicId)?.name||'General revision')} · ${s.duration} minutes</div><div class="notice blue">${s.status==='complete'?'This session is recorded as completed.':'Choose how to manage this session.'}</div><div class="modal-actions" style="flex-wrap:wrap">${s.status!=='complete'?btn('Start now','start-session',`data-id="${id}"`):''}${s.status!=='complete'?btn('Mark complete','complete-session',`data-id="${id}"`,'btn secondary'):''}${btn('Edit','edit-session',`data-id="${id}"`,'btn secondary')}${btn('Add to Google Calendar ↗','session-calendar-google',`data-id="${id}"`,'btn secondary')}${btn('Apple Calendar (.ics)','session-calendar-apple',`data-id="${id}"`,'btn secondary')}</div>`);}
function markComplete(id){const s=session(id);if(!s||s.status==='complete')return;s.status='complete';s.completedAt=new Date().toISOString();data.activity.push({id:uid(),type:'session',date:today(),subjectId:s.subjectId,sessionId:s.id,minutes:s.duration});focusId=null;save();closeModal();render();toast('Session complete — your progress is saved.');}
function promptForSession(s){let sub=subject(s.subjectId).name,what=s.title||topic(s.topicId)?.name||'a suitable GCSE topic';
if(sub==='Economics & Investing')return `I am studying Economics & Investing to build a foundation for Cambridge Economics, not as GCSE revision. My focus today is ${what} for ${s.duration} minutes. Teach economic theory, mathematical reasoning and investment analysis, with real-world examples where appropriate. Ask active-recall questions, wait for my answers, challenge unsupported assumptions, and summarise what to revisit. Any portfolio exercises should be paper trading only.`;
return `I am revising ${sub} for GCSE. The focus is ${what}. Please tutor me through active recall: ask one exam-style question at a time, wait for my response, mark it accurately, explain any mistakes and adapt the difficulty. My planned session is ${s.duration} minutes. End by summarising my weak points and what I should revisit.`;}
function promptForTopic(t){return `Help me revise GCSE ${subject(t.subjectId).name}, specifically ${t.name}. Ask me active-recall questions one at a time. Wait for my answer before marking it. Explain errors and adapt future questions to my weak points.`;}
function openChat(prompt){try{if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(prompt).then(()=>toast('Prompt copied. Paste it into ChatGPT.')).catch(()=>toast('ChatGPT opened. Copy your prompt manually if needed.'));else toast('ChatGPT opened. Use the ChatGPT bridge for instructions.');}catch{toast('ChatGPT opened.');}window.open('https://chatgpt.com/','_blank','noopener,noreferrer');}
function focusSession(id){const s=session(id);if(!s||s.status==='complete')return;s.status='active';if(!s.startedAt)s.startedAt=new Date().toISOString();focusId=id;alertId=null;save();render();showFocus();}
function showFocus(){const s=session(focusId);if(!s){closeModal();return;}const elapsed=Math.max(0,Math.floor((Date.now()-new Date(s.startedAt).getTime())/1000));modal(`${modalHead('Study session',`${subject(s.subjectId).name} · ${s.duration} minutes planned`)}<div class="focus-screen"><div class="focus-label">TIME IN SESSION</div><div class="focus-time" id="focus-timer">${pad(Math.floor(elapsed/60))}:${pad(elapsed%60)}</div><div class="focus-name">${esc(s.title||topic(s.topicId)?.name||subject(s.subjectId).name)}</div><div class="focus-sub">${esc(subject(s.subjectId).name)} · Active recall & feedback</div><div class="focus-tip">✦ Start with a question you can't answer immediately. Your goal is understanding, not a perfect timer.</div><div class="btn-row" style="justify-content:center">${btn('Start chat with ChatGPT ↗','open-session-chat',`data-id="${s.id}"`)}${btn('Mark complete','complete-session',`data-id="${s.id}"`,'btn secondary')}</div><div style="margin-top:14px">${btn('Return to dashboard','close-modal','','btn small ghost')}</div></div>`);}
function showReminder(s){if($('#modal-root .modal-scrim'))return;alertId=s.id;const title=s.title||topic(s.topicId)?.name||subject(s.subjectId).name;modal(`${modalHead('Revision is on your timetable',`${subject(s.subjectId).name} · ${s.duration} minutes`)}<div class="notice blue"><strong>${esc(title)}</strong><br>Your session was scheduled for ${esc(s.time)}. You can start, snooze or dismiss this reminder.</div><div class="modal-actions" style="justify-content:center;flex-wrap:wrap">${btn('Start with ChatGPT ↗','reminder-start-chat',`data-id="${s.id}"`)}${btn('Snooze 10 min','snooze',`data-id="${s.id}"`,'btn secondary')}${btn('Dismiss','dismiss-reminder',`data-id="${s.id}"`,'btn ghost')}</div>`);if('Notification' in window&&Notification.permission==='granted'&&document.visibilityState==='hidden'){try{new Notification('Revision Flow: scheduled revision',{body:title,tag:'revision-flow-'+s.id,icon:'./icons/icon-192.png'});}catch{}}}
let snoozed={};let dismissed={};let lastRemind={};
function inQuietHours(){let h=new Date().getHours(),a=Number(data.settings.quietStart),b=Number(data.settings.quietEnd);return a===b?false:a<b?(h>=a&&h<b):(h>=a||h<b);}
function checkReminders(){if(!data.settings.reminderEnabled||inQuietHours()||focusId||$('#modal-root .modal-scrim'))return;let now=Date.now();const interval=Number(data.settings.reminderInterval||10)*60000;for(let s of data.sessions.filter(s=>s.status==='planned'&&s.date===today()&&s.time&&isPast(s)).sort(bySessionTime)){if(dismissed[s.id]===today()||now<(snoozed[s.id]||0)||now-(lastRemind[s.id]||0)<interval)continue;lastRemind[s.id]=now;showReminder(s);return;}}
function icsEscape(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
function icsDay(value){return String(value).replace(/-/g,'');}
function icsLocalDateTime(day,time){return icsDay(day)+'T'+time.replace(':','')+'00';}
function calendarSessionTitle(s){return subject(s.subjectId).name+(s.title?' — '+s.title:' — Revision');}
function calendarSessionDescription(s){return 'Revision Flow session. Duration: '+Number(s.duration||0)+' minutes. Status: '+String(s.status||'planned')+'.'+(!s.time?' Flexible session: choose a start time.':'');}
function sessionCalendarTimes(s){
 if(!s.time)return {allDay:true,start:icsDay(s.date),end:icsDay(addDays(s.date,1))};
 const start=new Date(s.date+'T'+s.time+':00');const end=new Date(start.getTime()+Math.max(5,Number(s.duration)||60)*60000);
 return {allDay:false,start:icsLocalDateTime(s.date,s.time),end:icsLocalDateTime(dateStr(end),pad(end.getHours())+':'+pad(end.getMinutes()))};
}
function makeCalendarFile(sessions){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Revision Flow//Personal Revision Planner//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Revision Flow'];
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 for(const s of sessions){
  const when=sessionCalendarTimes(s);
  lines.push('BEGIN:VEVENT','UID:'+String(s.id).replace(/[^a-zA-Z0-9_-]/g,'')+'@revision-flow.local','DTSTAMP:'+stamp,
    'SUMMARY:'+icsEscape(calendarSessionTitle(s)),'DESCRIPTION:'+icsEscape(calendarSessionDescription(s)));
  if(when.allDay)lines.push('DTSTART;VALUE=DATE:'+when.start,'DTEND;VALUE=DATE:'+when.end);
  else lines.push('DTSTART:'+when.start,'DTEND:'+when.end);
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n';
}
function downloadCalendar(sessions,filename){
 if(!sessions.length){toast('Add a revision session before exporting.');return;}
 const url=URL.createObjectURL(new Blob([makeCalendarFile(sessions)],{type:'text/calendar;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Calendar file downloaded.');
}
function googleCalendarLink(s){
 const when=sessionCalendarTimes(s);
 const params=new URLSearchParams({action:'TEMPLATE',text:calendarSessionTitle(s),dates:when.start+'/'+when.end,details:calendarSessionDescription(s)});
 if(!when.allDay)params.set('ctz',Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/London');
 return 'https://calendar.google.com/calendar/render?'+params.toString();
}
function takeBackup(){const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download=`revision-flow-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Backup downloaded.');}
function tryImportBackup(raw){let obj=parseBackup(raw);if(!confirm('Replace ALL revision data on this device with the backup?'))return;data={...defaultData(),...obj,publishedPlanEnabled:inferPublishedPlanEnabled(obj)};save();closeModal();render();toast('Backup restored successfully.');}

function parseBackup(raw){
 const obj=JSON.parse(raw);
 if(!obj||!Array.isArray(obj.subjects)||!Array.isArray(obj.topics)||!Array.isArray(obj.sessions)||!Array.isArray(obj.activity)||!obj.settings||typeof obj.settings!=='object')throw Error('Not a Revision Flow backup.');
 if(obj.subjects.length>500||obj.topics.length>10000||obj.sessions.length>20000||obj.activity.length>50000)throw Error('Backup is too large to import safely.');
 return obj;
}
// Add another browser's timetable without deleting this browser's existing work.
function tryMergeBackup(raw){
 const incoming=parseBackup(raw);
 if(!confirm('Merge this backup into the current timetable? Existing sessions, topics and settings will be kept. Matching sessions will not be duplicated.'))return;
 const next=JSON.parse(JSON.stringify(data));
 const subjectMap=new Map(),topicMap=new Map(),sessionMap=new Map();
 const usedIds=new Set([...next.subjects,...next.topics,...next.sessions,...next.activity].map(x=>x.id));
 function newId(){let id=uid();while(usedIds.has(id))id=uid();usedIds.add(id);return id;}
 const norm=value=>String(value||'').trim().toLocaleLowerCase('en-GB');
 let addedSubjects=0,addedTopics=0,addedSessions=0,addedActivity=0;
 for(const s of incoming.subjects){
   if(!s||typeof s.id!=='string'||!s.id||!norm(s.name))throw Error('Backup contains an invalid subject.');
   if(subjectMap.has(s.id))throw Error('Backup has duplicate subject IDs.');
   let match=next.subjects.find(x=>norm(x.name)===norm(s.name));
   if(!match){match={...s,id:newId(),name:String(s.name).trim().slice(0,60),color:typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)?s.color:PALETTE[next.subjects.length%PALETTE.length]};next.subjects.push(match);addedSubjects++;}
   subjectMap.set(s.id,match.id);
 }
 for(const t of incoming.topics){
   if(!t||typeof t.id!=='string'||!t.id||!norm(t.name)||!subjectMap.has(t.subjectId))throw Error('Backup contains an invalid topic.');
   if(topicMap.has(t.id))throw Error('Backup has duplicate topic IDs.');
   const subjectId=subjectMap.get(t.subjectId);
   let match=next.topics.find(x=>x.subjectId===subjectId&&norm(x.name)===norm(t.name));
   if(!match){match={...t,id:newId(),subjectId};next.topics.push(match);addedTopics++;}
   topicMap.set(t.id,match.id);
 }
 for(const s of incoming.sessions){
   if(!s||typeof s.id!=='string'||!s.id||!subjectMap.has(s.subjectId)||!validDate(s.date)||!(s.time===''||s.time==null||validTime(s.time))||!Number.isFinite(Number(s.duration)))throw Error('Backup contains an invalid session.');
   if(sessionMap.has(s.id))throw Error('Backup has duplicate session IDs.');
   const subjectId=subjectMap.get(s.subjectId),topicId=topicMap.get(s.topicId)||'',title=String(s.title||''),time=s.time||'';
   // Match by original ID, published-plan slot, or the full session details.
   let match=next.sessions.find(x=>x.id===s.id);
   if(!match&&typeof s.planKey==='string'&&s.planKey)match=next.sessions.find(x=>x.planKey===s.planKey);
   if(!match)match=next.sessions.find(x=>x.subjectId===subjectId&&x.date===s.date&&(x.time||'')===time&&Number(x.duration)===Number(s.duration)&&String(x.title||'')===title);
   if(!match){match={...s,id:newId(),subjectId,topicId,title,time};next.sessions.push(match);addedSessions++;}
   sessionMap.set(s.id,match.id);
 }
 const activityKey=a=>[a.type,a.date,a.subjectId,a.sessionId||'',a.topicId||'',a.rating??'',a.minutes??''].join('\u001f');
 const knownActivity=new Set(next.activity.map(activityKey));
 for(const a of incoming.activity){
   if(!a||typeof a.id!=='string'||!a.id||!subjectMap.has(a.subjectId))continue;
   const mapped={...a,subjectId:subjectMap.get(a.subjectId)};
   if(a.sessionId){if(!sessionMap.has(a.sessionId))continue;mapped.sessionId=sessionMap.get(a.sessionId);}
   if(a.topicId){if(!topicMap.has(a.topicId))continue;mapped.topicId=topicMap.get(a.topicId);}
   const signature=activityKey(mapped);
   if(knownActivity.has(signature)||next.activity.some(x=>x.id===a.id))continue;
   mapped.id=newId();next.activity.push(mapped);knownActivity.add(signature);addedActivity++;
 }
 data=next;save();closeModal();render();
 toast('Merged '+addedSessions+' session'+(addedSessions===1?'':'s')+'; existing timetable preserved.');
 return {addedSubjects,addedTopics,addedSessions,addedActivity};
}

const validDate = s => typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&dateStr(new Date(`${s}T12:00:00`))===s;
const validTime = s => typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
function processBridge(text){let obj;try{obj=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('That is not valid JSON. Paste a JSON update from ChatGPT.');}if(!obj||!Array.isArray(obj.ops)||!obj.ops.length||obj.ops.length>100)throw Error('Expected {"ops":[...]} with between 1 and 100 operations.');
// Validate and stage all operations before committing; import remains atomic.
let temp=JSON.parse(JSON.stringify(data));let result=[];
const tempSubject=name=>temp.subjects.find(s=>s.name.toLowerCase()===String(name||'').trim().toLowerCase());
for(let op of obj.ops){if(!op||typeof op!=='object')throw Error('An operation is invalid.');let kind=op.type;if(kind==='add_subject'){let name=String(op.name||'').trim();if(!name||name.length>60)throw Error('Invalid subject name.');if(tempSubject(name))throw Error(`Subject already exists: ${name}`);temp.subjects.push({id:uid(),name,color:PALETTE[temp.subjects.length%PALETTE.length]});result.push(`Added subject ${name}`);continue;}
let sub=tempSubject(op.subject);
if(kind==='add_topic'){if(!sub)throw Error(`Unknown subject: ${op.subject}`);let name=String(op.name||'').trim();if(!name||name.length>100)throw Error('Invalid topic name.');if(temp.topics.some(t=>t.subjectId===sub.id&&t.name.toLowerCase()===name.toLowerCase()))throw Error(`Topic already exists: ${name}`);let confidence=Math.max(0,Math.min(5,Math.round(Number(op.confidence||0))));temp.topics.push({id:uid(),subjectId:sub.id,name,confidence,nextReview:today(),reviewCount:0,streak:0});result.push(`Added topic ${name}`);continue;}
if(kind==='update_topic'){if(!sub)throw Error(`Unknown subject: ${op.subject}`);let t=temp.topics.find(t=>t.subjectId===sub.id&&t.name.toLowerCase()===String(op.name||'').toLowerCase());if(!t)throw Error(`Topic not found: ${op.name}`);if(op.confidence!==undefined){if(!Number.isFinite(Number(op.confidence))||Number(op.confidence)<0||Number(op.confidence)>5)throw Error('Confidence must be 0–5.');t.confidence=Math.round(Number(op.confidence));}if(op.nextReview!==undefined){if(!validDate(op.nextReview))throw Error('Invalid review date.');t.nextReview=op.nextReview;}result.push(`Updated topic ${t.name}`);continue;}
if(kind==='add_session'){if(!sub)throw Error(`Unknown subject: ${op.subject}`);if(!validDate(op.date)||(op.time&&!validTime(op.time)))throw Error('Session needs a valid date YYYY-MM-DD; time may be HH:MM or blank for flexible.');let duration=Number(op.duration);if(!Number.isInteger(duration)||duration<5||duration>240)throw Error('Session duration must be 5–240 minutes.');let title=String(op.topic||op.title||'').trim().slice(0,100);let t=temp.topics.find(t=>t.subjectId===sub.id&&t.name.toLowerCase()===title.toLowerCase());if(temp.sessions.some(s=>s.subjectId===sub.id&&s.date===op.date&&s.time===(op.time||'')&&s.title===title))throw Error(`Duplicate session: ${sub.name} on ${op.date} at ${op.time}`);temp.sessions.push({id:uid(),subjectId:sub.id,topicId:t?.id||'',title,date:op.date,time:op.time||'',duration,status:'planned'});result.push(`Added ${sub.name} session`);continue;}
if(kind==='complete_session'){let s=temp.sessions.find(x=>x.id===op.id);if(!s)throw Error('Session id not found.');if(s.status==='complete')throw Error('Session already completed.');s.status='complete';s.completedAt=new Date().toISOString();temp.activity.push({id:uid(),type:'session',date:today(),subjectId:s.subjectId,sessionId:s.id,minutes:s.duration});result.push('Marked a session complete');continue;}
throw Error(`Unsupported operation type: ${String(kind)}`);}
data=temp;save();render();toast(`Applied ${result.length} change${result.length===1?'':'s'} successfully.`);return result;}
function handleAction(action,el){const id=el.dataset.id;
switch(action){case 'add-session':openSessionModal(null,el.dataset.date||null);break;case 'edit-session':{const s=session(id);if(s)openSessionModal(s);break;}case 'session-options':sessionOptions(id);break;case 'delete-session':if(confirm('Delete this session?')){const removed=session(id);if(removed?.planKey){if(!Array.isArray(data.skippedPlanKeys))data.skippedPlanKeys=[];if(!data.skippedPlanKeys.includes(removed.planKey))data.skippedPlanKeys.push(removed.planKey);}data.sessions=data.sessions.filter(s=>s.id!==id);save();closeModal();render();toast('Session deleted.');}break;
case 'start-session':focusSession(id);break;case 'complete-session':markComplete(id);break;case 'open-session-chat':{let s=session(id);if(s)openChat(promptForSession(s));break;}case 'open-general-chat':openChat('Please help me revise GCSE material using active recall. Ask one question at a time, wait for my answer, mark it and adapt to my weaknesses.');break;case 'open-topic-chat':{const t=topic(id);if(t)openChat(promptForTopic(t));break;}
case 'add-topic':openTopicModal();break;case 'edit-topic':{const t=topic(id);if(t)openTopicModal(t);break;}case 'delete-topic':if(confirm('Delete this topic?')){data.topics=data.topics.filter(t=>t.id!==id);data.sessions.forEach(s=>{if(s.topicId===id)s.topicId='';});save();closeModal();render();toast('Topic deleted.');}break;case 'review-topic':askReview(id);break;case 'rate-topic':reviewTopic(id,Number(el.dataset.rating));break;case 'filter-subject':topicFilter=id;render();break;case 'filter-review':reviewFilter=id;render();break;
case 'prev-week':weekShift--;render();break;case 'next-week':weekShift++;render();break;case 'current-week':weekShift=0;render();break;
case 'setup-subjects':openSetupModal();break;case 'add-subject':openSubjectModal();break;case 'delete-subject':{const s=subject(id);if(data.sessions.some(x=>x.subjectId===id)||data.topics.some(x=>x.subjectId===id)){toast('Delete this subject’s sessions and topics first.');break;}if(confirm(`Remove ${s.name}?`)){data.subjects=data.subjects.filter(x=>x.id!==id);save();render();}break;}
case 'close-modal':closeModal();break;case 'go-bridge':navigate('bridge');break;case 'copy-bridge':{const instruction=`${INSTRUCTION}\n\nExample:\n${EXAMPLE}`;navigator.clipboard?.writeText(instruction).then(()=>toast('Instructions copied. Paste them into ChatGPT.'),()=>toast('Clipboard access unavailable.'));break;}case 'bridge-example':$('#bridge-input').value=EXAMPLE;break;case 'apply-bridge':try{const result=processBridge($('#bridge-input').value);$('#bridge-input').value='';modal(`${modalHead('Changes applied','Your timetable and topic data are updated.')}<div class="notice blue">${result.map(x=>`✓ ${esc(x)}`).join('<br>')}</div><div class="modal-actions">${btn('Done','close-modal')}</div>`);}catch(e){toast(e.message);}break;
case 'export-calendar':downloadCalendar([...data.sessions].sort((a,b)=>a.date.localeCompare(b.date)||bySessionTime(a,b)),'revision-flow-timetable.ics');break;case 'session-calendar-apple':{const s=session(id);if(s)downloadCalendar([s],'revision-flow-'+s.date+'.ics');break;}case 'session-calendar-google':{const s=session(id);if(s)window.open(googleCalendarLink(s),'_blank','noopener,noreferrer');break;}case 'google-calendar-import':window.open('https://calendar.google.com/calendar/u/0/r/settings/export','_blank','noopener,noreferrer');break;
 case 'export-data':takeBackup();break;case 'merge-data':$('#merge-file')?.click();break;case 'import-data':$('#backup-file')?.click();break;
case 'enable-notifications':if(!('Notification' in window)){toast('This browser does not support this type of notification.');break;}Notification.requestPermission().then(p=>toast(p==='granted'?'Permission granted for supported browser alerts.':`Notification permission: ${p}`));break;
case 'reminder-start-chat':{const s=session(id);if(s){focusSession(id);openChat(promptForSession(s));}break;}case 'snooze':snoozed[id]=Date.now()+10*60000;closeModal();toast('Snoozed for 10 minutes.');break;case 'dismiss-reminder':dismissed[id]=today();closeModal();toast('Reminder dismissed for today.');break;
}}
document.addEventListener('click',ev=>{let n=ev.target.closest('[data-view]');if(n){navigate(n.dataset.view);return;}n=ev.target.closest('[data-action]');if(n){handleAction(n.dataset.action,n);return;}if(ev.target.matches('.modal-scrim')&& !alertId)closeModal();});
document.addEventListener('submit',ev=>{const formId=ev.target.getAttribute('id');if(!['session-form','topic-form','subject-form','setup-form'].includes(formId))return;ev.preventDefault();let f=ev.target,v=Object.fromEntries(new FormData(f).entries());
if(formId==='setup-form'){const chosen=new FormData(f).getAll('subjectNames');if(chosen.length===0){toast('Choose at least one subject.');return;}for(const name of STARTER_NAMES){if(chosen.includes(name)&&!subjectByName(name))data.subjects.push({id:uid(),name,color:PALETTE[data.subjects.length%PALETTE.length]});}save();closeModal();render();toast('Your personal workspace is ready.');return;}
 if(formId==='session-form'){if(!validDate(v.date)||(v.time&&!validTime(v.time))){toast('Check the date and time.');return;}let duration=Number(v.duration);if(duration<5||duration>240||!data.subjects.some(s=>s.id===v.subjectId)){toast('Invalid session details.');return;}let existing=v.id&&session(v.id);let payload={subjectId:v.subjectId,date:v.date,time:v.time,duration,topicId:v.topicId||'',title:String(v.title||'').trim().slice(0,100)};if(existing)Object.assign(existing,payload);else data.sessions.push({...payload,id:uid(),status:'planned'});save();closeModal();render();toast(existing?'Session updated.':'Session added to timetable.');}
if(formId==='topic-form'){if(!v.name?.trim()||!data.subjects.some(s=>s.id===v.subjectId)){toast('Enter a topic name and subject.');return;}if(v.nextReview&&!validDate(v.nextReview)){toast('Invalid review date.');return;}let existing=v.id&&topic(v.id);let payload={name:v.name.trim().slice(0,100),subjectId:v.subjectId,confidence:Number(v.confidence),nextReview:v.nextReview||today()};if(existing)Object.assign(existing,payload);else data.topics.push({...payload,id:uid(),reviewCount:0,streak:0});save();closeModal();render();toast(existing?'Topic updated.':'Topic added.');}
if(formId==='subject-form'){let name=(v.name||'').trim();if(!name||subjectByName(name)){toast('Please enter a new subject name.');return;}data.subjects.push({id:uid(),name:name.slice(0,60),color:PALETTE[data.subjects.length%PALETTE.length]});save();closeModal();render();toast('Subject added.');}
});
document.addEventListener('change',ev=>{const el=ev.target;if(el.getAttribute('id')==='session-subject'){const t=$('#session-topic');if(t)t.innerHTML=topicOptions(el.value,'');}if(el.dataset.setting){let name=el.dataset.setting;let val=el.type==='checkbox'?el.checked:Number(el.value);if(name==='dailyGoal')val=Math.max(10,Math.min(480,Number(val)||90));if(name==='reminderInterval')val=Math.max(5,Math.min(30,Number(val)||10));data.settings[name]=val;save();render();toast('Preference updated.');}if(['backup-file','merge-file'].includes(el.getAttribute('id'))&&el.files?.[0]){const isMerge=el.id==='merge-file';const r=new FileReader();r.onload=()=>{try{if(isMerge)tryMergeBackup(String(r.result));else tryImportBackup(String(r.result));}catch(e){toast(`Could not ${isMerge?'merge':'import'}: ${e.message}`);}el.value='';};r.readAsText(el.files[0]);}});
$('#top-settings').addEventListener('click',()=>navigate('settings'));$('.avatar').addEventListener('click',()=>navigate('settings'));
setInterval(()=>{const timer=$('#focus-timer');if(timer&&focusId){const s=session(focusId);if(s?.startedAt){let elapsed=Math.max(0,Math.floor((Date.now()-new Date(s.startedAt).getTime())/1000));timer.textContent=`${pad(Math.floor(elapsed/60))}:${pad(elapsed%60)}`;}}},1000);
setInterval(checkReminders,30000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkReminders();});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
mergePublishedPlan();render();setTimeout(checkReminders,1500);
})();
