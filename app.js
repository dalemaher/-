/* ============ MAHER DELI - إدارة الديون ============ */
/* تخزين محلي بالكامل - يعمل بدون انترنت */

const STORAGE_KEY = 'maherdeli_debts_v1';
let state = { clients: [], amountsHidden: false };
let currentClientId = null;
let currentTxnType = 'payment';

let storageOK = true;
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) state = JSON.parse(raw);
  }catch(e){
    console.error('load error', e);
    storageOK = false;
  }
  if(!state.clients) state.clients = [];
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error('save error', e);
    storageOK = false;
    showToast('⚠️ المتصفح يمنع الحفظ هنا — افتح الملف من متصفح حقيقي (كروم) وليس من معاينة داخل تطبيق آخر');
  }
}

function uid(){ return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

function fmt(n){
  n = Math.round(Number(n)||0);
  return 'IQD ' + (state.amountsHidden ? '••••' : n.toLocaleString('en-US'));
}
function fmtNum(n){
  n = Math.round(Number(n)||0);
  return state.amountsHidden ? '••••' : n.toLocaleString('en-US');
}

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

/* -------- computations -------- */
function clientTotals(c){
  let debt = 0, paid = 0;
  (c.txns||[]).forEach(t=>{
    if(t.type === 'debt') debt += Number(t.amount)||0;
    else paid += Number(t.amount)||0;
  });
  return { debt, paid, remaining: debt - paid };
}

function isThisWeek(dateStr){
  const d = new Date(dateStr);
  const now = new Date();
  const day = now.getDay(); // 0 = sunday
  const start = new Date(now); start.setDate(now.getDate()-day); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate()+7);
  return d >= start && d < end;
}
function isThisMonth(dateStr){
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}
function isToday(dateStr){
  return dateStr === todayISO();
}

/* -------- toast -------- */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2000);
}

/* -------- view switching -------- */
function switchView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.bottomnav button').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector('.bottomnav button[data-view="'+name+'"]');
  if(btn) btn.classList.add('active');
  const titles = {dashboard:'لوحة التحكم', clients:'العملاء', late:'المتأخرون', detail:'تفاصيل العميل'};
  document.getElementById('pageTitle').textContent = titles[name] || 'لوحة التحكم';
  document.getElementById('backBtn').style.display = 'none';
  document.getElementById('headerLeftIcons').style.display = 'flex';
  if(name==='dashboard') renderDashboard();
  if(name==='clients') renderClientsList();
  if(name==='late') renderLateList();
  window.scrollTo(0,0);
}

