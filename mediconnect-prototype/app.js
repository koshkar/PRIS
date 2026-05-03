/* MediConnect prototype — single-file SPA.
   Эмулирует API Gateway + Auth/Records/Consent/Notify/Audit поверх localStorage. */

const STORE_KEY = 'mediconnect_state_v1';
const SESSION_KEY = 'mediconnect_session_v1';

// ---------- seed data ----------
const seed = () => ({
  users: [
    { id: 'u1', login: 'ivanov',   pwd: '1234', role: 'patient', name: 'Иванов И. И.',  dob: '1986-03-12', allergies: 'Пенициллин', conditions: 'Гипертония' },
    { id: 'u2', login: 'petrova',  pwd: '1234', role: 'patient', name: 'Петрова О. С.', dob: '1992-08-04', allergies: '—',           conditions: '—' },
    { id: 'd1', login: 'smirnov',  pwd: '1234', role: 'doctor',  name: 'Смирнов А. В.', specialty: 'Терапевт' },
    { id: 'd2', login: 'kuznetsova', pwd: '1234', role: 'doctor', name: 'Кузнецова Е. П.', specialty: 'Кардиолог' },
    { id: 'a1', login: 'admin',    pwd: '1234', role: 'admin',   name: 'Администратор клиники' }
  ],
  records: [
    { id: 'r1', patientId: 'u1', type: 'lab',   date: '2026-04-12', text: 'Общий анализ крови — норма (Hb 145, Лейк 6.2)' },
    { id: 'r2', patientId: 'u1', type: 'visit', date: '2026-04-15', text: 'Приём терапевта: жалобы на давление, рекомендован холтер' },
    { id: 'r3', patientId: 'u2', type: 'lab',   date: '2026-03-30', text: 'Биохимия — глюкоза 5.1, холестерин 4.7' }
  ],
  consents: [
    { id: 'c1', patientId: 'u1', doctorId: 'd1', granted: true,  ts: Date.now() - 86400000 * 5 }
  ],
  notifications: [],
  audit: []
});

// ---------- store ----------
const load = () => {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    const s = seed();
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
    return s;
  }
  try { return JSON.parse(raw); } catch { const s = seed(); localStorage.setItem(STORE_KEY, JSON.stringify(s)); return s; }
};
const save = (s) => localStorage.setItem(STORE_KEY, JSON.stringify(s));

let state = load();

// ---------- session ----------
const getSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
};
const setSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = () => localStorage.removeItem(SESSION_KEY);

// ---------- audit ----------
const audit = (actorId, action, target = '', meta = '') => {
  state.audit.unshift({
    id: 'a' + Date.now() + Math.random().toString(16).slice(2, 6),
    ts: Date.now(),
    actorId, action, target, meta
  });
  if (state.audit.length > 500) state.audit.length = 500;
  save(state);
};

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const userById = (id) => state.users.find(u => u.id === id);
const fmtDate = (ts) => new Date(ts).toLocaleString('ru-RU');
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const toast = (msg, kind = '') => {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  setTimeout(() => t.classList.remove('show'), 2200);
};

// ---------- router ----------
const render = () => {
  const session = getSession();
  const app = $('#app');
  app.innerHTML = '';
  const nav = $('#nav');
  const who = $('#who');

  if (!session) {
    nav.classList.add('hidden');
    app.appendChild($('#tpl-login').content.cloneNode(true));
    bindLogin();
    return;
  }

  const u = userById(session.userId);
  if (!u) { clearSession(); render(); return; }

  nav.classList.remove('hidden');
  who.textContent = `${u.name} · ${roleLabel(u.role)}`;

  if (u.role === 'patient') {
    app.appendChild($('#tpl-patient').content.cloneNode(true));
    renderPatient(u);
  } else if (u.role === 'doctor') {
    app.appendChild($('#tpl-doctor').content.cloneNode(true));
    renderDoctor(u);
  } else if (u.role === 'admin') {
    app.appendChild($('#tpl-admin').content.cloneNode(true));
    renderAdmin(u);
  }
};

