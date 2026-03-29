import { FolderKanban, Plus, Trash2 } from 'lucide-react'
import { useDiagramStore } from '../store/diagramStore'

function Field({
  label,
  value,
  onChange,
  multiline
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  const common =
    'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">
        {label}
      </span>
      {multiline ? (
        <textarea
          className={`${common} min-h-[72px] resize-y`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          type="text"
          className={common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

export function ProjectPanel() {
  const projectName = useDiagramStore((s) => s.projectName)
  const projectDescription = useDiagramStore((s) => s.projectDescription)
  const projectJobNo = useDiagramStore((s) => s.projectJobNo)
  const customerName = useDiagramStore((s) => s.customerName)
  const customerSite = useDiagramStore((s) => s.customerSite)
  const customerContact = useDiagramStore((s) => s.customerContact)
  const projectVariations = useDiagramStore((s) => s.projectVariations)
  const setProjectName = useDiagramStore((s) => s.setProjectName)
  const setProjectDescription = useDiagramStore((s) => s.setProjectDescription)
  const setProjectJobNo = useDiagramStore((s) => s.setProjectJobNo)
  const setCustomerName = useDiagramStore((s) => s.setCustomerName)
  const setCustomerSite = useDiagramStore((s) => s.setCustomerSite)
  const setCustomerContact = useDiagramStore((s) => s.setCustomerContact)
  const addProjectVariation = useDiagramStore((s) => s.addProjectVariation)
  const updateProjectVariation = useDiagramStore((s) => s.updateProjectVariation)
  const removeProjectVariation = useDiagramStore((s) => s.removeProjectVariation)

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
      <div className="px-5 py-3.5 border-b border-gray-200 bg-white flex-shrink-0 flex items-center gap-3">
        <FolderKanban size={15} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-gray-800">Project</h2>
        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold ml-auto">
          {projectVariations.length} variation{projectVariations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
          <Field label="Project Name" value={projectName} onChange={setProjectName} />
          <Field label="Project Description" value={projectDescription} onChange={setProjectDescription} multiline />
          <Field label="Project Job No" value={projectJobNo} onChange={setProjectJobNo} />
          <Field label="Customer Name" value={customerName} onChange={setCustomerName} />
          <Field label="Customer Site" value={customerSite} onChange={setCustomerSite} />
          <Field label="Customer Contact" value={customerContact} onChange={setCustomerContact} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Variations</h3>
            <button
              type="button"
              onClick={() => addProjectVariation()}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              <Plus size={12} /> Add variation
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse min-w-[520px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-2 py-2 w-24">Var. no.</th>
                    <th className="px-2 py-2 w-40">Variation name</th>
                    <th className="px-2 py-2 min-w-[200px]">Variation description</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {projectVariations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-xs">
                        No variations yet. Use <strong>Add variation</strong> to record changes against the job.
                      </td>
                    </tr>
                  )}
                  {projectVariations.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="px-2 py-1.5">
                        <input
                          className="w-full border border-transparent hover:border-gray-200 rounded px-1.5 py-1 text-[11px] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={row.variationNo}
                          onChange={(e) => updateProjectVariation(row.id, { variationNo: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="w-full border border-transparent hover:border-gray-200 rounded px-1.5 py-1 text-[11px] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={row.name}
                          onChange={(e) => updateProjectVariation(row.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <textarea
                          className="w-full border border-transparent hover:border-gray-200 rounded px-1.5 py-1 text-[11px] min-h-[36px] resize-y focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={row.description ?? ''}
                          onChange={(e) => updateProjectVariation(row.id, { description: e.target.value })}
                          rows={2}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeProjectVariation(row.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Remove variation"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
