(() => {
  const $ = (selector) => document.querySelector(selector);
  const today = new Date();
  const todayKey = toDateKey(today);
  const taskStorageKey = 'dayflow.tasks.v1';
  const presetStorageKey = 'dayflow.presets.v1';
  const defaultPresets = [
    { id: 'focus', title: 'Focus block', time: '09:00' },
    { id: 'break', title: 'Take a break', time: '11:00' },
    { id: 'lunch', title: 'Lunch break', time: '13:00' },
    { id: 'movement', title: 'Move your body', time: '' },
    { id: 'tomorrow', title: 'Plan tomorrow', time: '20:00' }
  ];

  let currentView = 'today';
  let sortByTime = true;
  let tasks = readTasks();
  let presets = readPresets();
  let presetDraft = [];
  let deferredInstall = null;
  let toastTimer = null;

  $('#welcomeDate').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  }).format(today);
  $('#sectionKicker').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'short', day: 'numeric'
  }).format(today).toUpperCase();
  $('#taskDate').value = todayKey;
  $('#taskDate').min = todayKey;

  function toDateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function readTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(taskStorageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((task) =>
        task && typeof task.id === 'string' && typeof task.title === 'string' &&
        typeof task.date === 'string'
      ) : [];
    } catch {
      return [];
    }
  }

  function readPresets() {
    try {
      const saved = localStorage.getItem(presetStorageKey);
      if (saved === null) return defaultPresets.map((preset) => ({ ...preset }));
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return defaultPresets.map((preset) => ({ ...preset }));
      return parsed.filter((preset) =>
        preset && typeof preset.title === 'string' && typeof preset.time === 'string'
      ).map((preset) => ({
        id: typeof preset.id === 'string' ? preset.id : makeId(),
        title: preset.title.slice(0, 45),
        time: preset.time
      }));
    } catch {
      return defaultPresets.map((preset) => ({ ...preset }));
    }
  }

  function makeId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function saveTasks() {
    try {
      localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
    } catch {
      showToast('Could not save on this device. Check storage settings.');
    }
  }

  function formatTime(value) {
    if (!value) return '';
    const parts = value.split(':').map(Number);
    const date = new Date();
    date.setHours(parts[0], parts[1], 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function formatDate(value, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(value + 'T12:00:00'));
  }

  function visibleTasks() {
    if (currentView === 'upcoming') return tasks.filter((task) => task.date > todayKey && !task.completed);
    if (currentView === 'done') {
      return tasks.filter((task) => task.completed).sort((a, b) =>
        (b.completedAt || '').localeCompare(a.completedAt || '')
      );
    }
    return tasks.filter((task) => task.date === todayKey);
  }

  function createTaskCard(task, upcoming = false) {
    const card = document.createElement('article');
    card.className = 'task-card' + (task.completed ? ' completed' : '');

    const check = document.createElement('button');
    check.className = 'task-check';
    check.type = 'button';
    check.setAttribute('aria-label', (task.completed ? 'Mark ' : 'Complete ') + task.title);
    check.setAttribute('aria-pressed', String(task.completed));
    check.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 3 3 6-6.4"/></svg>';
    check.addEventListener('click', () => toggleTask(task.id));

    const content = document.createElement('div');
    content.className = 'task-content';
    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent = task.title;
    const meta = document.createElement('div');
    meta.className = 'task-meta';

    if (task.time) {
      meta.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M8 4.7V8l2.2 1.4"/></svg>';
      const time = document.createElement('span');
      time.textContent = formatTime(task.time);
      meta.append(time);
    } else {
      const flexible = document.createElement('span');
      flexible.textContent = 'Whenever it fits';
      meta.append(flexible);
    }

    content.append(title, meta);
    card.append(check, content);

    if (upcoming) {
      const date = document.createElement('span');
      date.className = 'task-date-badge';
      date.textContent = formatDate(task.date);
      card.append(date);
    }

    const remove = document.createElement('button');
    remove.className = 'delete-task';
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Delete ' + task.title);
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteTask(task.id));
    card.append(remove);
    return card;
  }

  function appendGroup(label, cards) {
    const group = document.createElement('div');
    group.className = 'time-group';
    const heading = document.createElement('div');
    heading.className = 'time-group-label';
    heading.textContent = label;
    group.append(heading);

    const list = document.createElement('div');
    list.className = 'task-list';
    cards.forEach((card) => list.append(card));
    group.append(list);
    $('#taskList').append(group);
    return list;
  }

  function render() {
    const taskList = $('#taskList');
    taskList.replaceChildren();

    const todays = tasks.filter((task) => task.date === todayKey);
    const doneCount = todays.filter((task) => task.completed).length;
    const remaining = todays.length - doneCount;
    const percent = todays.length ? Math.round(doneCount / todays.length * 100) : 0;

    $('#todayCount').textContent = String(remaining);
    $('#progressPercent').textContent = percent + '%';
    $('#progressRing').setAttribute('aria-label', percent + ' percent complete');
    $('#progressRing').style.background =
      'conic-gradient(var(--green) ' + percent + '%, #d3e3d5 ' + percent + '% 100%)';
    $('#progressBar').style.width = percent + '%';

    $('#progressTitle').textContent = todays.length === 0 ? 'A fresh start'
      : remaining === 0 ? 'Look at you go!'
      : remaining + ' ' + (remaining === 1 ? 'thing' : 'things') + ' to go';
    $('#progressText').textContent = todays.length === 0 ? 'Add a few things you’d like to get done.'
      : remaining === 0 ? 'You made space for what matters today.'
      : doneCount + ' of ' + todays.length + ' done. Keep your pace gentle.';

    const copy = {
      today: ['Your plan', 'Add to your day', ''],
      upcoming: ['A little further ahead', 'Plan a day', 'COMING UP'],
      done: ['Look what you did', 'Add another task', 'YOUR WINS']
    }[currentView];

    $('#sectionTitle').textContent = copy[0];
    $('#addButtonLabel').textContent = copy[1];
    $('#sectionKicker').textContent = currentView === 'today'
      ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
          .format(today).toUpperCase()
      : copy[2];
    $('#sortButton').setAttribute('aria-label',
      sortByTime ? 'Sort tasks by time' : 'Sort tasks in the order added');

    const selected = visibleTasks().sort((a, b) => {
      if (currentView === 'upcoming' && a.date !== b.date) return a.date.localeCompare(b.date);
      if (currentView === 'done') return (b.completedAt || '').localeCompare(a.completedAt || '');
      if (!sortByTime) return (a.createdAt || '').localeCompare(b.createdAt || '');
      return (a.time || '99:99').localeCompare(b.time || '99:99') ||
        (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    if (!selected.length) {
      renderEmptyState();
      return;
    }

    if (currentView === 'today') {
      const timed = selected.filter((task) => task.time);
      const flexible = selected.filter((task) => !task.time);
      if (timed.length) appendGroup('ON THE CLOCK', timed.map((task) => createTaskCard(task)));
      if (flexible.length) {
        appendGroup(timed.length ? 'WHENEVER IT FITS' : 'YOUR FLEXIBLE TASKS',
          flexible.map((task) => createTaskCard(task)));
      }
    } else if (currentView === 'upcoming') {
      let currentDate = '';
      let list;
      selected.forEach((task) => {
        if (task.date !== currentDate) {
          currentDate = task.date;
          list = appendGroup(formatDate(currentDate, {
            weekday: 'long', month: 'long', day: 'numeric'
          }).toUpperCase(), []);
        }
        list.append(createTaskCard(task));
      });
    } else {
      appendGroup('COMPLETED', selected.map((task) => createTaskCard(task)));
    }
  }

  function renderEmptyState() {
    const state = document.createElement('div');
    state.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-illustration';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = currentView === 'done' ? '✓' : currentView === 'upcoming' ? '↗' : '✳';

    const title = document.createElement('h3');
    const body = document.createElement('p');
    if (currentView === 'today') {
      title.textContent = 'A little breathing room.';
      body.textContent = 'Add a task or make a time block when you’re ready. Your day can start small.';
    } else if (currentView === 'upcoming') {
      title.textContent = 'Nothing on the horizon.';
      body.textContent = 'Plan something for another day and it’ll be waiting here for you.';
    } else {
      title.textContent = 'Your wins will land here.';
      body.textContent = 'Check off a task when it’s done. We’ll keep a little record of it.';
    }
    state.append(icon, title, body);
    $('#taskList').append(state);
  }

  function renderPresetChips() {
    const container = $('#presetChips');
    container.replaceChildren();

    presets.forEach((preset) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip';
      chip.setAttribute('aria-label', 'Use shortcut ' + preset.title +
        (preset.time ? ' at ' + formatTime(preset.time) : ''));

      const title = document.createElement('span');
      title.textContent = preset.title;
      chip.append(title);
      if (preset.time) {
        const time = document.createElement('small');
        time.textContent = formatTime(preset.time);
        chip.append(time);
      }

      chip.addEventListener('click', () => {
        $('#taskTitle').value = preset.title;
        $('#taskTime').value = preset.time;
        $('#taskTitle').focus();
        showToast('Shortcut added. You can edit the task before saving.');
      });
      container.append(chip);
    });
  }

  function renderPresetEditor() {
    const container = $('#presetEditor');
    container.replaceChildren();

    presetDraft.forEach((preset, index) => {
      const row = document.createElement('div');
      row.className = 'preset-editor-row';

      const title = document.createElement('input');
      title.type = 'text';
      title.maxLength = 45;
      title.placeholder = 'Shortcut name';
      title.setAttribute('aria-label', 'Shortcut name');
      title.value = preset.title;
      title.addEventListener('input', () => {
        presetDraft[index].title = title.value;
        updatePresetSaveButton();
      });

      const time = document.createElement('input');
      time.type = 'time';
      time.value = preset.time;
      time.setAttribute('aria-label', 'Optional shortcut time');
      time.addEventListener('input', () => {
        presetDraft[index].time = time.value;
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'preset-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + (preset.title || 'shortcut'));
      remove.addEventListener('click', () => {
        presetDraft.splice(index, 1);
        renderPresetEditor();
      });

      row.append(title, time, remove);
      container.append(row);
    });
    updatePresetSaveButton();
  }

  function updatePresetSaveButton() {
    $('#savePresets').disabled = presetDraft.some((preset) => !preset.title.trim());
  }

  function openPresetEditor() {
    presetDraft = presets.map((preset) => ({ ...preset }));
    renderPresetEditor();
    $('#taskForm').hidden = true;
    $('#presetManager').hidden = false;
  }

  function closePresetEditor(save) {
    if (save) {
      if (presetDraft.some((preset) => !preset.title.trim())) {
        showToast('Name each shortcut or remove it before saving.');
        return;
      }
      presets = presetDraft.map((preset) => ({
        id: preset.id || makeId(),
        title: preset.title.trim(),
        time: preset.time || ''
      }));
      try {
        localStorage.setItem(presetStorageKey, JSON.stringify(presets));
      } catch {
        showToast('Could not save shortcuts on this device.');
      }
      renderPresetChips();
      showToast('Your shortcuts are updated.');
    }
    $('#presetManager').hidden = true;
    $('#taskForm').hidden = false;
    $('#taskTitle').focus();
  }

  function toggleTask(id) {
    tasks = tasks.map((task) => task.id === id ? {
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null
    } : task);
    saveTasks();
    render();
    if (navigator.vibrate) navigator.vibrate(12);
    const changed = tasks.find((task) => task.id === id);
    if (changed && changed.completed) showToast('One thing at a time. Nicely done.');
  }

  function deleteTask(id) {
    tasks = tasks.filter((task) => task.id !== id);
    saveTasks();
    render();
    showToast('Task removed from your plan.');
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll('.view-tab').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.bottom-nav-item').forEach((button) =>
      button.classList.toggle('selected', button.dataset.view === view)
    );
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextDateKey() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toDateKey(date);
  }

  function openSheet() {
    $('#taskDate').value = currentView === 'upcoming' ? nextDateKey() : todayKey;
    $('#taskForm').hidden = false;
    $('#presetManager').hidden = true;
    $('#sheetBackdrop').hidden = false;
    $('#taskSheet').hidden = false;
    setTimeout(() => $('#taskTitle').focus(), 40);
  }

  function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    $('#taskSheet').hidden = true;
    $('#taskForm').hidden = false;
    $('#presetManager').hidden = true;
    $('#taskForm').reset();
    $('#taskDate').value = todayKey;
  }

  $('#addButton').addEventListener('click', openSheet);
  $('#closeSheet').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  $('#editPresets').addEventListener('click', openPresetEditor);
  $('#cancelPresetEdit').addEventListener('click', () => closePresetEditor(false));
  $('#addPreset').addEventListener('click', () => {
    presetDraft.push({ id: makeId(), title: '', time: '' });
    renderPresetEditor();
    $('#presetEditor').lastElementChild?.querySelector('input')?.focus();
  });
  $('#savePresets').addEventListener('click', () => closePresetEditor(true));

  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    if (!title) return;

    const date = String(data.get('date'));
    tasks.push({
      id: makeId(),
      title,
      date,
      time: String(data.get('time') || ''),
      completed: false,
      createdAt: new Date().toISOString()
    });
    saveTasks();
    closeSheet();
    currentView = date > todayKey ? 'upcoming' : 'today';
    document.querySelectorAll('.view-tab').forEach((button) => {
      const active = button.dataset.view === currentView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.bottom-nav-item').forEach((button) =>
      button.classList.toggle('selected', button.dataset.view === currentView)
    );
    render();
    showToast('Added. Your plan is taking shape.');
  });

  document.querySelectorAll('[data-view]').forEach((button) =>
    button.addEventListener('click', () => setView(button.dataset.view))
  );
  $('#sortButton').addEventListener('click', () => {
    sortByTime = !sortByTime;
    render();
    showToast(sortByTime ? 'Timed tasks come first.' : 'Showing tasks in the order added.');
  });
  $('#moreButton').addEventListener('click', () =>
    showToast('Your tasks are saved on this device.')
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#taskSheet').hidden) closeSheet();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    $('#installButton').hidden = false;
  });
  $('#installButton').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('#installButton').hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    $('#installButton').hidden = true;
    showToast('Dayflow is ready on your home screen.');
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register('./service-worker.js').catch(() => {})
    );
  }

  renderPresetChips();
  render();
})();
