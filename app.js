(() => {
  const $ = (selector) => document.querySelector(selector);
  const today = new Date();
  const todayKey = toDateKey(today);
  const taskStorageKey = 'dayflow.tasks.v1';
  const presetStorageKey = 'dayflow.presets.v1';
  const reminderSettingsStorageKey = 'dayflow.reminder-settings.v1';
  const reminderHistoryStorageKey = 'dayflow.reminders.sent.v1';
  const reminderDeliveryGraceMs = 5 * 60 * 1000;
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
  let reminderSettings = readReminderSettings();
  let sentReminders = readSentReminders();
  let presetDraft = [];
  let deferredInstall = null;
  let toastTimer = null;
  let remindersChecking = false;
  let editingTaskId = null;

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

  const repeatDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function normalizeRepeatDays(days) {
    if (!Array.isArray(days)) return [];
    return [...new Set(days.map(Number).filter((day) =>
      Number.isInteger(day) && day >= 0 && day <= 6
    ))].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  }

  function dateFromKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function addDaysToKey(dateKey, amount) {
    const date = dateFromKey(dateKey);
    date.setDate(date.getDate() + amount);
    return toDateKey(date);
  }

  function readTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(taskStorageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((task) =>
        task && typeof task.id === 'string' && typeof task.title === 'string' &&
        typeof task.date === 'string'
      ).map((task) => ({
        ...task,
        repeatDays: normalizeRepeatDays(task.repeatDays),
        completedDates: Array.isArray(task.completedDates)
          ? task.completedDates.filter((date) => typeof date === 'string') : [],
        completedAtByDate: task.completedAtByDate && typeof task.completedAtByDate === 'object'
          ? task.completedAtByDate : {}
      })) : [];
    } catch {
      return [];
    }
  }

  function occurrenceOn(task, dateKey) {
    const repeatDays = normalizeRepeatDays(task.repeatDays);
    if (repeatDays.length) {
      if (dateKey < task.date || !repeatDays.includes(dateFromKey(dateKey).getDay())) return null;
      const completed = task.completedDates.includes(dateKey);
      return {
        ...task,
        date: dateKey,
        occurrenceDate: dateKey,
        isRecurring: true,
        completed,
        completedAt: task.completedAtByDate[dateKey] || (completed ? dateKey + 'T00:00:00' : null)
      };
    }
    if (task.date !== dateKey) return null;
    return { ...task, occurrenceDate: dateKey, isRecurring: false };
  }

  function occurrencesOn(dateKey) {
    return tasks.map((task) => occurrenceOn(task, dateKey)).filter(Boolean);
  }

  function firstRepeatDateOnOrAfter(startDate, repeatDays) {
    const days = normalizeRepeatDays(repeatDays);
    if (!days.length) return null;
    const firstDate = startDate < todayKey ? todayKey : startDate;
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = addDaysToKey(firstDate, offset);
      if (days.includes(dateFromKey(dateKey).getDay())) return dateKey;
    }
    return null;
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

  function readReminderSettings() {
    const defaults = { remindersEnabled: false, quietHoursEnabled: false, quietStart: '22:00', quietEnd: '07:00' };
    try {
      const saved = JSON.parse(localStorage.getItem(reminderSettingsStorageKey) || '{}');
      const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      return {
        remindersEnabled: saved.remindersEnabled === true,
        quietHoursEnabled: saved.quietHoursEnabled === true,
        quietStart: validTime(saved.quietStart) ? saved.quietStart : defaults.quietStart,
        quietEnd: validTime(saved.quietEnd) ? saved.quietEnd : defaults.quietEnd
      };
    } catch { return defaults; }
  }

  function readSentReminders() {
    try {
      const saved = JSON.parse(localStorage.getItem(reminderHistoryStorageKey) || '[]');
      return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
    } catch { return new Set(); }
  }

  function saveReminderSettings() {
    try { localStorage.setItem(reminderSettingsStorageKey, JSON.stringify(reminderSettings)); }
    catch { showToast('Could not save notification settings on this device.'); }
  }

  function saveSentReminders() {
    try { localStorage.setItem(reminderHistoryStorageKey, JSON.stringify([...sentReminders].slice(-500))); }
    catch { /* Keep the in-memory history for this session. */ }
  }

  function reminderKey(task) { return task.id + ':' + task.date + ':' + task.time; }

  function localTaskTime(task) {
    if (!task.date || !task.time) return NaN;
    const [year, month, day] = task.date.split('-').map(Number);
    const [hour, minute] = task.time.split(':').map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return NaN;
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  }

  function isQuietHours(now) {
    if (!reminderSettings.quietHoursEnabled) return false;
    const [sh, sm] = reminderSettings.quietStart.split(':').map(Number);
    const [eh, em] = reminderSettings.quietEnd.split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  function updateReminderSettingsUI() {
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const permission = supported ? Notification.permission : 'unsupported';
    $('#remindersToggle').disabled = !supported;
    $('#remindersToggle').checked = reminderSettings.remindersEnabled && permission === 'granted';
    $('#quietHoursToggle').checked = reminderSettings.quietHoursEnabled;
    $('#quietStart').value = reminderSettings.quietStart;
    $('#quietEnd').value = reminderSettings.quietEnd;
    $('#quietHoursFields').hidden = !reminderSettings.quietHoursEnabled;
    let status = 'Off. Turn this on to request permission and receive notifications at timed tasks.';
    if (!supported) status = 'Notifications are not supported in this browser.';
    else if (permission === 'denied') status = 'Notifications are blocked in browser settings. Allow them there to turn reminders on.';
    else if (reminderSettings.remindersEnabled && permission === 'granted') {
      status = 'On. Dayflow checks for reminders while it is open; Android may pause it in the background.';
    }
    $('#remindersStatus').textContent = status;
  }

  async function showTaskReminder(task) {
    const title = 'Time for ' + task.title;
    const options = {
      body: 'Scheduled for ' + formatTime(task.time) + '.',
      icon: './icons/dayflow-192.png',
      badge: './icons/dayflow-192.png',
      tag: 'dayflow-task-' + task.id + '-' + task.date,
      data: { url: './' }
    };
    try {
      const registration = await navigator.serviceWorker.ready;
      if (typeof registration.showNotification === 'function') {
        await registration.showNotification(title, options);
        return true;
      }
    } catch { /* Fall back to a page notification if the worker is unavailable. */ }
    try {
      new Notification(title, options);
      return true;
    } catch {
      showToast('Could not show a reminder. Check notification permission.');
      return false;
    }
  }

  async function checkTaskReminders() {
    if (remindersChecking || !reminderSettings.remindersEnabled ||
        !('Notification' in window) || Notification.permission !== 'granted') return;
    remindersChecking = true;
    try {
      const now = new Date();
      for (const task of occurrencesOn(toDateKey(now))) {
        if (task.completed || !task.time) continue;
        const key = reminderKey(task);
        if (sentReminders.has(key)) continue;
        const dueAt = localTaskTime(task);
        if (!Number.isFinite(dueAt)) continue;
        const lateness = now.getTime() - dueAt;
        if (lateness < 0) continue;
        if (lateness > reminderDeliveryGraceMs || isQuietHours(new Date(dueAt)) || isQuietHours(now)) {
          sentReminders.add(key);
          saveSentReminders();
          continue;
        }
        await showTaskReminder(task);
        sentReminders.add(key);
        saveSentReminders();
      }
    } finally { remindersChecking = false; }
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
    if (currentView === 'today') return occurrencesOn(todayKey);

    if (currentView === 'upcoming') {
      const horizon = addDaysToKey(todayKey, 14);
      const upcoming = [];
      tasks.forEach((task) => {
        const repeatDays = normalizeRepeatDays(task.repeatDays);
        if (!repeatDays.length) {
          if (task.date > todayKey && !task.completed) {
            upcoming.push({ ...task, occurrenceDate: task.date, isRecurring: false });
          }
          return;
        }
        for (let offset = 1; offset <= 14; offset += 1) {
          const occurrence = occurrenceOn(task, addDaysToKey(todayKey, offset));
          if (occurrence && !occurrence.completed) upcoming.push(occurrence);
        }
        if (task.date > horizon) {
          const firstDate = firstRepeatDateOnOrAfter(task.date, repeatDays);
          if (firstDate && firstDate > horizon) {
            const occurrence = occurrenceOn(task, firstDate);
            if (occurrence && !occurrence.completed) upcoming.push(occurrence);
          }
        }
      });
      return upcoming;
    }

    const earliest = addDaysToKey(todayKey, -60);
    const completed = [];
    tasks.forEach((task) => {
      const repeatDays = normalizeRepeatDays(task.repeatDays);
      if (!repeatDays.length) {
        if (task.completed) completed.push({ ...task, occurrenceDate: task.date, isRecurring: false });
        return;
      }
      task.completedDates.filter((date) => date <= todayKey && date >= earliest).forEach((date) => {
        const occurrence = occurrenceOn(task, date);
        if (occurrence) completed.push(occurrence);
      });
    });
    return completed;
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
    check.addEventListener('click', () => toggleTask(task.id, task.occurrenceDate || task.date));

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
    if (task.isRecurring) {
      const repeat = document.createElement('span');
      repeat.className = 'repeat-label';
      repeat.textContent = 'Weekly · ' + normalizeRepeatDays(task.repeatDays).map((day) => repeatDayNames[day]).join(', ');
      meta.append(repeat);
    }

    content.append(title, meta);
    card.append(check, content);

    if (upcoming || currentView === 'done') {
      const date = document.createElement('span');
      date.className = 'task-date-badge';
      date.textContent = formatDate(task.date);
      card.append(date);
    }

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const edit = document.createElement('button');
    edit.className = 'edit-task';
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', 'Edit task ' + task.title + (task.isRecurring ? ' and its weekly schedule' : ''));
    edit.addEventListener('click', () => openEditTask(task.id));

    const remove = document.createElement('button');
    remove.className = 'delete-task';
    remove.type = 'button';
    remove.setAttribute('aria-label', task.isRecurring ? 'Delete weekly task ' + task.title : 'Delete ' + task.title);
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteTask(task.id));

    actions.append(edit, remove);
    card.append(actions);
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

    const todays = occurrencesOn(todayKey);
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
    $('#sheetTitle').textContent = 'Add something to your day';
    $('#taskForm').hidden = true;
    $('#settingsPanel').hidden = true;
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
    $('#settingsPanel').hidden = true;
    $('#sheetTitle').textContent = 'Add something to your day';
    $('#taskForm').hidden = false;
    $('#taskTitle').focus();
  }

  function openSettings() {
    $('#sheetTitle').textContent = 'Reminders and quiet hours';
    $('#taskForm').hidden = true;
    $('#presetManager').hidden = true;
    $('#settingsPanel').hidden = false;
    $('#sheetBackdrop').hidden = false;
    $('#taskSheet').hidden = false;
    updateReminderSettingsUI();
  }

  async function setRemindersEnabled(enabled) {
    if (!enabled) {
      reminderSettings.remindersEnabled = false;
      saveReminderSettings();
      updateReminderSettingsUI();
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      reminderSettings.remindersEnabled = false;
      updateReminderSettingsUI();
      showToast('Notifications are not supported in this browser.');
      return;
    }
    let permission = Notification.permission;
    try {
      if (permission === 'default') permission = await Notification.requestPermission();
    } catch { permission = 'denied'; }
    if (permission !== 'granted') {
      reminderSettings.remindersEnabled = false;
      saveReminderSettings();
      updateReminderSettingsUI();
      showToast('Allow notifications in browser settings to use reminders.');
      return;
    }
    reminderSettings.remindersEnabled = true;
    saveReminderSettings();
    updateReminderSettingsUI();
    showToast('Task reminders are on.');
    checkTaskReminders();
  }

  function saveQuietHoursFromControls() {
    reminderSettings.quietHoursEnabled = $('#quietHoursToggle').checked;
    reminderSettings.quietStart = $('#quietStart').value || '22:00';
    reminderSettings.quietEnd = $('#quietEnd').value || '07:00';
    saveReminderSettings();
    $('#quietHoursFields').hidden = !reminderSettings.quietHoursEnabled;
  }

  function toggleTask(id, occurrenceDate = todayKey) {
    const now = new Date();
    let didComplete = false;
    tasks = tasks.map((task) => {
      if (task.id !== id) return task;
      if (normalizeRepeatDays(task.repeatDays).length) {
        const completedDates = new Set(task.completedDates || []);
        didComplete = !completedDates.has(occurrenceDate);
        const completedAtByDate = { ...(task.completedAtByDate || {}) };
        if (didComplete) {
          completedDates.add(occurrenceDate);
          completedAtByDate[occurrenceDate] = now.toISOString();
        } else {
          completedDates.delete(occurrenceDate);
          delete completedAtByDate[occurrenceDate];
        }
        return {
          ...task,
          completed: false,
          completedAt: null,
          completedDates: [...completedDates],
          completedAtByDate
        };
      }
      didComplete = !task.completed;
      return {
        ...task,
        completed: didComplete,
        completedAt: didComplete ? now.toISOString() : null
      };
    });
    saveTasks();
    render();
    if (navigator.vibrate) navigator.vibrate(12);
    if (didComplete) showToast('One thing at a time. Nicely done.');
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

  function updateRepeatUI() {
    const selected = [...document.querySelectorAll('input[name="repeatDays"]:checked')]
      .map((input) => Number(input.value))
      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    $('#taskDateLabel').textContent = selected.length ? 'Starts on' : 'Day';
    $('#repeatHelp').textContent = selected.length
      ? 'Repeats weekly on ' + selected.map((day) => repeatDayNames[day]).join(', ') + '.'
      : 'Leave days clear for a one-time task.';
  }

  function openEditTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    editingTaskId = id;
    $('#taskForm').reset();
    $('#sheetTitle').textContent = 'Edit your task';
    $('#taskSubmitLabel').textContent = 'Save changes';
    $('#taskTitle').value = task.title;
    $('#taskDate').value = task.date;
    $('#taskDate').removeAttribute('min');
    $('#taskTime').value = task.time || '';
    const repeatDays = normalizeRepeatDays(task.repeatDays);
    document.querySelectorAll('input[name="repeatDays"]').forEach((input) => {
      input.checked = repeatDays.includes(Number(input.value));
    });
    updateRepeatUI();
    if (repeatDays.length) {
      $('#repeatHelp').textContent += ' Changes apply to all future repeats.';
    }
    $('#taskForm').hidden = false;
    $('#presetManager').hidden = true;
    $('#settingsPanel').hidden = true;
    $('#sheetBackdrop').hidden = false;
    $('#taskSheet').hidden = false;
    setTimeout(() => $('#taskTitle').focus(), 40);
  }

  function openSheet() {
    editingTaskId = null;
    $('#taskForm').reset();
    $('#taskDate').value = currentView === 'upcoming' ? nextDateKey() : todayKey;
    $('#taskDate').min = todayKey;
    $('#sheetTitle').textContent = 'Add something to your day';
    $('#taskSubmitLabel').textContent = 'Add to my plan';
    updateRepeatUI();
    $('#taskForm').hidden = false;
    $('#presetManager').hidden = true;
    $('#settingsPanel').hidden = true;
    $('#sheetBackdrop').hidden = false;
    $('#taskSheet').hidden = false;
    setTimeout(() => $('#taskTitle').focus(), 40);
  }

  function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    $('#taskSheet').hidden = true;
    $('#taskForm').hidden = false;
    $('#presetManager').hidden = true;
    $('#settingsPanel').hidden = true;
    $('#sheetTitle').textContent = 'Add something to your day';
    $('#taskForm').reset();
    $('#taskSubmitLabel').textContent = 'Add to my plan';
    $('#taskDate').min = todayKey;
    $('#taskDate').value = todayKey;
    editingTaskId = null;
    updateRepeatUI();
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
  $('#remindersToggle').addEventListener('change', (event) => setRemindersEnabled(event.currentTarget.checked));
  $('#quietHoursToggle').addEventListener('change', saveQuietHoursFromControls);
  $('#quietStart').addEventListener('change', saveQuietHoursFromControls);
  $('#quietEnd').addEventListener('change', saveQuietHoursFromControls);
  document.querySelectorAll('input[name="repeatDays"]').forEach((input) => input.addEventListener('change', updateRepeatUI));

  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    if (!title) return;

    const date = String(data.get('date') || '');
    const time = String(data.get('time') || '');
    const repeatDays = normalizeRepeatDays(data.getAll('repeatDays'));
    const isEditing = Boolean(editingTaskId);
    const editedId = editingTaskId;
    if (isEditing) {
      const existing = tasks.find((task) => task.id === editedId);
      if (!existing) return;
      tasks = tasks.map((task) => {
        if (task.id !== editedId) return task;
        const oldRepeatDays = normalizeRepeatDays(task.repeatDays);
        const completedDates = new Set(task.completedDates || []);
        if (task.completed && task.date) completedDates.add(task.date);
        if (repeatDays.length) {
          return {
            ...task,
            title,
            date,
            time,
            repeatDays,
            completed: false,
            completedAt: null,
            completedDates: [...completedDates],
            completedAtByDate: task.completedAtByDate || {}
          };
        }
        const wasCompleted = oldRepeatDays.length
          ? completedDates.has(date)
          : task.completed && task.date === date;
        return {
          ...task,
          title,
          date,
          time,
          repeatDays: [],
          completed: wasCompleted,
          completedAt: wasCompleted ? task.completedAt || task.completedAtByDate?.[date] || null : null,
          completedDates: [...completedDates],
          completedAtByDate: task.completedAtByDate || {}
        };
      });
    } else {
      tasks.push({
        id: makeId(),
        title,
        date,
        time,
        repeatDays,
        completed: false,
        completedDates: [],
        completedAtByDate: {},
        createdAt: new Date().toISOString()
      });
    }

    saveTasks();
    closeSheet();
    if (repeatDays.length) {
      const firstOccurrence = firstRepeatDateOnOrAfter(date, repeatDays);
      currentView = firstOccurrence === todayKey ? 'today' : 'upcoming';
    } else if (date > todayKey) currentView = 'upcoming';
    else if (date < todayKey && tasks.find((task) => task.id === editedId)?.completed) currentView = 'done';
    else currentView = 'today';

    document.querySelectorAll('.view-tab').forEach((button) => {
      const active = button.dataset.view === currentView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.bottom-nav-item').forEach((button) =>
      button.classList.toggle('selected', button.dataset.view === currentView)
    );
    render();
    showToast(isEditing ? 'Your changes are saved.' : 'Added. Your plan is taking shape.');
  });
  document.querySelectorAll('[data-view]').forEach((button) =>
    button.addEventListener('click', () => setView(button.dataset.view))
  );
  $('#sortButton').addEventListener('click', () => {
    sortByTime = !sortByTime;
    render();
    showToast(sortByTime ? 'Timed tasks come first.' : 'Showing tasks in the order added.');
  });
  $('#moreButton').addEventListener('click', openSettings);
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
  updateReminderSettingsUI();
  checkTaskReminders();
  window.setInterval(checkTaskReminders, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkTaskReminders();
  });
  window.addEventListener('focus', checkTaskReminders);
})();