const roleLabel = (r) => ({ patient: 'Пациент', doctor: 'Врач', admin: 'Администратор' }[r] || r);

// ---------- login ----------
const bindLogin = () => {
  let role = 'patient';
  $$('.role').forEach(b => {
    b.addEventListener('click', () => {
      $$('.role').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      role = b.dataset.role;
    });
  });
  $$('.role')[0].classList.add('active');

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const login = $('#login').value.trim();
    const pwd = $('#password').value;
    const err = $('#loginError');
    err.textContent = '';

    const u = state.users.find(x => x.login === login && x.pwd === pwd);
    if (!u) {
      err.textContent = 'Неверный логин или пароль.';
      audit(null, 'login_failed', login, role);
      return;
    }
    if (u.role !== role) {
      err.textContent = `Учётная запись существует, но имеет роль «${roleLabel(u.role)}». Выберите её сверху.`;
      audit(u.id, 'login_role_mismatch', login, role);
      return;
    }
    setSession({ userId: u.id, ts: Date.now() });
    audit(u.id, 'login_ok', login, role);
    toast('Вход выполнен');
    render();
  });
};

// ---------- patient ----------
const renderPatient = (u) => {
  const profile = $('#patientProfile');
  profile.innerHTML = `
    <dl class="kv">
      <dt>ФИО</dt><dd>${escape(u.name)}</dd>
      <dt>Дата рожд.</dt><dd>${escape(u.dob)}</dd>
      <dt>Аллергии</dt><dd>${escape(u.allergies || '—')}</dd>
      <dt>Хронич.</dt><dd>${escape(u.conditions || '—')}</dd>
    </dl>`;

  const records = state.records.filter(r => r.patientId === u.id);
  const list = $('#recordsList');
  list.innerHTML = records.length
    ? `<div class="list">${records.map(recordRow).join('')}</div>`
    : `<p class="muted small">Записей пока нет.</p>`;

  // consents
  const cWrap = $('#consents');
  const doctors = state.users.filter(x => x.role === 'doctor');
  cWrap.innerHTML = `<div class="list">${doctors.map(d => consentRow(u, d)).join('')}</div>`;
  cWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const docId = btn.dataset.doctor;
    const action = btn.dataset.action;
    setConsent(u.id, docId, action === 'grant');
    renderPatient(u);
  });

  // share form
  const dSel = $('#shareDoctor');
  dSel.innerHTML = doctors.map(d => `<option value="${d.id}">${escape(d.name)} — ${escape(d.specialty)}</option>`).join('');
  const rSel = $('#shareRecord');
  rSel.innerHTML = records.length
    ? records.map(r => `<option value="${r.id}">${escape(typeLabel(r.type))} · ${escape(r.date)} · ${escape(r.text.slice(0, 40))}…</option>`).join('')
    : `<option value="" disabled>Нет записей для отправки</option>`;

  $('#shareForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const docId = dSel.value;
    const recId = rSel.value;
    if (!recId) return;
    const status = $('#shareStatus');
    const ok = state.consents.find(c => c.patientId === u.id && c.doctorId === docId && c.granted);
    if (!ok) {
      status.textContent = 'Нет согласия на передачу этому врачу. Дайте согласие выше.';
      status.className = 'status warn';
      audit(u.id, 'share_blocked_no_consent', docId, recId);
      return;
    }
    state.notifications.unshift({
      id: 'n' + Date.now(),
      doctorId: docId,
      patientId: u.id,
      recordId: recId,
      ts: Date.now(),
      seen: false
    });
    save(state);
    audit(u.id, 'share_record', docId, recId);
    status.textContent = 'Отправлено врачу. Создано уведомление.';
    status.className = 'status ok';
    toast('Данные отправлены врачу');
  });
};

