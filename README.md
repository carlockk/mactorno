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

Create the portable Windows executable:

```bash
npm run dist:portable
```

Create the Windows installer:

```bash
npm run dist:installer
```

Create both Windows distributables:

```bash
npm run dist:win
```

Create an unpacked app directory for local validation:

```bash
npm run pack:win
```

Build output is written to `release/`.

### Windows Trust Warning

The generated `.exe` does not require Node.js on the target machine.

Windows SmartScreen or "unknown publisher" warnings can still appear until the app is signed with a real code-signing certificate. Packaging alone does not remove that warning.

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
