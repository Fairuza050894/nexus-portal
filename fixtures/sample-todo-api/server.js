const http = require('node:http');

const todos = [];
const routes = [];

const app = {
  get(path, handler) {
    routes.push({ method: 'GET', path, handler });
  },
  post(path, handler) {
    routes.push({ method: 'POST', path, handler });
  },
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

app.get('/', (_req, res) => {
  sendHtml(
    res,
    [
      '<!doctype html><html lang="en"><head><title>Todo API</title></head><body>',
      '<h1>Todo API</h1>',
      '<nav><a href="/health">health</a> <a href="/api/todos">todos</a></nav>',
      '<form method="post" action="/api/todos">',
      '<label>Text <input name="text" required></label>',
      '<button type="submit">Create</button>',
      '</form>',
      '</body></html>',
    ].join(''),
  );
});

app.get('/health', (_req, res) => {
  send(res, 200, { ok: true });
});

app.get('/api/todos', (_req, res) => {
  send(res, 200, todos);
});

app.post('/api/todos', async (req, res) => {
  try {
    const body = await readJson(req);
    if (typeof body.text !== 'string' || body.text.trim() === '') {
      send(res, 422, { error: 'text is required' });
      return;
    }
    const todo = { id: todos.length + 1, text: body.text, done: false };
    todos.push(todo);
    send(res, 201, todo);
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = routes.find(
    (candidate) => candidate.method === req.method && candidate.path === url.pathname,
  );
  if (!route) {
    send(res, 404, { error: 'not found' });
    return;
  }
  await route.handler(req, res, url);
});

const port = Number(process.env.PORT || 3100);
server.listen(port, '127.0.0.1', () => {
  console.log(`sample-todo-api listening on ${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
