'use strict';

// ----- State -----
const state = {
  userId: localStorage.getItem('pw_user_id') || '',
  tasks: [],
  editingId: null,
};

// ----- DOM refs -----
const el = {
  userId: document.getElementById('userId'),
  newTaskBtn: document.getElementById('newTaskBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  taskList: document.getElementById('taskList'),
  emptyState: document.getElementById('emptyState'),
  statTotal: document.getElementById('statTotal'),
  statActive: document.getElementById('statActive'),
  statStopped: document.getElementById('statStopped'),
  statQueue: document.getElementById('statQueue'),
  // modal
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalClose: document.getElementById('modalClose'),
  taskForm: document.getElementById('taskForm'),
  cancelBtn: document.getElementById('cancelBtn'),
  saveBtn: document.getElementById('saveBtn'),
  testBtn: document.getElementById('testBtn'),
  testResult: document.getElementById('testResult'),
  // history
  historyOverlay: document.getElementById('historyOverlay'),
  historyClose: document.getElementById('historyClose'),
  historyList: document.getElementById('historyList'),
  toast: document.getElementById('toast'),
};

// form fields
const f = {
  id: document.getElementById('taskId'),
  name: document.getElementById('f_name'),
  url: document.getElementById('f_url'),
  method: document.getElementById('f_method'),
  mode: document.getElementById('f_mode'),
  regex: document.getElementById('f_regex'),
  condition: document.getElementById('f_condition'),
  frequency: document.getElementById('f_frequency'),
  stopOnCondition: document.getElementById('f_stopOnCondition'),
  template: document.getElementById('f_template'),
  timeout: document.getElementById('f_timeout'),
  retries: document.getElementById('f_retries'),
  useragent: document.getElementById('f_useragent'),
  body: document.getElementById('f_body'),
};

// ----- API helper -----
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ошибка ${res.status}`);
  }
  return data;
}

// ----- Toast -----
let toastTimer = null;
function toast(message, type = '') {
  el.toast.textContent = message;
  el.toast.className = 'toast' + (type ? ` toast-${type}` : '');
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 3200);
}

// ----- Rendering -----
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_LABEL = {
  active: 'Активна',
  stopped: 'Остановлена',
  error: 'Ошибка',
  paused: 'Пауза',
};

function formatFrequency(seconds) {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч`;
  return `${Math.round(seconds / 86400)} дн`;
}