const recordRow = (r) => `
  <div class="row">
    <div>
      <span class="tag ${r.type === 'lab' ? '' : r.type === 'visit' ? 'ok' : 'warn'}">${typeLabel(r.type)}</span>
    </div>
    <div class="text">${escape(r.text)}</div>
    <div class="meta">${escape(r.date)}</div>
  </div>`;

const typeLabel = (t) => ({ lab: 'Анализ', visit: 'Приём', prescription: 'Назначение' }[t] || t);

const consentRow = (patient, doctor) => {
  const c = state.consents.find(x => x.patientId === patient.id && x.doctorId === doctor.id);
  const granted = !!(c && c.granted);
  return `
    <div class="row">
      <div class="text">
        <strong>${escape(doctor.name)}</strong>
        <div class="meta">${escape(doctor.specialty)}${c ? ' · обновлено ' + fmtDate(c.ts) : ''}</div>
      </div>
      <span class="tag ${granted ? 'ok' : 'danger'}">${granted ? 'Доступ есть' : 'Нет доступа'}</span>
      ${granted
        ? `<button class="btn btn-danger" data-action="revoke" data-doctor="${doctor.id}">Отозвать</button>`
        : `<button class="btn btn-ok" data-action="grant" data-doctor="${doctor.id}">Дать согласие</button>`}
    </div>`;
};

const setConsent = (patientId, doctorId, granted) => {
  const existing = state.consents.find(c => c.patientId === patientId && c.doctorId === doctorId);
  if (existing) {
    existing.granted = granted;
    existing.ts = Date.now();
  } else {
    state.consents.push({
      id: 'c' + Date.now(), patientId, doctorId, granted, ts: Date.now()
    });
  }
  save(state);
  audit(patientId, granted ? 'consent_grant' : 'consent_revoke', doctorId);
  toast(granted ? 'Согласие выдано' : 'Согласие отозвано');
};

// ---------- doctor ----------
const renderDoctor = (u) => {
  const granted = state.consents.filter(c => c.doctorId === u.id && c.granted);
  const patients = granted.map(c => userById(c.patientId)).filter(Boolean);

  const pWrap = $('#doctorPatients');
  pWrap.innerHTML = patients.length
    ? `<div class="list">${patients.map(p => patientCardForDoctor(p)).join('')}</div>`
    : `<p class="muted small">Пока ни один пациент не предоставил вам доступ.</p>`;

  const nWrap = $('#doctorNotifications');
  const notifs = state.notifications.filter(n => n.doctorId === u.id);
  nWrap.innerHTML = notifs.length
    ? `<div class="list">${notifs.map(n => notifRow(n)).join('')}</div>`
    : `<p class="muted small">Уведомлений нет.</p>`;

  // mark seen on view
  let dirty = false;
  notifs.forEach(n => { if (!n.seen) { n.seen = true; dirty = true; } });
  if (dirty) save(state);

  const sel = $('#recPatient');
  sel.innerHTML = patients.length
    ? patients.map(p => `<option value="${p.id}">${escape(p.name)}</option>`).join('')
    : `<option value="" disabled>Нет доступных пациентов</option>`;

  $('#recordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pid = sel.value;
    const type = $('#recType').value;
    const text = $('#recText').value.trim();
    const status = $('#recordStatus');
    if (!pid) {
      status.textContent = 'Нет пациентов с согласием — запись не создаётся.';
      status.className = 'status warn';
      return;
    }
    if (!text) return;
    const rec = {
      id: 'r' + Date.now(),
      patientId: pid,
      type,
      date: new Date().toISOString().slice(0, 10),
      text
    };
    state.records.unshift(rec);
    save(state);
    audit(u.id, 'record_create', pid, type);
    status.textContent = 'Запись сохранена в карте пациента.';
    status.className = 'status ok';
    $('#recText').value = '';
    toast('Запись добавлена');
    renderDoctor(u);
  });
};