function openOverlay(id){ document.getElementById(id).classList.add('active'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('active'); }

function toggleAmountsVisible(){
  state.amountsHidden = !state.amountsHidden;
  saveState();
  renderAll();
}

/* -------- dashboard -------- */
function renderGreeting(){
  const h = new Date().getHours();
  let g = 'مساء الخير';
  if(h < 12) g = 'صباح الخير';
  else if(h < 17) g = 'مساء الخير';
  document.getElementById('greetText').textContent = g + ' 👋';
}

function renderDashboard(){
  renderGreeting();
  const clients = state.clients;
  let allDebt=0, allPaid=0, debtorsCount=0, todayCollected=0, weekCollected=0, monthCollected=0;

  clients.forEach(c=>{
    const t = clientTotals(c);
    allDebt += t.debt;
    allPaid += t.paid;
    if(t.remaining > 0) debtorsCount++;
    (c.txns||[]).forEach(tx=>{
      if(tx.type==='payment'){
        if(isToday(tx.date)) todayCollected += Number(tx.amount)||0;
        if(isThisWeek(tx.date)) weekCollected += Number(tx.amount)||0;
        if(isThisMonth(tx.date)) monthCollected += Number(tx.amount)||0;
      }
    });
  });

  const outstanding = clients.reduce((s,c)=> s + Math.max(clientTotals(c).remaining,0), 0);

  document.getElementById('todayCollected').textContent = 'تحصيلات اليوم: ' + fmt(todayCollected);
  document.getElementById('statDebtorsCount').textContent = fmtNum(debtorsCount);
  document.getElementById('statClientsCount').textContent = fmtNum(clients.length);
  document.getElementById('statDebtorsAmount').textContent = fmt(outstanding);
  document.getElementById('statClientsAmount').textContent = fmt(allPaid);
  document.getElementById('statMonthCollected').textContent = fmt(monthCollected);
  document.getElementById('statWeekCollected').textContent = fmt(weekCollected);

  // top debtors
  const topDebtors = clients
    .map(c=>({c, t: clientTotals(c)}))
    .filter(x=>x.t.remaining > 0)
    .sort((a,b)=> b.t.remaining - a.t.remaining)
    .slice(0,5);

  const box = document.getElementById('topDebtorsList');
  if(topDebtors.length===0){
    box.innerHTML = '<div class="empty">لا يوجد عملاء مدينون حالياً 🎉</div>';
  }else{
    box.innerHTML = topDebtors.map(x=> renderRow(x.c, x.t)).join('');
  }
}

function initial(name){
  return (name||'?').trim().charAt(0).toUpperCase() || '?';
}

function renderRow(c, t){
  const owing = t.remaining > 0;
  return `
  <div class="list-row" onclick="openDetail('${c.id}')">
    <div class="left">
      <div class="avatar ${owing?'red':''}">${initial(c.name)}</div>
      <div>
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="sub">${c.phone ? c.phone : 'بدون رقم هاتف'}</div>
      </div>
    </div>
    <div class="amount ${owing?'owe':'ok'}">${owing ? fmt(t.remaining) : 'مسدد ✓'}</div>
  </div>`;
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/* -------- clients list -------- */
function renderClientsList(){
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const list = state.clients
    .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone||'').includes(q))
    .sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  const box = document.getElementById('clientsList');
  if(list.length===0){
    box.innerHTML = '<div class="empty">لا يوجد عملاء بعد. اضغط + لإضافة عميل جديد</div>';
    return;
  }
  box.innerHTML = list.map(c=> renderRow(c, clientTotals(c))).join('');
}

/* -------- late / debtors list -------- */
function renderLateList(){
  const list = state.clients
    .map(c=>({c, t: clientTotals(c)}))
    .filter(x=> x.t.remaining > 0)
    .sort((a,b)=> b.t.remaining - a.t.remaining);
  const box = document.getElementById('lateList');
  if(list.length===0){
    box.innerHTML = '<div class="empty">لا يوجد مدينون حالياً 🎉</div>';
    return;
  }
  box.innerHTML = list.map(x=>{
    let dueInfo = '';
    if(x.c.dueDate){
      const overdue = new Date(x.c.dueDate) < new Date(todayISO());
      dueInfo = `<div class="sub" style="color:${overdue?'#e11d48':'#94a3b8'}">${overdue?'⚠️ متأخر عن':'موعد الاستحقاق'}: ${x.c.dueDate}</div>`;
    }
    return `
    <div class="list-row" onclick="openDetail('${x.c.id}')">
      <div class="left">
        <div class="avatar red">${initial(x.c.name)}</div>
        <div>
          <div class="name">${escapeHtml(x.c.name)}</div>
          ${dueInfo || `<div class="sub">${x.c.phone || 'بدون رقم هاتف'}</div>`}
        </div>
      </div>
      <div class="amount owe">${fmt(x.t.remaining)}</div>
    </div>`;
  }).join('');
}
function openLate(){ switchView('late'); }

/* -------- add client -------- */
function openAddClient(){
  document.getElementById('addName').value = '';
  document.getElementById('addPhone').value = '';
  document.getElementById('addDebt').value = '0';
  document.getElementById('addDue').value = '';
  document.getElementById('addNote').value = '';
  openOverlay('overlay-add');
  setTimeout(()=> document.getElementById('addName').focus(), 200);
}

function saveNewClient(){
  try{
    const name = document.getElementById('addName').value.trim();
    if(!name){ showToast('الرجاء إدخال اسم العميل'); return; }
    const phone = document.getElementById('addPhone').value.trim();
    const debt = Number(document.getElementById('addDebt').value) || 0;
    const due = document.getElementById('addDue').value;
    const note = document.getElementById('addNote').value.trim();

    const c = {
      id: uid(),
      name, phone, note,
      dueDate: due || null,
      createdAt: Date.now(),
      txns: []
    };
    if(debt > 0){
      c.txns.push({ id: uid(), type:'debt', amount: debt, date: todayISO(), note:'رصيد ابتدائي' });
    }
    state.clients.push(c);
    saveState();
    closeOverlay('overlay-add');
    showToast('تمت إضافة العميل بنجاح ✓');
    renderAll();
    switchView('dashboard');
  }catch(err){
    console.error(err);
    showToast('⚠️ حدث خطأ: ' + err.message);
  }
}

