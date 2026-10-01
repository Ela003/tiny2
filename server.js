const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const port = Number(process.env.PORT) || 3000;
const publicDirectory = path.join(__dirname, 'public');
const dataDirectory = path.join(__dirname, 'data');
const tasksFile = path.join(dataDirectory, 'tasks.json');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

let tasks = [];
let writeQueue = Promise.resolve();

async function loadTasks() {
  try {
    const content = await fs.readFile(tasksFile, 'utf8');
    tasks = JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function saveTasks() {
  const content = JSON.stringify(tasks, null, 2);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(tasksFile, content, 'utf8');
  });
  return writeQueue;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/tasks' && request.method === 'GET') {
    return sendJson(response, 200, tasks);
  }

  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    const body = await readJson(request);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) {
      return sendJson(response, 400, { error: 'Enter a task with up to 200 characters.' });
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.unshift(task);
    await saveTasks();
    return sendJson(response, 201, task);
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)$/i);
  if (taskMatch) {
    const task = tasks.find((item) => item.id === taskMatch[1]);
    if (!task) return sendJson(response, 404, { error: 'Task not found.' });

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      if (typeof body.completed !== 'boolean') {
        return sendJson(response, 400, { error: 'A completed boolean is required.' });
      }
      task.completed = body.completed;
      await saveTasks();
      return sendJson(response, 200, task);
    }

    if (request.method === 'DELETE') {
      tasks = tasks.filter((item) => item.id !== task.id);
      await saveTasks();
      response.writeHead(204);
      return response.end();
    }
  }

  return sendJson(response, 404, { error: 'Endpoint not found.' });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    return handleApi(request, response, url);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    response.writeHead(400);
    return response.end();
  }

  const filePath = path.resolve(publicDirectory, `.${pathname}`);
  if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
    response.writeHead(403);
    return response.end();
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    return response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404);
      return response.end('Not found');
    }
    throw error;
  }
}

async function start() {
  await loadTasks();
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        sendJson(response, error.statusCode || 500, {
          error: error.statusCode ? error.message : 'Something went wrong.',
        });
      } else {
        response.destroy(error);
      }
      if (!error.statusCode) console.error(error);
    });
  });

  server.listen(port, () => {
    console.log(`Daymark is running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Could not start the task server:', error);
  process.exitCode = 1;
});
