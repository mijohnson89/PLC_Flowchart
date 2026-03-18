# PLC UML Generator

A desktop application for creating PLC flowchart and sequence diagrams, built for use alongside Rockwell Automation Studio 5000. It supports Add-On Instruction (AOI) and UDT library management, instance tracking with Plant/Area/Location hierarchy, and a Cause & Effect Matrix for documenting sequence-to-device relationships.

---

## Features

- **Flowchart & Sequence diagrams** — Visual diagram editor using React Flow with drag-and-drop nodes (Process, Decision, Step, Transition, Actor, etc.)
- **Interfaces tab** — Define reusable AOI/UDT types and create named instances of them
- **Plant / Area / Location hierarchy** — Assign instances to physical locations in a structured tree
- **Cause & Effect Matrix** — Per-flowchart matrix mapping each sequence step to device field requests (boolean toggles and numeric setpoints)
- **PackML state display** — Shows ISA-88 PackML states on each sequence step in the matrix
- **PDF export** — Export diagrams to PDF
- **Project save/load** — Projects saved as `.plcd` files

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- Windows 10/11 (the packaged build targets Windows; dev mode runs cross-platform)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/mijohnson89/PLC_Flowchart.git
cd PLC_Flowchart
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

This starts the Electron app with hot-reload via electron-vite. Changes to the renderer source are reflected instantly without restarting.

---

## Building

### Compile (no installer)

```bash
npm run build
```

Output is placed in `out/`.

### Package for Windows (NSIS installer)

```bash
npm run build:win
```

Output installer is placed in `dist/`.

---

## Project Structure

```
src/
├── main/               # Electron main process
│   └── index.ts
├── preload/            # Electron preload scripts
│   └── index.ts
└── renderer/           # React + Vite front-end
    └── src/
        ├── App.tsx
        ├── index.css
        ├── components/
        │   ├── TabBar.tsx
        │   ├── Sidebar.tsx
        │   ├── PropertiesPanel.tsx
        │   ├── FlowchartCanvas.tsx
        │   ├── SequenceCanvas.tsx
        │   ├── InterfacesPanel.tsx   # AOI/UDT library + instances
        │   ├── LocationsPanel.tsx    # Plant/Area/Location hierarchy
        │   ├── MatrixView.tsx        # Cause & Effect Matrix
        │   └── nodes/               # Custom React Flow node types
        ├── store/
        │   └── diagramStore.ts      # Zustand global state
        └── types/
            └── index.ts             # Shared TypeScript interfaces
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) |
| Bundler | [electron-vite](https://electron-vite.org/) |
| UI framework | [React 19](https://react.dev/) |
| Language | TypeScript |
| Diagram engine | [@xyflow/react](https://reactflow.dev/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| Icons | [Lucide React](https://lucide.dev/) |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF) + [html-to-image](https://github.com/bubkoo/html-to-image) |

---

## Saving Projects

Projects are saved as `.plcd` files (JSON format) via **File → Save / Save As** in the application menu. You can re-open them with **File → Open**.