/* -------- client detail -------- */
function openDetail(id){
  currentClientId = id;
  const c = state.clients.find(x=>x.id===id);
  if(!c) return;
  const t = clientTotals(c);
  document.getElementById('detAvatar').textContent = initial(c.name);
  document.getElementById('detAvatar').className = 'avatar' + (t.remaining>0 ? ' red' : '');
  document.getElementById('detName').textContent = c.name;
  document.getElementById('detPhone').textContent = c.phone || '';
  document.getElementById('detBalance').textContent = fmt(Math.max(t.remaining,0));
  document.getElementById('detBalanceBox').className = 'balance-box' + (t.remaining>0 ? ' owing' : '');
  document.getElementById('detTotalDebt').textContent = fmt(t.debt);
  document.getElementById('detTotalPaid').textContent = fmt(t.paid);

  const txnBox = document.getElementById('txnList');
  const txns = (c.txns||[]).slice().sort((a,b)=> new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
  if(txns.length===0){
    txnBox.innerHTML = '<div class="empty">لا توجد حركات مسجلة بعد</div>';
  }else{
    txnBox.innerHTML = txns.map(tx=>`
      <div class="txn-row">
        <div class="txn-left">
          <div class="txn-ic ${tx.type==='payment'?'pay':'debt'}">${tx.type==='payment'?'💵':'➕'}</div>
          <div>
            <div class="txn-note">${tx.type==='payment'?'دفعة':'دين'}${tx.note ? ' — '+escapeHtml(tx.note) : ''}</div>
            <div class="txn-date">${tx.date}</div>
          </div>
        </div>
        <div class="txn-amt ${tx.type==='payment'?'pay':'debt'}">${tx.type==='payment'?'+':'-'}${fmtNum(tx.amount)}</div>
      </div>`).join('');
  }

  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-detail').classList.add('active');
  document.getElementById('pageTitle').textContent = 'تفاصيل العميل';
  document.querySelectorAll('.bottomnav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('backBtn').style.display = 'flex';
  document.getElementById('headerLeftIcons').style.display = 'none';
  window.scrollTo(0,0);
}

/* -------- txn (payment / debt) -------- */
function openTxn(type){
  currentTxnType = type;
  document.getElementById('txnTitle').textContent = type==='payment' ? 'تسجيل دفعة' : 'إضافة دين جديد';
  document.getElementById('txnSaveBtn').textContent = type==='payment' ? 'حفظ الدفعة' : 'حفظ الدين';
  document.getElementById('txnAmount').value = '';
  document.getElementById('txnDate').value = todayISO();
  document.getElementById('txnNote').value = '';
  openOverlay('overlay-txn');
  setTimeout(()=> document.getElementById('txnAmount').focus(), 200);
}

function saveTxn(){
  const amount = Number(document.getElementById('txnAmount').value);
  if(!amount || amount <= 0){ showToast('الرجاء إدخال مبلغ صحيح'); return; }
  const date = document.getElementById('txnDate').value || todayISO();
  const note = document.getElementById('txnNote').value.trim();
  const c = state.clients.find(x=>x.id===currentClientId);
  if(!c) return;
  c.txns.push({ id: uid(), type: currentTxnType, amount, date, note });
  saveState();
  closeOverlay('overlay-txn');
  showToast(currentTxnType==='payment' ? 'تم تسجيل الدفعة ✓' : 'تمت إضافة الدين ✓');
  openDetail(currentClientId);
  renderDashboard();
}

/* -------- edit / delete client -------- */
function editClient(){
  const c = state.clients.find(x=>x.id===currentClientId);
  if(!c) return;
  document.getElementById('editName').value = c.name;
  document.getElementById('editPhone').value = c.phone || '';
  document.getElementById('editNote').value = c.note || '';
  openOverlay('overlay-edit');
}
function saveEditClient(){
  const c = state.clients.find(x=>x.id===currentClientId);
  if(!c) return;
  const name = document.getElementById('editName').value.trim();
  if(!name){ showToast('الرجاء إدخال اسم العميل'); return; }
  c.name = name;
  c.phone = document.getElementById('editPhone').value.trim();
  c.note = document.getElementById('editNote').value.trim();
  saveState();
  closeOverlay('overlay-edit');
  showToast('تم حفظ التعديلات ✓');
  openDetail(currentClientId);
}
function deleteClient(){
  if(!confirm('هل أنت متأكد من حذف هذا العميل وكل سجلاته؟ لا يمكن التراجع عن هذا الإجراء.')) return;
  state.clients = state.clients.filter(x=>x.id!==currentClientId);
  saveState();
  showToast('تم حذف العميل');
  switchView('dashboard');
}

/* -------- calculator -------- */
let calcExpr = '';
function buildCalcGrid(){
  const keys = ['7','8','9','C','4','5','6','÷','1','2','3','×','0','.','⌫','−','=','','','+'];
  const grid = document.getElementById('calcGrid');
  grid.innerHTML = '';
  const layout = [
    ['7','8','9','÷'],
    ['4','5','6','×'],
    ['1','2','3','−'],
    ['C','0','⌫','+'],
    ['=','=','=','=']
  ];
  layout.forEach((row,ri)=>{
    row.forEach((k,ci)=>{
      if(ri===4 && ci>0) return; // merge equals row into one button via colspan trick
    });
  });
  const simpleKeys = ['7','8','9','÷','4','5','6','×','1','2','3','−','C','0','⌫','+'];
  simpleKeys.forEach(k=>{
    const b = document.createElement('button');
    b.textContent = k;
    if(k==='÷'||k==='×'||k==='−'||k==='+') b.className='op';
    if(k==='C') b.className='clr';
    b.onclick = ()=> calcPress(k);
    grid.appendChild(b);
  });
  const eq = document.createElement('button');
  eq.textContent='=';
  eq.className='eq';
  eq.style.gridColumn='span 4';
  eq.onclick = ()=> calcPress('=');
  grid.appendChild(eq);
}
function calcPress(k){
  if(k==='C'){ calcExpr=''; }
  else if(k==='⌫'){ calcExpr = calcExpr.slice(0,-1); }
  else if(k==='='){
    try{
      let e = calcExpr.replace(/÷/g,'/').replace(/×/g,'*').replace(/−/g,'-');
      if(!e) return;
      // eslint-disable-next-line no-eval
      const result = Function('"use strict";return ('+e+')')();
      calcExpr = String(Math.round(result*100)/100);
    }catch(e){ calcExpr = 'خطأ'; }
  } else {
    if(calcExpr==='خطأ') calcExpr='';
    calcExpr += k;
  }
  document.getElementById('calcDisplay').textContent = calcExpr || '0';
}
function openCalc(){
  calcExpr='';
  document.getElementById('calcDisplay').textContent='0';
  openOverlay('overlay-calc');
}

/* -------- menu / backup -------- */
function openMenu(){ openOverlay('overlay-menu'); }

function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'maherdeli-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('تم تصدير النسخة الاحتياطية ✓');
}

function importData(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      if(!data.clients) throw new Error('invalid');
      if(!confirm('سيتم استبدال جميع البيانات الحالية بالنسخة المستوردة. متابعة؟')) return;
      state = data;
      saveState();
      showToast('تم استيراد البيانات بنجاح ✓');
      closeOverlay('overlay-menu');
      renderAll();
      switchView('dashboard');
    }catch(err){
      showToast('ملف غير صالح');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function wipeAllData(){
  if(!confirm('سيتم حذف جميع العملاء والبيانات نهائياً. هل أنت متأكد؟')) return;
  if(!confirm('تأكيد أخير: لا يمكن التراجع عن هذا الإجراء. هل تريد المتابعة؟')) return;
  state = { clients: [], amountsHidden: false };
  saveState();
  showToast('تم حذف جميع البيانات');
  closeOverlay('overlay-menu');
  renderAll();
  switchView('dashboard');
}

/* -------- init -------- */
function renderAll(){
  renderDashboard();
  renderClientsList();
  renderLateList();
}

function init(){
  loadState();
  buildCalcGrid();
  renderAll();
  switchView('dashboard');

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
}
document.addEventListener('DOMContentLoaded', init);