const patientCardForDoctor = (p) => {
  const recs = state.records.filter(r => r.patientId === p.id);
  return `
    <div class="row">
      <div class="text">
        <strong>${escape(p.name)}</strong>
        <div class="meta">Дата рожд.: ${escape(p.dob)} · Аллергии: ${escape(p.allergies || '—')} · Записей: ${recs.length}</div>
      </div>
      <span class="tag ok">Согласие активно</span>
    </div>`;
};

const notifRow = (n) => {
  const p = userById(n.patientId);
  const r = state.records.find(x => x.id === n.recordId);
  return `
    <div class="row">
      <div class="text">
        <strong>${escape(p ? p.name : 'Пациент')}</strong>
        <div class="meta">${r ? escape(typeLabel(r.type) + ': ' + r.text) : 'Запись недоступна'}</div>
      </div>
      <div class="meta">${fmtDate(n.ts)}</div>
      ${n.seen ? '<span class="tag">Просмотрено</span>' : '<span class="tag warn">Новое</span>'}
    </div>`;
};

// ---------- admin ----------
const renderAdmin = (u) => {
  const log = $('#auditLog');
  const drawLog = (filter = '') => {
    const f = filter.trim().toLowerCase();
    const rows = state.audit
      .filter(e => {
        if (!f) return true;
        const actor = userById(e.actorId);
        const hay = [e.action, e.target, e.meta, actor ? actor.name : '', actor ? actor.login : ''].join(' ').toLowerCase();
        return hay.includes(f);
      })
      .slice(0, 200)
      .map(auditRow).join('');
    log.innerHTML = rows
      ? `<div class="list">${rows}</div>`
      : `<p class="muted small">Записей нет.</p>`;
  };
  drawLog();
  $('#auditFilter').addEventListener('input', (e) => drawLog(e.target.value));
  $('#auditClear').addEventListener('click', () => {
    if (!confirm('Очистить весь журнал аудита?')) return;
    state.audit = [];
    save(state);
    audit(u.id, 'audit_cleared');
    drawLog($('#auditFilter').value);
    toast('Журнал очищен');
  });

  const usersWrap = $('#usersList');
  usersWrap.innerHTML = `<div class="list">${
    state.users.map(x => `
      <div class="row">
        <div class="text"><strong>${escape(x.name)}</strong>
          <div class="meta">${escape(x.login)} · ${escape(roleLabel(x.role))}</div>
        </div>
      </div>`).join('')
  }</div>`;

  const totals = {
    users: state.users.length,
    records: state.records.length,
    consents: state.consents.filter(c => c.granted).length,
    notifications: state.notifications.length,
    audit: state.audit.length
  };
  $('#health').innerHTML = `
    <li>Auth Service: <strong>OK</strong></li>
    <li>Records Service: <strong>OK</strong> (${totals.records})</li>
    <li>Consent Service: <strong>OK</strong> (активных согласий: ${totals.consents})</li>
    <li>Notification Service: <strong>OK</strong> (${totals.notifications})</li>
    <li>Audit Service: <strong>OK</strong> (${totals.audit})</li>
    <li>Пользователей: ${totals.users}</li>`;
};

const auditRow = (e) => {
  const actor = userById(e.actorId);
  const target = e.target ? userById(e.target) : null;
  const targetLabel = target ? target.name : (e.target || '—');
  return `
    <div class="row">
      <div class="text">
        <strong>${escape(e.action)}</strong>
        <div class="meta">актор: ${actor ? escape(actor.name) : '—'} · цель: ${escape(targetLabel)}${e.meta ? ' · ' + escape(e.meta) : ''}</div>
      </div>
      <div class="meta">${fmtDate(e.ts)}</div>
    </div>`;
};

// ---------- logout ----------
$('#logoutBtn').addEventListener('click', () => {
  const s = getSession();
  if (s) audit(s.userId, 'logout');
  clearSession();
  toast('Выход выполнен');
  render();
});

// ---------- init ----------
render();
