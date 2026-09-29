// Order Service - a small, container-ready REST API
// Designed to run the same way on your laptop (Docker) and on AWS ECS.

const express = require('express');
const os = require('os');

// ---------- Configuration comes from environment variables ----------
// (Never hardcode config inside the image. In ECS these come from the Task Definition.)
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const ENVIRONMENT = process.env.ENVIRONMENT || 'local';

const app = express();
app.use(express.json());

// ---------- Request logging to stdout ----------
// Containers should log to stdout/stderr, not to files.
// Docker shows these with `docker logs`; ECS ships them to CloudWatch Logs.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      level: 'info',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    }));
  });
  next();
});

// ---------- In-memory data (temporary) ----------
// Lost when the container restarts, and NOT shared between containers.
// Later lessons replace this with a real database (e.g. RDS).
const orders = [
  { id: 1, item: 'Laptop', quantity: 1 },
  { id: 2, item: 'Keyboard', quantity: 2 },
];
let nextId = 3;

// ---------- Routes ----------

// Home: shows WHICH container answered (hostname = container ID).
// Useful later when a load balancer spreads traffic across many ECS tasks.
app.get('/', (req, res) => {
  res.json({
    service: 'order-service',
    message: 'Hello from the Order Service!',
    version: APP_VERSION,
    environment: ENVIRONMENT,
    servedBy: os.hostname(),
  });
});

// Health check: used by Docker, ECS and the ALB to decide if the app is alive.
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// List all orders
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// Get one order by id
app.get('/api/orders/:id', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

// Create an order
app.post('/api/orders', (req, res) => {
  const { item, quantity } = req.body || {};
  if (!item || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({
      error: 'Body must contain "item" (string) and "quantity" (positive integer)',
    });
  }
  const order = { id: nextId++, item, quantity };
  orders.push(order);
  res.status(201).json(order);
});

// Anything else -> 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------- Start server ----------
// Listen on 0.0.0.0 (all interfaces), not 127.0.0.1,
// otherwise traffic from outside the container can't reach the app.
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level: 'info',
    message: `order-service v${APP_VERSION} (${ENVIRONMENT}) listening on port ${PORT}`,
  }));
});

// ---------- Graceful shutdown ----------
// `docker stop` and ECS both send SIGTERM first, wait, then force-kill (SIGKILL).
// We stop accepting new requests, let in-flight ones finish, then exit cleanly.
function shutdown(signal) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level: 'info',
    message: `${signal} received - shutting down gracefully`,
  }));
  server.close(() => process.exit(0));
  // Safety net: force exit if connections don't close in 10 seconds
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
