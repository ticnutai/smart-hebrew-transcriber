import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn, type ChildProcess } from "child_process";

/**
 * Vite plugin: exposes /__api/start-server and /__api/stop-server
 * to launch/kill the local Whisper Python server from the browser.
 */
function whisperServerLauncher(): Plugin {
  let serverProcess: ChildProcess | null = null;

  return {
    name: 'whisper-server-launcher',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && req.url === '/__api/start-server') {
          if (serverProcess && !serverProcess.killed) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'already running' }));
            return;
          }

          const projectRoot = process.cwd();
          const pythonExe = path.join(projectRoot, 'venv-whisper', 'Scripts', 'python.exe');
          const scriptPath = path.join(projectRoot, 'server', 'transcribe_server.py');

          try {
            serverProcess = spawn(pythonExe, [scriptPath, '--port', '8765'], {
              cwd: projectRoot,
              stdio: 'pipe',
              detached: false,
            });

            serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[whisper] ${d}`));
            serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[whisper] ${d}`));
            serverProcess.on('exit', (code) => {
              console.log(`[whisper] server exited with code ${code}`);
              serverProcess = null;
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'started' }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/__api/stop-server') {
          if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGTERM');
            serverProcess = null;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'stopped' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'not running' }));
          }
          return;
        }

        if (req.method === 'GET' && req.url === '/__api/server-status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ running: !!(serverProcess && !serverProcess.killed) }));
          return;
        }

        next();
      });

      // Kill server process on Vite shutdown
      server.httpServer?.on('close', () => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGTERM');
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      host: "localhost",
      port: 8080,
    },
    // Allow Cloudflare Tunnel and other external origins
    allowedHosts: ['localhost', '.trycloudflare.com'],
  },
  plugins: [react(), mode === "development" && componentTagger(), whisperServerLauncher()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React framework
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI component library
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-tooltip', '@radix-ui/react-select', '@radix-ui/react-tabs'],
          // Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Heavy utilities
          'vendor-utils': ['jszip', 'file-saver', 'lucide-react'],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
}));
