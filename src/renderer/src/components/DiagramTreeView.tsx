import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, Network, AlignJustify,
  FolderClosed, FolderOpen, Layers, FolderPlus,
  Pencil, Trash2, Copy, FolderInput, Plus, ClipboardList, TableProperties,
  Building2
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import { INTERFACES_TAB_ID, LOCATIONS_TAB_ID, TASKS_TAB_ID, IO_TABLE_TAB_ID } from '../types'
import type { DiagramTab, DiagramMode, TreeFolder } from '../types'

const TYPE_ICON: Record<DiagramMode, React.ReactNode> = {
  flowchart: <Network size={11} />,
  sequence:  <AlignJustify size={11} />,
}

// ── Tree data structures ──────────────────────────────────────────────────────

interface TreeNode {
  kind: 'folder' | 'tab'
  id: string
  name: string
  sortIndex: number
  folder?: TreeFolder
  tab?: DiagramTab
  children: TreeNode[]
}

function buildTree(folders: TreeFolder[], tabs: DiagramTab[]): TreeNode[] {
  const folderMap = new Map<string, TreeNode>()
  for (const f of folders) {
    folderMap.set(f.id, {
      kind: 'folder', id: f.id, name: f.name,
      sortIndex: f.sortIndex, folder: f, children: []
    })
  }

  // Attach child folders to parents
  for (const f of folders) {
    const node = folderMap.get(f.id)!
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId)!.children.push(node)
    }
  }

  // Attach tabs to their folders
  for (const t of tabs) {
    const leaf: TreeNode = {
      kind: 'tab', id: t.id, name: t.name,
      sortIndex: t.sortIndex, tab: t, children: []
    }
    if (t.folderId && folderMap.has(t.folderId)) {
      folderMap.get(t.folderId)!.children.push(leaf)
    }
  }

  // Build root level: folders without parents + tabs without folders
  const roots: TreeNode[] = []
  for (const f of folders) {
    if (!f.parentId || !folderMap.has(f.parentId)) {
      roots.push(folderMap.get(f.id)!)
    }
  }
  for (const t of tabs) {
    if (!t.folderId || !folderMap.has(t.folderId)) {
      roots.push({
        kind: 'tab', id: t.id, name: t.name,
        sortIndex: t.sortIndex, tab: t, children: []
      })
    }
  }

  // Recursively sort children by sortIndex
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sortIndex - b.sortIndex)
    for (const n of nodes) {
      if (n.children.length > 0) sortChildren(n.children)
    }
  }
  sortChildren(roots)
  return roots
}

