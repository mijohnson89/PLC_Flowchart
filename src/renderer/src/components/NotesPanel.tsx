import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, FileText, ExternalLink, Paperclip, FolderOpen,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Strikethrough, Minus, Link, ChevronDown, ChevronRight,
  Pencil, Check, X, Search, StickyNote, Globe, File,
  FolderPlus, FolderClosed, GripVertical
} from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'
import type { NoteItem, NoteItemType, NoteFolder } from '../types'

// ── Drag-and-drop types ──────────────────────────────────────────────────────

interface DragData {
  kind: 'item' | 'folder'
  id: string
}

interface DropIndicator {
  targetId: string
  targetKind: 'folder' | 'item'
  position: 'before' | 'after' | 'inside'
  parentFolderId: string | null
}

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<NoteItemType, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  note: { label: 'Note', icon: <StickyNote size={12} />, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  file: { label: 'File', icon: <Paperclip size={12} />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  link: { label: 'Link', icon: <Globe size={12} />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
}

// ── Rich Text Editor ──────────────────────────────────────────────────────────

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title?: string; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function RichTextEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)
  const [linkPrompt, setLinkPrompt] = useState<{ show: boolean; url: string; text: string }>({ show: false, url: '', text: '' })
  const savedSelection = useRef<Range | null>(null)
  const linkUrlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== content) {
        editorRef.current.innerHTML = content
      }
    }
    isInternalChange.current = false
  }, [content])

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }, [])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const isActive = (command: string) => document.queryCommandState(command)
  const [, forceUpdate] = useState(0)
  const trackSelection = useCallback(() => forceUpdate((n) => n + 1), [])

  const openLinkPrompt = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0).cloneRange()
    const selectedText = sel?.toString() ?? ''
    const parentAnchor = sel?.anchorNode?.parentElement?.closest('a')
    setLinkPrompt({ show: true, url: parentAnchor?.getAttribute('href') ?? '', text: selectedText || parentAnchor?.textContent || '' })
    setTimeout(() => linkUrlRef.current?.focus(), 50)
  }, [])

  const insertLink = useCallback(() => {
    let url = linkPrompt.url.trim()
    if (!url) { setLinkPrompt({ show: false, url: '', text: '' }); return }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    if (savedSelection.current) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(savedSelection.current) }
    const sel = window.getSelection()
    const text = linkPrompt.text.trim() || url
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      if (range.collapsed && !sel.toString()) {
        const a = document.createElement('a'); a.href = url; a.textContent = text; a.target = '_blank'; a.rel = 'noopener noreferrer'
        range.insertNode(a); range.setStartAfter(a); range.collapse(true); sel.removeAllRanges(); sel.addRange(range)
      } else {
        document.execCommand('createLink', false, url)
        const anchor = sel.anchorNode?.parentElement?.closest('a') ?? editorRef.current?.querySelector(`a[href="${url}"]`)
        if (anchor) { anchor.setAttribute('target', '_blank'); anchor.setAttribute('rel', 'noopener noreferrer') }
      }
    }
    handleInput(); setLinkPrompt({ show: false, url: '', text: '' }); savedSelection.current = null; editorRef.current?.focus()
  }, [linkPrompt, handleInput])

  const removeLink = useCallback(() => {
    if (savedSelection.current) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(savedSelection.current) }
    document.execCommand('unlink'); handleInput(); setLinkPrompt({ show: false, url: '', text: '' }); savedSelection.current = null; editorRef.current?.focus()
  }, [handleInput])

  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (anchor && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(anchor.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer') }
  }, [])

  const hasLinkAtCursor = (() => { const sel = window.getSelection(); return !!sel?.anchorNode?.parentElement?.closest('a') })()

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
        <ToolbarBtn active={isActive('bold')} onClick={() => exec('bold')} title="Bold (Ctrl+B)"><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn active={isActive('italic')} onClick={() => exec('italic')} title="Italic (Ctrl+I)"><Italic size={13} /></ToolbarBtn>
        <ToolbarBtn active={isActive('underline')} onClick={() => exec('underline')} title="Underline (Ctrl+U)"><UnderlineIcon size={13} /></ToolbarBtn>
        <ToolbarBtn active={isActive('strikeThrough')} onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <ToolbarBtn onClick={() => exec('formatBlock', '<h1>')} title="Heading 1"><Heading1 size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec('formatBlock', '<h2>')} title="Heading 2"><Heading2 size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => exec('formatBlock', '<p>')} title="Normal text"><span className="text-[10px] font-bold leading-none">P</span></ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <ToolbarBtn active={isActive('insertUnorderedList')} onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={13} /></ToolbarBtn>
        <ToolbarBtn active={isActive('insertOrderedList')} onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <ToolbarBtn onClick={() => exec('insertHorizontalRule')} title="Horizontal rule"><Minus size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <ToolbarBtn active={hasLinkAtCursor} onClick={openLinkPrompt} title="Insert / edit link"><Link size={13} /></ToolbarBtn>
      </div>
      {linkPrompt.show && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
          <Link size={11} className="text-indigo-500 flex-shrink-0" />
          <input ref={linkUrlRef} type="text" placeholder="https://example.com" value={linkPrompt.url}
            onChange={(e) => setLinkPrompt((p) => ({ ...p, url: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') { setLinkPrompt({ show: false, url: '', text: '' }); savedSelection.current = null; editorRef.current?.focus() } }}
            className="flex-1 text-xs border border-indigo-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" />
          <input type="text" placeholder="Display text (optional)" value={linkPrompt.text}
            onChange={(e) => setLinkPrompt((p) => ({ ...p, text: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') { setLinkPrompt({ show: false, url: '', text: '' }); savedSelection.current = null; editorRef.current?.focus() } }}
            className="w-40 text-xs border border-indigo-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" />
          <button onClick={insertLink} disabled={!linkPrompt.url.trim()} className="px-2 py-1 text-[10px] font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-40 transition-colors">Apply</button>
          {hasLinkAtCursor && <button onClick={removeLink} className="px-2 py-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors">Remove</button>}
          <button onClick={() => { setLinkPrompt({ show: false, url: '', text: '' }); savedSelection.current = null; editorRef.current?.focus() }} className="p-1 text-gray-400 hover:text-gray-600 rounded"><Minus size={11} /></button>
        </div>
      )}
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={handleInput} onSelect={trackSelection} onKeyUp={trackSelection} onMouseUp={trackSelection} onClick={handleEditorClick}
        className="flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-700 focus:outline-none prose prose-sm max-w-none
          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-2 [&_h1]:mt-3
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-800 [&_h2]:mb-1.5 [&_h2]:mt-2
          [&_p]:mb-1.5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5
          [&_hr]:my-3 [&_hr]:border-gray-200
          [&_a]:text-indigo-600 [&_a]:underline [&_a]:decoration-indigo-300 [&_a]:hover:text-indigo-800 [&_a]:hover:decoration-indigo-500 [&_a]:cursor-pointer"
        data-placeholder="Write your notes here…" style={{ minHeight: 80 }} />
    </div>
  )
}

// ── File detail view ──────────────────────────────────────────────────────────

function FileDetail({ item, projectPath }: { item: NoteItem; projectPath?: string }) {
  const ext = item.fileName?.split('.').pop()?.toLowerCase() ?? ''
  const isPdf = ext === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext)
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 overflow-y-auto">
      <div className="p-6 bg-blue-50 rounded-2xl">
        {isPdf ? <FileText size={48} className="text-blue-500" /> : isImage ? <File size={48} className="text-emerald-500" /> : <Paperclip size={48} className="text-gray-400" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-800 mb-1">{item.fileName ?? item.name}</p>
        <p className="text-xs text-gray-400 uppercase tracking-wide">{ext || 'Unknown'} file</p>
      </div>
      <button onClick={() => item.filePath && window.api.openNoteFile(item.filePath, projectPath)}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
        <FolderOpen size={15} /> Open File
      </button>
      <p className="text-[10px] text-gray-400 mt-2">File stored in project companion folder</p>
    </div>
  )
}

// ── Link detail view ──────────────────────────────────────────────────────────

function LinkDetail({ item, onUpdateUrl }: { item: NoteItem; onUpdateUrl: (url: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.url ?? '')
  useEffect(() => { setDraft(item.url ?? '') }, [item.url])
  const commit = () => { onUpdateUrl(draft.trim()); setEditing(false) }
  const openUrl = () => { const url = item.url ?? ''; window.open(url.startsWith('http') ? url : 'https://' + url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 overflow-y-auto">
      <div className="p-6 bg-emerald-50 rounded-2xl"><Globe size={48} className="text-emerald-500" /></div>
      <div className="text-center max-w-md">
        <p className="text-sm font-semibold text-gray-800 mb-2">{item.name}</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <input autoFocus className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(item.url ?? ''); setEditing(false) } }} />
            <button onClick={commit} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button>
            <button onClick={() => { setDraft(item.url ?? ''); setEditing(false) }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
          </div>
        ) : (
          <p className="text-xs text-emerald-600 underline cursor-pointer break-all hover:text-emerald-800" onClick={openUrl} title="Click to open link">{item.url || 'No URL set'}</p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={openUrl} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors">
          <ExternalLink size={15} /> Open Link
        </button>
        <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          <Pencil size={14} /> Edit URL
        </button>
      </div>
    </div>
  )
}

// ── Add-note dropdown ─────────────────────────────────────────────────────────

function AddDropdown({ onClose, onAddFile, onAddFolder, activeFolderId }: {
  onClose: () => void; onAddFile: () => void; onAddFolder: () => void; activeFolderId: string | null
}) {
  const addNoteItem = useDiagramStore((s) => s.addNoteItem)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const addNote = () => {
    addNoteItem('note', 'Untitled Note', { content: '', folderId: activeFolderId })
    onClose()
  }
  const addLink = () => {
    addNoteItem('link', 'New Link', { url: '', folderId: activeFolderId })
    onClose()
  }

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52 py-1">
      <button onClick={addNote} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
        <span className="p-1.5 bg-amber-50 rounded-lg"><StickyNote size={13} className="text-amber-600" /></span>
        <div><span className="text-xs font-semibold text-gray-700 block">New Note</span><span className="text-[10px] text-gray-400">Rich text document</span></div>
      </button>
      <button onClick={() => { onClose(); onAddFile() }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
        <span className="p-1.5 bg-blue-50 rounded-lg"><Paperclip size={13} className="text-blue-600" /></span>
        <div><span className="text-xs font-semibold text-gray-700 block">Attach File</span><span className="text-[10px] text-gray-400">PDF, document, image…</span></div>
      </button>
      <button onClick={addLink} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
        <span className="p-1.5 bg-emerald-50 rounded-lg"><Globe size={13} className="text-emerald-600" /></span>
        <div><span className="text-xs font-semibold text-gray-700 block">Web Link</span><span className="text-[10px] text-gray-400">URL to external resource</span></div>
      </button>
      <div className="h-px bg-gray-100 my-1" />
      <button onClick={() => { onAddFolder(); onClose() }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left">
        <span className="p-1.5 bg-gray-100 rounded-lg"><FolderPlus size={13} className="text-gray-500" /></span>
        <div><span className="text-xs font-semibold text-gray-700 block">New Folder</span><span className="text-[10px] text-gray-400">Organise your notes</span></div>
      </button>
    </div>
  )
}

// ── Note list item ────────────────────────────────────────────────────────────

function NoteListItem({ item, isActive, onSelect, onDelete, depth }: {
  item: NoteItem; isActive: boolean; onSelect: () => void; onDelete: () => void; depth: number
}) {
  const updateNoteItem = useDiagramStore((s) => s.updateNoteItem)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const meta = TYPE_META[item.type]

  useEffect(() => { if (renaming) inputRef.current?.select() }, [renaming])

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.name) updateNoteItem(item.id, { name: trimmed })
    setRenaming(false)
  }

  return (
    <div
      onClick={() => !renaming && onSelect()}
      style={{ paddingLeft: `${4 + depth * 16}px` }}
      className={`group flex items-start gap-1 pr-2 py-2 mx-1 rounded-lg cursor-pointer transition-all ${
        isActive ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'
      }`}
    >
      <span className="mt-1 flex-shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-70 transition-opacity drag-handle">
        <GripVertical size={12} className="text-gray-400" />
      </span>
      <span className={`mt-0.5 p-1 rounded-md ${meta.bgColor} flex-shrink-0`}>
        <span className={meta.color}>{meta.icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input ref={inputRef} className="w-full text-xs font-medium bg-white border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(item.name); setRenaming(false) }; e.stopPropagation() }}
            onBlur={commitRename} onClick={(e) => e.stopPropagation()} />
        ) : (
          <p className={`text-xs font-medium truncate ${isActive ? 'text-indigo-800' : 'text-gray-700'}`}>{item.name}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5">{meta.label} · {new Date(item.updatedAt).toLocaleDateString()}</p>
      </div>
      <div className={`flex items-center gap-0.5 flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button onClick={(e) => { e.stopPropagation(); setDraft(item.name); setRenaming(true) }} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Rename"><Pencil size={11} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete"><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

// ── Folder row ────────────────────────────────────────────────────────────────

function FolderRow({ folder, isOpen, onToggle, depth, onRename, onDelete, isDropTarget }: {
  folder: NoteFolder; isOpen: boolean; onToggle: () => void; depth: number
  onRename: (name: string) => void; onDelete: () => void; isDropTarget?: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (renaming) inputRef.current?.select() }, [renaming])

  const commitRename = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== folder.name) onRename(trimmed)
    setRenaming(false)
  }

  return (
    <div
      onClick={() => !renaming && onToggle()}
      style={{ paddingLeft: `${4 + depth * 16}px` }}
      className={`group flex items-center gap-1 pr-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-colors ${
        isDropTarget ? 'bg-indigo-50 ring-2 ring-indigo-400' : 'hover:bg-gray-50'
      }`}
    >
      <span className="flex-shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-70 transition-opacity drag-handle">
        <GripVertical size={12} className="text-gray-400" />
      </span>
      <span className="text-gray-400 flex-shrink-0">
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      <span className={`flex-shrink-0 ${isDropTarget ? 'text-indigo-500' : 'text-gray-400'}`}>
        <FolderClosed size={13} />
      </span>
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input ref={inputRef} className="w-full text-[11px] font-semibold bg-white border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(folder.name); setRenaming(false) }; e.stopPropagation() }}
            onBlur={commitRename} onClick={(e) => e.stopPropagation()} />
        ) : (
          <span className="text-[11px] font-semibold text-gray-600 truncate block">{folder.name}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); setDraft(folder.name); setRenaming(true) }} className="p-0.5 text-gray-400 hover:text-gray-600 rounded" title="Rename folder"><Pencil size={10} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-0.5 text-gray-400 hover:text-red-500 rounded" title="Delete folder"><Trash2 size={10} /></button>
      </div>
    </div>
  )
}

// ── Tree builder ──────────────────────────────────────────────────────────────

interface TreeNode {
  kind: 'folder' | 'item'
  id: string
  folder?: NoteFolder
  item?: NoteItem
  children: TreeNode[]
}

function buildNoteTree(folders: NoteFolder[], items: NoteItem[], matchIds: Set<string> | null): TreeNode[] {
  const folderMap = new Map<string, TreeNode>()
  for (const f of folders) {
    folderMap.set(f.id, { kind: 'folder', id: f.id, folder: f, children: [] })
  }
  for (const f of folders) {
    const node = folderMap.get(f.id)!
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId)!.children.push(node)
    }
  }
  for (const item of items) {
    if (matchIds && !matchIds.has(item.id)) continue
    const leaf: TreeNode = { kind: 'item', id: item.id, item, children: [] }
    if (item.folderId && folderMap.has(item.folderId)) {
      folderMap.get(item.folderId)!.children.push(leaf)
    }
  }

  const roots: TreeNode[] = []
  for (const f of folders) {
    if (!f.parentId || !folderMap.has(f.parentId)) roots.push(folderMap.get(f.id)!)
  }
  for (const item of items) {
    if (matchIds && !matchIds.has(item.id)) continue
    if (!item.folderId || !folderMap.has(item.folderId)) {
      roots.push({ kind: 'item', id: item.id, item, children: [] })
    }
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      if (a.kind === 'folder' && b.kind === 'folder') return (a.folder!.sortIndex - b.folder!.sortIndex)
      if (a.kind === 'item' && b.kind === 'item') return ((a.item!.sortIndex ?? 0) - (b.item!.sortIndex ?? 0))
      return 0
    })
    for (const n of nodes) if (n.children.length) sort(n.children)
  }
  sort(roots)
  return roots
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NotesPanel() {
  const noteItems = useDiagramStore((s) => s.noteItems)
  const noteFolders = useDiagramStore((s) => s.noteFolders)
  const activeNoteId = useDiagramStore((s) => s.activeNoteId)
  const setActiveNoteId = useDiagramStore((s) => s.setActiveNoteId)
  const updateNoteItem = useDiagramStore((s) => s.updateNoteItem)
  const removeNoteItem = useDiagramStore((s) => s.removeNoteItem)
  const addNoteItem = useDiagramStore((s) => s.addNoteItem)
  const addNoteFolder = useDiagramStore((s) => s.addNoteFolder)
  const renameNoteFolder = useDiagramStore((s) => s.renameNoteFolder)
  const removeNoteFolder = useDiagramStore((s) => s.removeNoteFolder)
  const moveNoteItem = useDiagramStore((s) => s.moveNoteItem)
  const moveNoteFolder = useDiagramStore((s) => s.moveNoteFolder)
  const currentFilePath = useDiagramStore((s) => s.currentFilePath)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<NoteItemType | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const dragRef = useRef<DragData | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

  const activeItem = noteItems.find((n) => n.id === activeNoteId) ?? null

  const filteredIds = useMemo(() => {
    if (!search && filterType === 'all') return null
    const ids = new Set<string>()
    for (const n of noteItems) {
      if (filterType !== 'all' && n.type !== filterType) continue
      if (search) {
        const q = search.toLowerCase()
        if (!n.name.toLowerCase().includes(q) && !(n.url ?? '').toLowerCase().includes(q)) continue
      }
      ids.add(n.id)
    }
    return ids
  }, [noteItems, search, filterType])

  const tree = useMemo(() => buildNoteTree(noteFolders, noteItems, filteredIds), [noteFolders, noteItems, filteredIds])

  const visibleCount = filteredIds ? filteredIds.size : noteItems.length

  const handleDelete = useCallback(async (item: NoteItem) => {
    if (item.type === 'file' && item.filePath) {
      await window.api.deleteNoteFile(item.filePath, currentFilePath ?? undefined)
    }
    removeNoteItem(item.id)
  }, [removeNoteItem, currentFilePath])

  const handleAddFile = useCallback(async () => {
    try {
      const result = await window.api.importNoteFile(currentFilePath ?? undefined)
      if (result) {
        addNoteItem('file', result.fileName, { filePath: result.relativePath, fileName: result.fileName })
      }
    } catch (err) {
      console.error('[Notes] Failed to import file:', err)
    }
  }, [addNoteItem, currentFilePath])

  const handleAddFolder = useCallback(() => {
    addNoteFolder('New Folder', null)
  }, [addNoteFolder])

  const handleNoteContentChange = useCallback((html: string) => {
    if (activeNoteId) updateNoteItem(activeNoteId, { content: html })
  }, [activeNoteId, updateNoteItem])

  const toggleFolder = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  const isFolderOpen = (id: string) => !(collapsed[id] ?? false)

  const activeFolderId = activeItem?.folderId ?? null

  const executeDrop = useCallback((indicator: DropIndicator) => {
    const drag = dragRef.current
    if (!drag || drag.id === indicator.targetId) return

    if (drag.kind === 'item') {
      if (indicator.position === 'inside' && indicator.targetKind === 'folder') {
        moveNoteItem(drag.id, indicator.targetId, -1)
      } else if (indicator.targetKind === 'item') {
        const parentFid = indicator.parentFolderId ?? null
        const siblings = noteItems
          .filter((n) => n.id !== drag.id && (n.folderId ?? null) === parentFid)
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        const targetIdx = siblings.findIndex((n) => n.id === indicator.targetId)
        const insertIdx = indicator.position === 'before' ? targetIdx : targetIdx + 1
        moveNoteItem(drag.id, parentFid, Math.max(0, insertIdx))
      } else if (indicator.targetKind === 'folder') {
        const parentFid = indicator.parentFolderId ?? null
        const siblings = noteItems
          .filter((n) => n.id !== drag.id && (n.folderId ?? null) === parentFid)
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        const insertIdx = indicator.position === 'before' ? 0 : siblings.length
        moveNoteItem(drag.id, parentFid, insertIdx)
      }
    } else {
      if (indicator.position === 'inside' && indicator.targetKind === 'folder') {
        moveNoteFolder(drag.id, indicator.targetId, -1)
      } else if (indicator.targetKind === 'folder') {
        const parentFid = indicator.parentFolderId ?? null
        const siblings = noteFolders
          .filter((f) => f.id !== drag.id && (f.parentId ?? null) === parentFid)
          .sort((a, b) => a.sortIndex - b.sortIndex)
        const targetIdx = siblings.findIndex((f) => f.id === indicator.targetId)
        const insertIdx = indicator.position === 'before' ? targetIdx : targetIdx + 1
        moveNoteFolder(drag.id, parentFid, Math.max(0, insertIdx))
      } else if (indicator.targetKind === 'item') {
        const parentFid = indicator.parentFolderId ?? null
        moveNoteFolder(drag.id, parentFid, -1)
      }
    }
  }, [noteItems, noteFolders, moveNoteItem, moveNoteFolder])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
    setDropIndicator(null)
  }, [])

  const makeDragHandlers = useCallback((nodeId: string, nodeKind: 'item' | 'folder', parentFolderId: string | null) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragRef.current = { kind: nodeKind, id: nodeId }
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', nodeId)
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5'
      }
    },
    onDragEnd: (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = ''
      }
      handleDragEnd()
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const drag = dragRef.current
      if (!drag || drag.id === nodeId) {
        setDropIndicator(null)
        return
      }
      e.dataTransfer.dropEffect = 'move'
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const ratio = y / rect.height
      let position: 'before' | 'after' | 'inside'
      if (nodeKind === 'folder') {
        if (drag.kind === 'item') {
          position = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
        } else {
          position = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
        }
      } else {
        position = ratio < 0.5 ? 'before' : 'after'
      }
      setDropIndicator({ targetId: nodeId, targetKind: nodeKind, position, parentFolderId })
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const drag = dragRef.current
      if (!drag || drag.id === nodeId) return
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const ratio = y / rect.height
      let position: 'before' | 'after' | 'inside'
      if (nodeKind === 'folder') {
        position = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside'
      } else {
        position = ratio < 0.5 ? 'before' : 'after'
      }
      const indicator: DropIndicator = { targetId: nodeId, targetKind: nodeKind, position, parentFolderId }
      executeDrop(indicator)
      dragRef.current = null
      setDropIndicator(null)
    }
  }), [executeDrop, handleDragEnd])

  const renderTree = (nodes: TreeNode[], depth: number, parentFolderId: string | null): React.ReactNode[] =>
    nodes.map((node) => {
      const dnd = makeDragHandlers(node.id, node.kind, parentFolderId)
      const isTarget = dropIndicator?.targetId === node.id
      const showBefore = isTarget && dropIndicator?.position === 'before'
      const showAfter = isTarget && dropIndicator?.position === 'after'
      const showInside = isTarget && dropIndicator?.position === 'inside'

      if (node.kind === 'folder') {
        const open = isFolderOpen(node.id)
        return (
          <div key={node.id} {...dnd}>
            {showBefore && <div className="h-0.5 mx-3 bg-indigo-400 rounded-full" />}
            <FolderRow
              folder={node.folder!}
              isOpen={open}
              onToggle={() => toggleFolder(node.id)}
              depth={depth}
              onRename={(name) => renameNoteFolder(node.id, name)}
              onDelete={() => removeNoteFolder(node.id)}
              isDropTarget={showInside}
            />
            {open && node.children.length > 0 && renderTree(node.children, depth + 1, node.id)}
            {showAfter && <div className="h-0.5 mx-3 bg-indigo-400 rounded-full" />}
          </div>
        )
      }
      return (
        <div key={node.id} {...dnd}>
          {showBefore && <div className="h-0.5 mx-3 bg-indigo-400 rounded-full" />}
          <NoteListItem
            item={node.item!}
            isActive={node.id === activeNoteId}
            onSelect={() => setActiveNoteId(node.id)}
            onDelete={() => handleDelete(node.item!)}
            depth={depth}
          />
          {showAfter && <div className="h-0.5 mx-3 bg-indigo-400 rounded-full" />}
        </div>
      )
    })

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    if (e.target !== e.currentTarget) return
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndicator({ targetId: '__root__', targetKind: 'item', position: 'after', parentFolderId: null })
  }, [])

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    if (e.target !== e.currentTarget) return
    const drag = dragRef.current
    if (!drag) return
    e.preventDefault()
    if (drag.kind === 'item') {
      moveNoteItem(drag.id, null, -1)
    } else {
      moveNoteFolder(drag.id, null, -1)
    }
    dragRef.current = null
    setDropIndicator(null)
  }, [moveNoteItem, moveNoteFolder])

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50">
      {/* Left: note list */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="p-1.5 bg-amber-100 rounded-lg"><FileText size={14} className="text-amber-600" /></div>
          <h2 className="text-sm font-bold text-gray-800 flex-1">Notes</h2>
          <div className="relative">
            <button onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-[11px] font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-colors">
              <Plus size={12} /> Add <ChevronDown size={10} />
            </button>
            {showAdd && <AddDropdown onClose={() => setShowAdd(false)} onAddFile={handleAddFile} onAddFolder={handleAddFolder} activeFolderId={activeFolderId} />}
          </div>
        </div>

        {/* Search + filter */}
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 space-y-1.5">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
            <Search size={12} className="text-gray-400 flex-shrink-0" />
            <input className="flex-1 text-xs bg-transparent focus:outline-none placeholder-gray-400"
              placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>}
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'note', 'file', 'link'] as const).map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                  filterType === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}>
                {t === 'all' ? 'All' : TYPE_META[t].label + 's'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto py-2"
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
          onDragLeave={(e) => { if (e.target === e.currentTarget) setDropIndicator(null) }}
        >
          {visibleCount === 0 && noteFolders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="p-3 bg-gray-100 rounded-2xl mb-3"><FileText size={24} className="text-gray-300" /></div>
              <p className="text-xs font-medium text-gray-500 mb-1">{noteItems.length === 0 ? 'No notes yet' : 'No matching notes'}</p>
              <p className="text-[10px] text-gray-400">{noteItems.length === 0 ? 'Add notes, attach files, or save web links' : 'Try a different search or filter'}</p>
            </div>
          )}
          {renderTree(tree, 0, null)}
          {dropIndicator?.targetId === '__root__' && (
            <div className="h-0.5 mx-3 bg-indigo-400 rounded-full" />
          )}
        </div>

        {/* Count footer */}
        {noteItems.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex-shrink-0">
            {noteItems.length} item{noteItems.length !== 1 ? 's' : ''}
            {visibleCount !== noteItems.length && ` · ${visibleCount} shown`}
          </div>
        )}
      </div>

      {/* Right: detail / editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeItem ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
              <span className={`p-1 rounded-md ${TYPE_META[activeItem.type].bgColor}`}>
                <span className={TYPE_META[activeItem.type].color}>{TYPE_META[activeItem.type].icon}</span>
              </span>
              <span className="text-sm font-semibold text-gray-800 truncate">{activeItem.name}</span>
              <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                {TYPE_META[activeItem.type].label} · Updated {new Date(activeItem.updatedAt).toLocaleString()}
              </span>
            </div>
            {activeItem.type === 'note' && <RichTextEditor content={activeItem.content ?? ''} onChange={handleNoteContentChange} />}
            {activeItem.type === 'file' && <FileDetail item={activeItem} projectPath={currentFilePath ?? undefined} />}
            {activeItem.type === 'link' && <LinkDetail item={activeItem} onUpdateUrl={(url) => updateNoteItem(activeItem.id, { url })} />}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="p-5 bg-gray-100 rounded-2xl mb-4"><FileText size={36} className="text-gray-300" /></div>
            <p className="text-sm font-medium text-gray-500 mb-1">Select a note to view</p>
            <p className="text-xs text-gray-400 max-w-xs">Choose a note from the list, or click <strong>Add</strong> to create a new note, attach a file, or save a web link.</p>
          </div>
        )}
      </div>
    </div>
  )
}
