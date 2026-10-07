import { useRef, useState } from 'react'
import Info from '../../components/Info'
import { useErrorMessage } from '../../components/useErrorMessage'
import { importNotionItems } from '../../db/notion'
import { notionExportFiles, pickNotionTable, type NotionItem } from '../../domain/notion'

/** TEMPORARY: brings in a Notion wishlist export, to try the Wishlist with real items. */
export default function NotionImport() {
  const [found, setFound] = useState<{ items: NotionItem[]; file: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrorMessage()
  const fileInput = useRef<HTMLInputElement>(null)

  const open = (file: File) =>
    run(async () => {
      setNotice(null)
      const files = await notionExportFiles(new Uint8Array(await file.arrayBuffer()), file.name)
      setFound({ items: pickNotionTable(files).items, file: file.name })
    })

  return (
    <div className="plugin-section">
      <h4 className="plugin-section-title">
        Import from Notion (for now){' '}
        <Info>
          A temporary way to bring in your Notion wishlist while you try this tab. In Notion, open the wishlist page, then
          ⋯ → Export → “Markdown &amp; CSV”, and pick the zip it downloads. Categories and tags are created as needed, and
          importing the same file again adds nothing twice.
        </Info>
      </h4>
      {error && <p className="error">{error}</p>}
      <div className="toolbar">
        {found ? (
          <>
            <span>
              {found.items.length} items in {found.file}
            </span>
            <button
              type="button"
              className="primary"
              onClick={() =>
                void run(async () => {
                  const added = await importNotionItems(found.items)
                  setFound(null)
                  setNotice(added === 0 ? 'Nothing new: everything in this file is already in your wishlist.' : `Added ${added} ${added === 1 ? 'item' : 'items'}.`)
                })
              }
            >
              Import
            </button>
            <button type="button" onClick={() => setFound(null)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => fileInput.current?.click()}>
            Choose the export…
          </button>
        )}
        {notice && <span className="muted small">{notice}</span>}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".zip,.csv,application/zip,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void open(file)
        }}
      />
    </div>
  )
}