/** Collect all descendant folder IDs */
function collectDescendantFolderIds(folderId: string, folders: TreeFolder[]): Set<string> {
  const result = new Set<string>()
  const stack = [folderId]
  while (stack.length) {
    const id = stack.pop()!
    result.add(id)
    for (const f of folders) {
      if (f.parentId === id && !result.has(f.id)) stack.push(f.id)
    }
  }
  return result
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface MenuPos { x: number; y: number }
interface ContextTarget {
  kind: 'folder' | 'tab' | 'empty'
  id?: string
  parentFolderId?: string | null
}

function ContextMenu({ pos, target, folders, onClose, onStartRename }: {
  pos: MenuPos
  target: ContextTarget
  folders: TreeFolder[]
  onClose: () => void
  onStartRename: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const store = useDiagramStore

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 100
  }

  const menuItem = (label: string, icon: React.ReactNode, action: () => void, danger = false) => (
    <button
      key={label}
      onClick={() => { action(); onClose() }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {icon}{label}
    </button>
  )

  const items: React.ReactNode[] = []

  if (target.kind === 'folder') {
    items.push(menuItem('Rename Folder', <Pencil size={11} />, () => {
      onStartRename(target.id!)
    }))
    items.push(menuItem('New Subfolder', <FolderPlus size={11} />, () => {
      const id = store.getState().addFolder('New Folder', target.id!)
      setTimeout(() => onStartRename(id), 50)
    }))
    items.push(menuItem('New Flowchart', <Network size={11} />, () => {
      const tabId = store.getState().addTab('New Flowchart', 'flowchart', { folderId: target.id! })
      setTimeout(() => onStartRename(tabId), 50)
    }))
    items.push(menuItem('New Sequence', <AlignJustify size={11} />, () => {
      const tabId = store.getState().addTab('New Sequence', 'sequence', { folderId: target.id! })
      setTimeout(() => onStartRename(tabId), 50)
    }))
    items.push(<div key="sep" className="h-px bg-gray-200 my-1" />)
    items.push(menuItem('Delete Folder', <Trash2 size={11} />, () => {
      store.getState().removeFolder(target.id!)
    }, true))
  }

  if (target.kind === 'tab') {
    items.push(menuItem('Rename', <Pencil size={11} />, () => {
      onStartRename(target.id!)
    }))
    items.push(menuItem('Duplicate', <Copy size={11} />, () => {
      store.getState().duplicateTab(target.id!)
    }))
    if (folders.length > 0) {
      items.push(<div key="sep-move" className="h-px bg-gray-200 my-1" />)
      items.push(
        <div key="move-header" className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move to…</div>
      )
      items.push(menuItem('Root (no folder)', <FolderInput size={11} />, () => {
        const siblings = store.getState().tabs.filter((t) => t.folderId === null)
        store.getState().moveTab(target.id!, null, siblings.length)
      }))
      for (const f of folders) {
        items.push(menuItem(f.name, <FolderClosed size={11} />, () => {
          const siblings = store.getState().tabs.filter((t) => t.folderId === f.id)
          store.getState().moveTab(target.id!, f.id, siblings.length)
        }))
      }
    }
    items.push(<div key="sep2" className="h-px bg-gray-200 my-1" />)
    items.push(menuItem('Delete', <Trash2 size={11} />, () => {
      store.getState().removeTab(target.id!)
    }, true))
  }

  if (target.kind === 'empty') {
    items.push(menuItem('New Folder', <FolderPlus size={11} />, () => {
      const id = store.getState().addFolder('New Folder', null)
      setTimeout(() => onStartRename(id), 50)
    }))
    items.push(menuItem('New Flowchart', <Network size={11} />, () => {
      const tabId = store.getState().addTab('New Flowchart', 'flowchart')
      setTimeout(() => onStartRename(tabId), 50)
    }))
    items.push(menuItem('New Sequence', <AlignJustify size={11} />, () => {
      const tabId = store.getState().addTab('New Sequence', 'sequence')
      setTimeout(() => onStartRename(tabId), 50)
    }))
  }

  return (
    <div ref={ref} style={style}
      className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px] select-none"
    >
      {items}
    </div>
  )
}

// ── Drag & drop types ─────────────────────────────────────────────────────────

type DragItem = { kind: 'folder' | 'tab'; id: string }
type DropTarget = {
  kind: 'folder' | 'between'
  folderId?: string
  parentId?: string | null
  insertIndex?: number
}

const DRAG_MIME = 'application/x-tree-drag'

// ── Inline rename input ───────────────────────────────────────────────────────

function InlineRenameInput({ value, onCommit, onCancel }: {
  value: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  return (
    <input
      ref={inputRef}
      autoFocus
      className="text-[11px] font-medium bg-white border border-indigo-400 rounded px-1 py-0.5 outline-none w-full"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const trimmed = draft.trim()
          if (trimmed) onCommit(trimmed)
          else onCancel()
        }
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={() => {
        const trimmed = draft.trim()
        if (trimmed && trimmed !== value) onCommit(trimmed)
        else onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiagramTreeView() {
  const tabs = useDiagramStore((s) => s.tabs)
  const folders = useDiagramStore((s) => s.folders)
  const activeTabId = useDiagramStore((s) => s.activeTabId)
  const setActiveTab = useDiagramStore((s) => s.setActiveTab)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<{ pos: MenuPos; target: ContextTarget } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const tree = useMemo(() => buildTree(folders, tabs), [folders, tabs])
  const isInterfacesActive = activeTabId === INTERFACES_TAB_ID
  const isLocationsActive = activeTabId === LOCATIONS_TAB_ID
  const isTasksActive = activeTabId === TASKS_TAB_ID
  const isIOTableActive = activeTabId === IO_TABLE_TAB_ID

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  const isOpen = (key: string) => !(collapsed[key] ?? false)

  const handleContextMenu = useCallback((e: React.MouseEvent, target: ContextTarget) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ pos: { x: e.clientX, y: e.clientY }, target })
  }, [])

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ pos: { x: e.clientX, y: e.clientY }, target: { kind: 'empty' } })
  }, [])

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
    setDragItem(item)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragItem(null)
    setDropTarget(null)
  }, [])

  const handleDropOnFolder = useCallback((folderId: string) => {
    if (!dragItem) return
    const state = useDiagramStore.getState()
    if (dragItem.kind === 'tab') {
      if (dragItem.id === folderId) return
      const siblings = state.tabs.filter((t) => t.folderId === folderId)
      state.moveTab(dragItem.id, folderId, siblings.length)
    } else if (dragItem.kind === 'folder') {
      if (dragItem.id === folderId) return
      const descendants = collectDescendantFolderIds(dragItem.id, state.folders)
      if (descendants.has(folderId)) return
      const siblings = state.folders.filter((f) => f.parentId === folderId)
      state.moveFolder(dragItem.id, folderId, siblings.length)
    }
    setDragItem(null)
    setDropTarget(null)
  }, [dragItem])

  const handleDropOnRoot = useCallback(() => {
    if (!dragItem) return
    const state = useDiagramStore.getState()
    if (dragItem.kind === 'tab') {
      const siblings = state.tabs.filter((t) => t.folderId === null)
      state.moveTab(dragItem.id, null, siblings.length)
    } else if (dragItem.kind === 'folder') {
      const siblings = state.folders.filter((f) => f.parentId === null)
      state.moveFolder(dragItem.id, null, siblings.length)
    }
    setDragItem(null)
    setDropTarget(null)
  }, [dragItem])

  const handleRenameCommit = useCallback((id: string, kind: 'folder' | 'tab', name: string) => {
    const state = useDiagramStore.getState()
    if (kind === 'folder') state.renameFolder(id, name)
    else state.renameTab(id, name)
    setRenamingId(null)
  }, [])

  const handleDoubleClick = useCallback((id: string) => {
    setRenamingId(id)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string) => {
    if (e.key === 'F2') {
      e.preventDefault()
      setRenamingId(id)
    }
  }, [])

  return (
    <div className="flex flex-col overflow-hidden select-none flex-1 min-h-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Diagrams</h2>
        <button
          onClick={() => {
            const id = useDiagramStore.getState().addFolder('New Folder', null)
            setRenamingId(id)
          }}
          className="p-0.5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
          title="New folder"
        >
          <FolderPlus size={12} />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={handleEmptyContextMenu}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (!dropTarget || dropTarget.kind !== 'between') {
            setDropTarget({ kind: 'between', parentId: null, insertIndex: 9999 })
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          handleDropOnRoot()
        }}
      >
        {/* Interfaces entry */}
        <TreeLeafButton
          label="Interfaces"
          icon={<Layers size={11} />}
          isActive={isInterfacesActive}
          depth={0}
          onClick={() => setActiveTab(INTERFACES_TAB_ID)}
        />

        {/* Locations entry */}
        <TreeLeafButton
          label="Locations"
          icon={<Building2 size={11} />}
          isActive={isLocationsActive}
          depth={0}
          onClick={() => setActiveTab(LOCATIONS_TAB_ID)}
        />

        {/* Tasks entry */}
        <TreeLeafButton
          label="Tasks"
          icon={<ClipboardList size={11} />}
          isActive={isTasksActive}
          depth={0}
          onClick={() => setActiveTab(TASKS_TAB_ID)}
        />

        {/* IO Table entry */}
        <TreeLeafButton
          label="IO Table"
          icon={<TableProperties size={11} />}
          isActive={isIOTableActive}
          depth={0}
          onClick={() => setActiveTab(IO_TABLE_TAB_ID)}
        />

        <div className="h-px bg-gray-100 mx-3 my-1" />

        {/* Tree nodes */}
        {tree.map((node) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            activeTabId={activeTabId}
            collapsed={collapsed}
            isOpen={isOpen}
            toggle={toggle}
            onSelect={setActiveTab}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDropOnFolder={handleDropOnFolder}
            dragItem={dragItem}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            renamingId={renamingId}
            onRenameCommit={handleRenameCommit}
            onRenameCancel={() => setRenamingId(null)}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            folders={folders}
          />
        ))}

        {/* Empty state with add buttons */}
        {tree.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-[11px] text-gray-400 mb-2">No diagrams yet</p>
            <div className="flex gap-1 justify-center">
              <button
                onClick={() => useDiagramStore.getState().addTab('New Flowchart', 'flowchart')}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
              >
                <Plus size={10} /> Flowchart
              </button>
              <button
                onClick={() => useDiagramStore.getState().addTab('New Sequence', 'sequence')}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
              >
                <Plus size={10} /> Sequence
              </button>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          pos={contextMenu.pos}
          target={contextMenu.target}
          folders={folders}
          onClose={() => setContextMenu(null)}
          onStartRename={(id) => setRenamingId(id)}
        />
      )}
    </div>
  )
}

