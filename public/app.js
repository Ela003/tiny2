const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-input');
const taskList = document.querySelector('#task-list');
const emptyState = document.querySelector('#empty-state');
const statusMessage = document.querySelector('#status-message');
const filterButtons = [...document.querySelectorAll('.filter-button')];
const progressMeter = document.querySelector('.progress-meter');

let tasks = [];
let activeFilter = 'all';

function showError(message) {
  statusMessage.textContent = message;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Could not complete that request.');
  }
  return response.status === 204 ? null : response.json();
}

function visibleTasks() {
  if (activeFilter === 'active') return tasks.filter((task) => !task.completed);
  if (activeFilter === 'completed') return tasks.filter((task) => task.completed);
  return tasks;
}

function updateProgress() {
  const completed = tasks.filter((task) => task.completed).length;
  const total = tasks.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  document.querySelector('#completed-count').textContent = completed;
  document.querySelector('#total-count').textContent = total;
  document.querySelector('#progress-percent').textContent = `${percent}%`;
  document.querySelector('#visible-count').textContent = visibleTasks().length;
  document.querySelector('#progress-fill').style.width = `${percent}%`;
  progressMeter.setAttribute('aria-valuenow', percent);
}

function makeTaskRow(task) {
  const row = document.createElement('li');
  row.className = `task-row${task.completed ? ' is-complete' : ''}`;
  row.dataset.taskId = task.id;

  const checkButton = document.createElement('button');
  checkButton.className = 'task-check';
  checkButton.type = 'button';
  checkButton.dataset.action = 'toggle';
  checkButton.setAttribute('aria-pressed', String(task.completed));
  checkButton.setAttribute('aria-label', `${task.completed ? 'Mark as not done' : 'Mark as done'}: ${task.title}`);
  checkButton.title = task.completed ? 'Mark as not done' : 'Mark as done';

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-button';
  deleteButton.type = 'button';
  deleteButton.dataset.action = 'delete';
  deleteButton.setAttribute('aria-label', `Delete task: ${task.title}`);
  deleteButton.title = 'Delete task';
  deleteButton.textContent = '\u00d7';

  row.append(checkButton, title, deleteButton);
  return row;
}

function renderTasks() {
  const displayed = visibleTasks();
  taskList.replaceChildren(...displayed.map(makeTaskRow));
  taskList.hidden = displayed.length === 0;
  emptyState.hidden = tasks.length > 0;
  updateProgress();
}

async function loadTasks() {
  try {
    tasks = await request('/api/tasks');
    renderTasks();
  } catch (error) {
    showError(error.message);
    emptyState.hidden = true;
  } finally {
    taskList.setAttribute('aria-busy', 'false');
  }
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;

  const button = taskForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showError('');
  try {
    const task = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    tasks.unshift(task);
    taskInput.value = '';
    activeFilter = 'all';
    filterButtons.forEach((filterButton) => {
      const selected = filterButton.dataset.filter === activeFilter;
      filterButton.classList.toggle('is-active', selected);
      filterButton.setAttribute('aria-pressed', String(selected));
    });
    renderTasks();
    taskInput.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle('is-active', selected);
      filterButton.setAttribute('aria-pressed', String(selected));
    });
    renderTasks();
  });
});

taskList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const row = button.closest('.task-row');
  const task = tasks.find((item) => item.id === row.dataset.taskId);
  if (!task) return;

  button.disabled = true;
  showError('');
  try {
    if (button.dataset.action === 'toggle') {
      const updated = await request(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !task.completed }),
      });
      tasks = tasks.map((item) => item.id === task.id ? updated : item);
    } else {
      await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
      tasks = tasks.filter((item) => item.id !== task.id);
    }
    renderTasks();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
  }
});

const today = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date());
document.querySelector('#today-label').textContent = today;
loadTasks();
