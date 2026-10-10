const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Start Next.js server on port 3000
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });
  
  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Next.js ready on http://localhost:3000');
  });

  // Start Terminal WebSocket server on port 3001 (Bound exclusively to 127.0.0.1 for local isolation)
  const isDev = process.env.NODE_ENV !== 'production';
  const terminalHost = '127.0.0.1';
  const wss = new WebSocketServer({ port: 3001, host: terminalHost });

  wss.on('connection', (ws, req) => {
    // 1. Production environment boundary: disable raw host shell in production unless explicitly opted in
    if (!isDev && process.env.ENABLE_LOCAL_TERMINAL !== 'true') {
      console.warn('[Security] Rejected terminal connection: Shell disabled in production environment');
      ws.send('\r\n[Security: Interactive shell disabled in production deployment]\r\n');
      ws.close(1008, 'Forbidden in production');
      return;
    }

    // 2. Strict origin check to prevent Cross-Site WebSocket Hijacking (CSWSH)
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://localhost:3000',
      'https://127.0.0.1:3000'
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      console.warn(`[Security] Blocked unauthorized terminal connection from origin: ${origin}`);
      ws.send(`\r\n[Security: Unauthorized origin '${origin}'. Connection terminated.]\r\n`);
      ws.close(1008, 'Unauthorized origin');
      return;
    }

    console.log(`[Security] Terminal WebSocket authenticated for local origin from ${req.socket.remoteAddress}`);
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    try {
      const terminalProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: process.cwd(),
        env: process.env,
      });

      terminalProcess.onData((data) => {
        if (ws.readyState === ws.OPEN) ws.send(data);
      });

      terminalProcess.onExit(({ exitCode }) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(`\r\n[Terminal process exited with code ${exitCode}]\r\n`);
        }
      });

      ws.on('message', (message) => {
        const data = message.toString();
        try {
          const payload = JSON.parse(data);
          if (payload?.type === 'resize' && Number.isFinite(payload.cols) && Number.isFinite(payload.rows)) {
            terminalProcess.resize(Math.max(2, Math.floor(payload.cols)), Math.max(1, Math.floor(payload.rows)));
            return;
          }
        } catch {
          // User input is plain terminal data, not a control message.
        }
        terminalProcess.write(data);
      });

      ws.on('close', () => {
        terminalProcess.kill();
      });
    } catch (err) {
      console.error("Failed to spawn shell process:", err);
      ws.send(`\r\nError starting terminal: ${err.message}\r\n`);
    }
  });

  console.log('> Terminal WS ready on ws://localhost:3001');

  // ─── Auto-start FastAPI Backend (Arduino Flash Server) on port 8000 ───
  const backendDir = path.join(__dirname, 'backend');
  const venvPython = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
  const mainPy = path.join(backendDir, 'main.py');

  // Check if backend files exist
  const fs = require('fs');
  if (fs.existsSync(mainPy)) {
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';
    
    const backend = spawn(pythonCmd, ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    backend.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`> [Backend] ${msg}`);
    });

    backend.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`> [Backend] ${msg}`);
    });

    backend.on('error', (err) => {
      console.warn(`> [Backend] Failed to start: ${err.message}`);
      console.warn('> [Backend] Arduino flash features will be unavailable. Install Python and run: pip install fastapi uvicorn pyserial');
    });

    backend.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.warn(`> [Backend] Exited with code ${code}`);
      }
    });

    // Kill backend when main server exits
    process.on('exit', () => { try { backend.kill(); } catch {} });
    process.on('SIGINT', () => { try { backend.kill(); } catch {} process.exit(); });
    process.on('SIGTERM', () => { try { backend.kill(); } catch {} process.exit(); });

    console.log('> Arduino Flash backend starting on http://localhost:8000');
  } else {
    console.warn('> [Backend] backend/main.py not found — Arduino flash features disabled');
  }
});