function renderTasks() {
  const tasks = state.tasks;
  el.statTotal.textContent = tasks.length;
  el.statActive.textContent = tasks.filter((t) => t.status === 'active').length;
  el.statStopped.textContent = tasks.filter((t) => t.status === 'stopped').length;

  if (tasks.length === 0) {
    el.taskList.innerHTML = '';
    el.emptyState.hidden = false;
    return;
  }
  el.emptyState.hidden = true;

  el.taskList.innerHTML = tasks
    .map((t) => {
      const status = t.status || 'stopped';
      const isActive = status === 'active';
      const lastCheck = t.last_check ? new Date(t.last_check + 'Z').toLocaleString('ru-RU') : '—';
      const lastValue = t.last_value ? escapeHtml(t.last_value) : '—';
      return `
        <article class="task-card" data-id="${t.id}">
          <div class="task-main">
            <div class="task-name">
              ${escapeHtml(t.name || `Задача #${t.id}`)}
              <span class="badge badge-${status}">${STATUS_LABEL[status] || status}</span>
            </div>
            <div class="task-url" title="${escapeHtml(t.url)}">${escapeHtml(t.url)}</div>
            <div class="task-meta">
              <span><strong>${escapeHtml(t.mode)}</strong> / ${escapeHtml(t.condition_type)}</span>
              <span>Каждые <strong>${formatFrequency(t.frequency_seconds)}</strong></span>
              <span>Последнее значение: <strong>${lastValue}</strong></span>
              <span>Проверка: <strong>${lastCheck}</strong></span>
            </div>
          </div>
          <div class="task-actions">
            ${
              isActive
                ? `<button class="btn btn-ghost" data-action="stop">Стоп</button>`
                : `<button class="btn btn-primary" data-action="start">Старт</button>`
            }
            <button class="btn btn-ghost" data-action="history">История</button>
            <button class="btn btn-ghost" data-action="edit">Изменить</button>
            <button class="btn btn-danger" data-action="delete">Удалить</button>
          </div>
        </article>`;
    })
    .join('');
}

// ----- Data loading -----
async function loadTasks() {
  if (!state.userId) {
    state.tasks = [];
    renderTasks();
    return;
  }
  try {
    const data = await api('GET', `/tasks?user_id=${encodeURIComponent(state.userId)}`);
    state.tasks = data.tasks || [];
    renderTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadStatus() {
  try {
    const data = await api('GET', '/status');
    el.statQueue.textContent = data.scheduler?.queueLength ?? 0;
  } catch {
    /* ignore status errors */
  }
}

// ----- Modal handling -----
function openModal(task) {
  el.testResult.hidden = true;
  el.testResult.className = 'test-result';
  if (task) {
    state.editingId = task.id;
    el.modalTitle.textContent = `Изменить: ${task.name || `Задача #${task.id}`}`;
    f.id.value = task.id;
    f.name.value = task.name || '';
    f.url.value = task.url;
    f.method.value = task.http_method || 'GET';
    f.mode.value = task.mode;
    f.regex.value = task.regex_pattern;
    f.condition.value = task.condition_type;
    f.frequency.value = task.frequency_seconds;
    f.stopOnCondition.checked = task.stop_on_condition !== false;
    f.template.value = task.template;
    f.timeout.value = task.timeout ?? 30;
    f.retries.value = task.max_retries ?? 3;
    f.useragent.value = task.user_agent || '';
    f.body.value = task.request_body || '';
  } else {
    state.editingId = null;
    el.modalTitle.textContent = 'Новая задача';
    el.taskForm.reset();
    f.id.value = '';
    f.frequency.value = 3600;
    f.timeout.value = 30;
    f.retries.value = 3;
  }
  el.modalOverlay.hidden = false;
}

function closeModal() {
  el.modalOverlay.hidden = true;
  state.editingId = null;
}

function collectForm() {
  return {
    name: f.name.value.trim() || undefined,
    url: f.url.value.trim(),
    http_method: f.method.value,
    mode: f.mode.value,
    regex_pattern: f.regex.value,
    condition_type: f.condition.value,
    frequency_seconds: Number(f.frequency.value),
    stop_on_condition: f.stopOnCondition.checked,
    template: f.template.value,
    timeout: Number(f.timeout.value) || 30,
    max_retries: Number(f.retries.value) || 0,
    user_agent: f.useragent.value.trim() || undefined,
    request_body: f.body.value.trim() || undefined,
  };
}

async function saveTask(e) {
  e.preventDefault();
  if (!state.userId) {
    toast('Сначала введите Telegram User ID', 'error');
    return;
  }
  const payload = collectForm();
  el.saveBtn.disabled = true;
  try {
    if (state.editingId) {
      await api('PUT', `/tasks/${state.editingId}`, payload);
      toast('Задача обновлена', 'success');
    } else {
      await api('POST', '/tasks', { ...payload, user_id: Number(state.userId) });
      toast('Задача создана', 'success');
    }
    closeModal();
    await loadTasks();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    el.saveBtn.disabled = false;
  }
}

async function testConfig() {
  const payload = collectForm();
  el.testBtn.disabled = true;
  el.testResult.hidden = false;
  el.testResult.className = 'test-result';
  el.testResult.innerHTML = '<span class="spinner"></span> Проверяем...';
  try {
    let data;
    if (state.editingId) {
      data = await api('POST', `/tasks/${state.editingId}/test`);
    } else {
      data = await api('POST', '/test-config', payload);
    }
    const r = data.result;
    if (r && r.success) {
      el.testResult.className = 'test-result ok';
      el.testResult.innerHTML = `
        <strong>Успешно</strong> · HTTP ${r.statusCode} · ${r.responseTime} мс · совпадений: ${r.matchCount}
        ${r.firstMatch ? `<pre>Первое совпадение: ${escapeHtml(r.firstMatch)}</pre>` : ''}
        ${data.preview ? `<pre>Предпросмотр сообщения:\n${escapeHtml(data.preview)}</pre>` : ''}`;
    } else {
      el.testResult.className = 'test-result err';
      el.testResult.innerHTML = `<strong>Ошибка</strong><pre>${escapeHtml(r?.error || 'Неизвестная ошибка')}</pre>`;
    }
  } catch (err) {
    el.testResult.className = 'test-result err';
    el.testResult.innerHTML = `<strong>Ошибка</strong><pre>${escapeHtml(err.message)}</pre>`;
  } finally {
    el.testBtn.disabled = false;
  }
}

// ----- History -----
async function openHistory(taskId) {
  el.historyOverlay.hidden = false;
  el.historyList.innerHTML = '<span class="spinner"></span> Загрузка...';
  try {
    const data = await api('GET', `/tasks/${taskId}/history?limit=50`);
    const items = data.history || [];
    if (items.length === 0) {
      el.historyList.innerHTML = '<p class="empty-sub">История пуста.</p>';
      return;
    }
    el.historyList.innerHTML = items
      .map((h) => {
        const time = h.check_time ? new Date(h.check_time + 'Z').toLocaleString('ru-RU') : '—';
        return `
          <div class="history-item ${h.error ? 'has-error' : ''}">
            <div class="history-top">
              <span>${time}</span>
              <span>${h.status_code ? `HTTP ${h.status_code}` : ''} ${h.response_time ? `· ${h.response_time} мс` : ''} ${h.message_sent ? '· отправлено' : ''}</span>
            </div>
            <div class="history-result">${h.error ? '⚠ ' + escapeHtml(h.error) : escapeHtml(h.result || '—')}</div>
          </div>`;
      })
      .join('');
  } catch (err) {
    el.historyList.innerHTML = `<p class="empty-sub">${escapeHtml(err.message)}</p>`;
  }
}

// ----- Task actions (event delegation) -----
async function handleTaskAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const card = e.target.closest('.task-card');
  const id = Number(card.dataset.id);
  const action = btn.dataset.action;
  const task = state.tasks.find((t) => t.id === id);

  try {
    if (action === 'start') {
      await api('POST', `/tasks/${id}/start`);
      toast('Задача запущена', 'success');
      await loadTasks();
    } else if (action === 'stop') {
      await api('POST', `/tasks/${id}/stop`);
      toast('Задача остановлена', 'success');
      await loadTasks();
    } else if (action === 'edit') {
      openModal(task);
    } else if (action === 'history') {
      openHistory(id);
    } else if (action === 'delete') {
      if (confirm(`Удалить задачу "${task?.name || '#' + id}"?`)) {
        await api('DELETE', `/tasks/${id}`);
        toast('Задача удалена', 'success');
        await loadTasks();
      }
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ----- Init -----
function init() {
  el.userId.value = state.userId;

  el.userId.addEventListener('change', () => {
    state.userId = el.userId.value.trim();
    localStorage.setItem('pw_user_id', state.userId);
    loadTasks();
  });

  el.newTaskBtn.addEventListener('click', () => {
    if (!state.userId) {
      toast('Сначала введите Telegram User ID', 'error');
      el.userId.focus();
      return;
    }
    openModal(null);
  });

  el.refreshBtn.addEventListener('click', () => {
    loadTasks();
    loadStatus();
  });

  el.modalClose.addEventListener('click', closeModal);
  el.cancelBtn.addEventListener('click', closeModal);
  el.modalOverlay.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeModal();
  });
  el.taskForm.addEventListener('submit', saveTask);
  el.testBtn.addEventListener('click', testConfig);

  el.historyClose.addEventListener('click', () => {
    el.historyOverlay.hidden = true;
  });
  el.historyOverlay.addEventListener('click', (e) => {
    if (e.target === el.historyOverlay) el.historyOverlay.hidden = true;
  });

  el.taskList.addEventListener('click', handleTaskAction);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      el.historyOverlay.hidden = true;
    }
  });

  loadTasks();
  loadStatus();
  setInterval(loadStatus, 15000);
}

init();
