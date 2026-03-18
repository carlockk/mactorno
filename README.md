# Mactorno

Mactorno is an Electron desktop launcher for Windows with a macOS-inspired shell, dock, embedded browser, and local system integrations.

## Development

Install dependencies:

```bash
npm install
```

Run the web UI only:

```bash
npm run dev
```

Run the Electron desktop app:

```bash
npm run dev:desktop
```

## Windows Packaging

This project is configured to package as a Windows desktop app with `electron-builder`.

Create Windows distributables:

```bash
npm run dist:win
```

Create an unpacked app directory for local validation:

```bash
npm run pack:win
```

Build output is written to `release/`.

## Product Direction

Mactorno can evolve into a Windows launcher and system control surface, but that should be built in phases.

Good near-term scope:

- Launch installed apps
- Show real system information
- Expose selected system controls
- Provide a desktop-style shell inside Electron

High-risk scope that requires strict privilege boundaries and more testing:

- Administrative actions that trigger UAC
- Real file management against user directories
- Startup integration
- Replacing or competing with Explorer as a full shell

If Mactorno grows into that second category, the architecture should stay clearly split between:

- Renderer UI
- Electron main process
- Explicit IPC APIs for privileged Windows actions
