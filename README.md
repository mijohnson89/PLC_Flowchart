# PLC UML Generator

A desktop application for creating PLC flowchart and sequence diagrams, built for use alongside Rockwell Automation Studio 5000. It supports Add-On Instruction (AOI) and UDT library management, instance tracking with Plant/Area/Location hierarchy, IO table management, task tracking, alarm definitions, and a Cause & Effect Matrix for documenting sequence-to-device relationships.

---

## Features

### Diagrams
- **Flowchart editor** — SFC-style flowcharts with Step, Process, Transition, Output, Start/End, and Note nodes using React Flow with drag-and-drop
- **Sequence diagrams** — Actor lifelines with sync/async/return/signal messages, reordering, and notes
- **Cross-diagram navigation** — Link nodes across tabs for anchor-based navigation between diagrams
- **Diagram tree view** — Organise tabs into folders with drag-and-drop reordering
- **Alignment toolbar** — Align and distribute selected nodes, fit-to-screen
- **Page boundary overlay** — Visual page outline (A4–A0, portrait/landscape) for print-aware layout
- **Snap guides** — Alignment guides appear while dragging nodes

### Interfaces & Instances
- **AOI/UDT definitions** — Define reusable interface types with typed fields (Input, Output, InOut, Local)
- **Field flags** — Mark fields as alarm points, IO-linked, or include/exclude from the C&E matrix
- **Interface instances** — Create named instances tied to a location in the plant hierarchy
- **IO channel mapping** — Assign physical IO channels to instance fields (bidirectional linking from both the Interfaces and IO Table panels)
- **Global library** — Save/load interface definitions to a shared library across projects
- **L5K import/export** — Import AOI/UDT definitions and sequence data from Studio 5000 `.L5K` files

### Plant Hierarchy
- **Plant / Area / Location** — Three-level hierarchy for organising where equipment lives
- **Location breadcrumbs** — Instances display their location path throughout the app

### IO Table
- **Racks and slots** — Define IO racks with named slots and catalog numbers
- **IO entries** — Per-channel rows with drawing tag, description fields, IO type (DI/DO/AI/AO/RTD/TC), and scaling
- **Linked instances** — Each IO entry shows its linked interface instance field

### Cause & Effect Matrix
- **Per-flowchart matrix** — Maps each sequence step to device field actions (boolean toggles and numeric setpoints)
- **PackML state display** — Shows ISA-88 PackML states on each step row
- **Instance sidebar** — Toggle which instances appear as columns, grouped by plant/area/location
- **Hide unused** — Quickly hide instances with no values set

### Flowchart Conditions
- **Conditions panel** — Define pause/stop/abort conditions per flowchart
- **Linked causes** — Each condition can reference alarms or instance alarm fields

### Tasks
- **Task management** — Track design/program/test status across sub-tasks
- **Linked resources** — Tasks link to flowchart tabs, sequence tabs, IO entries, and instances
- **Auto-generation rules** — Automatically create tasks for IO card FAT, analog SAT, sequence testing, device testing, and alarm testing
- **Hide completed** — Toggle to hide finished tasks

### Alarms
- **Global alarms** — Define standalone alarm descriptions
- **Per-instance alarms** — Interface fields marked as alarm points generate per-instance alarm entries

### Revision History
- **Revision snapshots** — Stamp revisions with author, date, and description
- **Revision viewer** — Browse and compare past revisions
- **Changes table** — Diff view showing what changed between revisions

### Export & Reports
- **Export to Excel** — Generates an `.xlsx` workbook with an IO tab and one C&E matrix tab per flowchart sequence (Ctrl+Shift+E)
- **Print report** — HTML-to-PDF report generation via the application menu (Ctrl+P)
- **Project save/load** — Projects saved as `.plcd` files (JSON) via File menu

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
├── main/                    # Electron main process (IPC handlers, menus)
│   └── index.ts
├── preload/                 # Electron preload (contextBridge API)
│   └── index.ts
└── renderer/                # React + Vite front-end
    └── src/
        ├── App.tsx
        ├── index.css
        ├── components/
        │   ├── Toolbar.tsx              # File ops, undo/redo, print, export
        │   ├── TabBar.tsx               # Static + diagram tabs
        │   ├── DiagramTreeView.tsx      # Folder/tab tree with drag-and-drop
        │   ├── Sidebar.tsx              # Node palette
        │   ├── PropertiesPanel.tsx      # Selected node/edge properties
        │   ├── FlowchartCanvas.tsx      # React Flow flowchart editor
        │   ├── SequenceCanvas.tsx       # Sequence diagram editor
        │   ├── InterfacesPanel.tsx      # AOI/UDT definitions + instances + IO mapping
        │   ├── LocationsPanel.tsx       # Plant / Area / Location hierarchy
        │   ├── MatrixView.tsx           # Cause & Effect matrix
        │   ├── ConditionsPanel.tsx      # Flowchart conditions (pause/stop/abort)
        │   ├── IOTablePanel.tsx         # IO racks, slots, entries
        │   ├── TasksPanel.tsx           # Task tracking + auto-generation
        │   ├── AlarmsPanel.tsx          # Global + per-instance alarms
        │   ├── RevisionPanel.tsx        # Revision history list
        │   ├── RevisionStampModal.tsx   # Create new revision
        │   ├── RevisionChangesTable.tsx # Revision diff view
        │   ├── PrintReportModal.tsx     # HTML report → PDF
        │   ├── AlignmentToolbar.tsx     # Align/distribute nodes
        │   ├── PageSizeControl.tsx      # Page size + orientation
        │   ├── PageBoundaryOverlay.tsx  # Visual page outline
        │   ├── GuideLinesOverlay.tsx    # Snap alignment guides
        │   └── nodes/                   # Custom React Flow node types
        │       ├── BaseNode.tsx
        │       ├── StartNode.tsx
        │       ├── EndNode.tsx
        │       ├── StepNode.tsx
        │       ├── ProcessNode.tsx
        │       ├── OutputNode.tsx
        │       ├── TransitionNode.tsx
        │       ├── ActorNode.tsx
        │       └── NoteNode.tsx
        ├── store/
        │   └── diagramStore.ts          # Zustand global state
        ├── types/
        │   └── index.ts                 # Shared TypeScript interfaces
        └── utils/
            ├── uid.ts                   # ID generation
            ├── formatDate.ts            # Date formatting
            ├── locationBreadcrumb.ts    # Location path helper
            ├── l5kImport.ts             # Studio 5000 L5K file parser
            └── exportToExcel.ts         # Excel workbook generation
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
| Excel export | [SheetJS (xlsx)](https://sheetjs.com/) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | New project |
| Ctrl+O | Open project |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+P | Print report |
| Ctrl+Shift+E | Export to Excel |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+A | Select all |
| Delete | Delete selected |
| Ctrl+Shift+F | Fit to screen |