// ── Recursive tree node row ───────────────────────────────────────────────────

function TreeNodeRow({ node, depth, activeTabId, collapsed, isOpen, toggle,
  onSelect, onContextMenu, onDragStart, onDragEnd, onDropOnFolder,
  dragItem, dropTarget, setDropTarget, renamingId,
  onRenameCommit, onRenameCancel, onDoubleClick, onKeyDown, folders
}: {
  node: TreeNode
  depth: number
  activeTabId: string
  collapsed: Record<string, boolean>
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  onSelect: (id: string) => void
  onContextMenu: (e: React.MouseEvent, target: ContextTarget) => void
  onDragStart: (e: React.DragEvent, item: DragItem) => void
  onDragEnd: () => void
  onDropOnFolder: (folderId: string) => void
  dragItem: DragItem | null
  dropTarget: DropTarget | null
  setDropTarget: (t: DropTarget | null) => void
  renamingId: string | null
  onRenameCommit: (id: string, kind: 'folder' | 'tab', name: string) => void
  onRenameCancel: () => void
  onDoubleClick: (id: string) => void
  onKeyDown: (e: React.KeyboardEvent, id: string) => void
  folders: TreeFolder[]
}) {
  const isRenaming = renamingId === node.id
  const isDragTarget = dropTarget?.kind === 'folder' && dropTarget.folderId === node.id
  const isDragging = dragItem?.id === node.id

  if (node.kind === 'folder') {
    const key = `folder:${node.id}`
    const open = isOpen(key)
    const allTabIds = collectAllTabIds(node)
    const hasActive = allTabIds.has(activeTabId)
    const tabCount = allTabIds.size

    return (
      <div style={{ opacity: isDragging ? 0.4 : 1 }}>
        <div
          draggable
          onDragStart={(e) => onDragStart(e, { kind: 'folder', id: node.id })}
          onDragEnd={onDragEnd}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDropTarget({ kind: 'folder', folderId: node.id })
          }}
          onDragLeave={(e) => {
            if (isDragTarget) setDropTarget(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDropOnFolder(node.id)
          }}
          onContextMenu={(e) => onContextMenu(e, { kind: 'folder', id: node.id })}
          onKeyDown={(e) => onKeyDown(e, node.id)}
          tabIndex={0}
          className="outline-none"
        >
          <FolderButton
            label={node.name}
            count={tabCount}
            isOpen={open}
            hasActive={hasActive}
            depth={depth}
            isDropTarget={isDragTarget}
            isRenaming={isRenaming}
            onRenameCommit={(name) => onRenameCommit(node.id, 'folder', name)}
            onRenameCancel={onRenameCancel}
            onClick={() => toggle(key)}
            onDoubleClick={() => onDoubleClick(node.id)}
          />
        </div>
        {open && node.children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            activeTabId={activeTabId}
            collapsed={collapsed}
            isOpen={isOpen}
            toggle={toggle}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOnFolder={onDropOnFolder}
            dragItem={dragItem}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
            renamingId={renamingId}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
            folders={folders}
          />
        ))}
      </div>
    )
  }

  // Tab leaf
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, { kind: 'tab', id: node.id })}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, { kind: 'tab', id: node.id })}
      onKeyDown={(e) => onKeyDown(e, node.id)}
      tabIndex={0}
      className="outline-none"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <TreeLeafButton
        label={node.name}
        icon={TYPE_ICON[node.tab!.type]}
        isActive={node.id === activeTabId}
        depth={depth}
        isRenaming={isRenaming}
        onRenameCommit={(name) => onRenameCommit(node.id, 'tab', name)}
        onRenameCancel={onRenameCancel}
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
      />
    </div>
  )
}

