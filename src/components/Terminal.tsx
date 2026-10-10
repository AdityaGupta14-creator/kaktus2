'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalRef {
  sendCommand: (cmd: string) => void;
  clear: () => void;
  focus: () => void;
}

export const Terminal = forwardRef<TerminalRef>((props, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useImperativeHandle(ref, () => ({
    sendCommand: (cmd: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Ensure command ends with a newline to execute it
        wsRef.current.send(cmd.endsWith('\r') ? cmd : cmd + '\r');
      }
    },
    clear: () => xtermRef.current?.clear(),
    focus: () => xtermRef.current?.focus(),
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'Cascadia Code, Consolas, "SFMono-Regular", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.32,
      scrollback: 5000,
      theme: {
        background: '#111214',
        foreground: '#d7dce2',
        cursor: '#e6edf3',
        selectionBackground: '#264f78',
        black: '#111214',
        brightBlack: '#727985',
        brightWhite: '#f0f4f8',
      }
    });
    xtermRef.current = term;
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    const sendResize = () => {
      const ws = wsRef.current;
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }));
    };
    const fitTerminal = () => {
      try {
        fitAddon.fit();
        sendResize();
      } catch { /* The drawer can be mid-animation. */ }
    };
    const initialFit = window.setTimeout(() => {
      fitTerminal();
      term.focus();
    }, 40);
    const resizeObserver = new ResizeObserver(fitTerminal);
    resizeObserver.observe(terminalRef.current);
    let handleWindowResize: (() => void) | undefined;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    
    // Support production via env var, with a strict local development fallback
    let wsUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL;
    if (!wsUrl && process.env.NODE_ENV === 'development') {
      wsUrl = `${protocol}//${hostname}:3001`;
    }

    if (!wsUrl) {
      term.write('\r\n*** Terminal unavailable: WebSocket URL not configured. ***\r\n');
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.write('\r\n*** Connected to local terminal ***\r\n\r\n');
      sendResize();
      term.focus();
      handleWindowResize = () => {
        fitTerminal();
      };
      window.addEventListener('resize', handleWindowResize);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          term.write(reader.result as string);
        };
        reader.readAsText(event.data);
      } else {
        term.write(event.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(initialFit);
      if (handleWindowResize) window.removeEventListener('resize', handleWindowResize);
      if (wsRef.current === ws) wsRef.current = null;
      xtermRef.current = null;
      term.dispose();
      ws.close();
    };
  }, []);

  return (
    <div
      className="h-full w-full overflow-hidden bg-[#111214]"
      onClick={() => xtermRef.current?.focus()}
      title="Click to type in the terminal"
    >
      <div ref={terminalRef} className="h-full w-full px-3 py-2" />
    </div>
  );
});
Terminal.displayName = 'Terminal';