/** Collect all tab IDs in a tree node (recursively) */
function collectAllTabIds(node: TreeNode): Set<string> {
  const ids = new Set<string>()
  const stack = [node]
  while (stack.length) {
    const n = stack.pop()!
    if (n.kind === 'tab') ids.add(n.id)
    for (const c of n.children) stack.push(c)
  }
  return ids
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function FolderButton({ label, count, isOpen, hasActive, depth, isDropTarget,
  isRenaming, onRenameCommit, onRenameCancel, onClick, onDoubleClick
}: {
  label: string
  count: number
  isOpen: boolean
  hasActive: boolean
  depth: number
  isDropTarget?: boolean
  isRenaming?: boolean
  onRenameCommit?: (name: string) => void
  onRenameCancel?: () => void
  onClick: () => void
  onDoubleClick?: () => void
}) {
  const pl = 12 + depth * 16
  return (
    <button
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      style={{ paddingLeft: pl }}
      className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-[11px] font-semibold transition-colors ${
        isDropTarget
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-400'
          : hasActive ? 'text-gray-800 hover:bg-gray-50' : 'text-gray-500 hover:bg-gray-50'
      }`}
    >
      {isOpen
        ? <ChevronDown size={11} className="text-gray-400 flex-shrink-0" />
        : <ChevronRight size={11} className="text-gray-400 flex-shrink-0" />
      }
      {isOpen
        ? <FolderOpen size={11} className="text-amber-500 flex-shrink-0" />
        : <FolderClosed size={11} className="text-amber-500 flex-shrink-0" />
      }
      {isRenaming ? (
        <InlineRenameInput
          value={label}
          onCommit={onRenameCommit!}
          onCancel={onRenameCancel!}
        />
      ) : (
        <span className="truncate">{label}</span>
      )}
      {!isRenaming && (
        <span className="ml-auto text-[10px] font-normal text-gray-400 flex-shrink-0">{count}</span>
      )}
    </button>
  )
}

function TreeLeafButton({ label, icon, isActive, depth, isRenaming,
  onRenameCommit, onRenameCancel, onClick, onDoubleClick
}: {
  label: string
  icon: React.ReactNode
  isActive: boolean
  depth: number
  isRenaming?: boolean
  onRenameCommit?: (name: string) => void
  onRenameCancel?: () => void
  onClick: () => void
  onDoubleClick?: () => void
}) {
  const pl = 20 + depth * 16
  return (
    <button
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
      style={{ paddingLeft: pl }}
      className={`w-full flex items-center gap-2 pr-3 py-1.5 text-[11px] transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-semibold'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
      title={label}
    >
      <span className={`flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>
        {icon}
      </span>
      {isRenaming ? (
        <InlineRenameInput
          value={label}
          onCommit={onRenameCommit!}
          onCancel={onRenameCancel!}
        />
      ) : (
        <span className="truncate">{label}</span>
      )}
    </button>
  )
}
