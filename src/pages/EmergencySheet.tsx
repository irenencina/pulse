import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { DoneIcon, EditIcon, PlusIcon, PrintIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { deleteContact, markChecked, saveContact, setAccountAccess, setWhereThings } from '../db/emergency'
import { contactEmail, contactPhone, EMPTY_SHEET, nextCheck, sheetAccounts, sheetBills, sheetWarranties, type EmergencyContact } from '../domain/emergency'
import { formatMoney } from '../domain/money'
import type { MonthKey } from '../domain/periods'
import { NOTICE_OPTIONS, REPEAT_LABELS, upcomingEvents } from '../domain/upcoming'
import { kindLabel } from '../domain/worth'
import { monthLabel, todayIso } from './tracking/format'
import { AlertIcon } from '../components/TrackingChoice'
import { saveFile } from './settings/BackupPanel'
import { Popup } from './wishlist/WishDialogs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 05", with the year when it isn't this year. */
const sheetDate = (iso: string, today: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8, 10)}${iso.slice(0, 4) === today.slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`}`

const noticeLabel = (days: number | undefined) => (days ? (NOTICE_OPTIONS.find(([d]) => d === days)?.[1] ?? `${days} days`) : '')

/**
 * The emergency sheet: what someone handling your money for you would need, on one printable page.
 * Most of it comes from Wealth, Upcoming and the Wishlist; the contacts and notes are typed in here.
 * It opens as a window over Wealth, like Settings.
 */
export default function EmergencySheet({ onClose }: { onClose: () => void }) {
  const settings = useLiveQuery(() => getSettings(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const balances = useLiveQuery(() => db.balances.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])
  const cells = useLiveQuery(() => db.budgetCells.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const wishes = useLiveQuery(() => db.wishItems.toArray(), [])
  const items = useLiveQuery(() => db.upcomingItems.toArray(), [])
  const overrides = useLiveQuery(() => db.upcomingOverrides.toArray(), [])
  // It opens as an overview to read and print; Edit unlocks the fields.
  const [unlocked, setUnlocked] = useState(false)
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null)
  const { error, run } = useErrorMessage()
  const body = useRef<HTMLDivElement>(null)

  if (!settings || !accounts || !balances || !categories || !cells || !transactions || !wishes || !items || !overrides) return null

  const today = todayIso()
  const month = today.slice(0, 7) as MonthKey
  const sheet = settings.emergency ?? EMPTY_SHEET
  const owned = settings.pluginWishlist ? wishes : []
  const { own, owe } = sheetAccounts(accounts, balances, month)
  const bills = sheetBills(upcomingEvents({ categories, cells, transactions, wishes: owned, items, overrides, settings, accounts, balances }, today), accounts)
  const warranties = sheetWarranties(owned, today)
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
  const due = nextCheck(sheet)

  return (
    createPortal(
    <Popup title="Emergency sheet" onClose={onClose} className="emergency-dialog">
      <div className="emergency-body" ref={body}>
      <div className="sheet-top">
        <p className="sheet-checked muted small">
          <span className="print-only sheet-title">Emergency sheet</span>
          {sheet.checkedOn ? `Last checked on ${sheetDate(sheet.checkedOn, today)}` : 'Not checked yet'}
          {due && ` · next check ${sheetDate(due, today)}`}{' '}
          <Info>
            What someone handling your money for you would need: who to call, where things are, your accounts, your bills
            and your warranties. Print it, or save it as a PDF, and keep it somewhere a person you trust can find it. Most of
            it comes from Wealth, Upcoming and the Wishlist. Never write passwords or PINs here: say where they are kept instead.
          </Info>
        </p>
        <div className="toolbox no-print" role="toolbar" aria-label="Tools">
          {unlocked && (
            <button
              type="button"
              className="tool"
              aria-label="Checked today"
              title={`Checked today: it's all still right. Upcoming reminds you again in 6 months`}
              onClick={() => void run(() => markChecked(today))}
            >
              <DoneIcon />
            </button>
          )}
          <button
            type="button"
            className="tool"
            aria-label="Edit"
            aria-pressed={unlocked}
            title={unlocked ? 'Done editing: back to the overview' : 'Edit the sheet'}
            onClick={() => setUnlocked(!unlocked)}
          >
            <EditIcon />
          </button>
          <button type="button" className="tool" aria-label="Print" title="Print, or save as a PDF" onClick={() => void run(() => printSheet(body.current))}>
            <PrintIcon />
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="sheet-grid">
        <section className="dash-panel sheet-section">
          <div className="sheet-section-head">
            <h2>Who to call</h2>
            {unlocked && (
              <button type="button" className="tool no-print" aria-label="Add a contact" title="Add a contact: someone to call" onClick={() => setEditing('new')}>
                <PlusIcon />
              </button>
            )}
          </div>
          {sheet.contacts.length === 0 ? (
            <p className="muted small">No one yet. Click Edit, then + to add family, your bank, your insurer or your accountant.</p>
          ) : (
            <table className="progress-table sheet-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Who they are</th>
                  <th>Phone</th>
                  <th>Email</th>
                  {unlocked && <th aria-label="Actions" className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {sheet.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.role ?? ''}</td>
                    <td>{contactPhone(c) ?? ''}</td>
                    <td className="sheet-wrap">{contactEmail(c) ?? ''}</td>
                    {unlocked && (
                    <td className="actions no-print">
                      <Menu label={`More for ${c.name}`}>
                        {(close) => (
                          <>
                            <button type="button" role="menuitem" onClick={() => (close(), setEditing(c))}>
                              <EditIcon /> Edit
                            </button>
                            <ConfirmButton
                              label={
                                <>
                                  <TrashIcon /> Delete
                                </>
                              }
                              confirmLabel="Sure?"
                              title={`Take ${c.name} off the sheet`}
                              onConfirm={() => void run(async () => (close(), await deleteContact(c.id)))}
                            />
                          </>
                        )}
                      </Menu>
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="dash-panel sheet-section">
          <h2>
            Where things are <Info>Papers, keys, documents, and where passwords are kept (never the passwords themselves).</Info>
          </h2>
          {unlocked ? (
            <NoteBox value={sheet.whereThings ?? ''} onSave={(text) => run(() => setWhereThings(text))} />
          ) : (
            <p className={`sheet-note-print${sheet.whereThings ? '' : ' muted small'}`}>{sheet.whereThings ?? 'Nothing noted yet.'}</p>
          )}
        </section>
      </div>

      <section className="dash-panel sheet-section">
        <h2>
          Accounts{' '}
          <Info>From Wealth, with the latest balance noted. Add or change accounts there. In the last column, note how someone else gets to each one, like “Revolut app on my phone, card in the drawer”.</Info>
        </h2>
        {own.length + owe.length === 0 ? (
          <p className="muted small">No accounts yet. Add them in Wealth.</p>
        ) : (
          <table className="progress-table sheet-table">
            <colgroup>
              <col className="sheet-col-name" />
              <col className="sheet-col-type" />
              <col className="sheet-col-balance" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th className="num">Balance</th>
                <th>How to get to it</th>
              </tr>
            </thead>
            {own.length > 0 && (
              <tbody className="block-savings">
                <tr className="block-row block-head">
                  <th colSpan={4}>Own</th>
                </tr>
                {own.map((a) => (
                  <tr key={a.account.id}>
                    <td>{a.account.name}</td>
                    <td className="muted">{kindLabel(a.account)}</td>
                    <td className="num">{a.cents === null ? '–' : <Balance cents={a.cents} month={a.month} thisMonth={month} />}</td>
                    <td>
                      {unlocked ? <AccessInput id={a.account.id} name={a.account.name} value={a.account.access ?? ''} run={run} /> : <span className="sheet-wrap">{a.account.access ?? ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
            {owe.length > 0 && (
              <tbody className="block-expenses">
                <tr className="block-row block-head">
                  <th colSpan={4}>Owe</th>
                </tr>
                {owe.map((a) => (
                  <tr key={a.account.id}>
                    <td>
                      {a.account.name}
                      {a.monthlyCents !== null && (
                        <span className="sheet-sub">
                          {formatMoney(a.monthlyCents)} a month{a.endMonth ? `, paid off in ${monthLabel(a.endMonth)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="muted">{kindLabel(a.account)}</td>
                    <td className="num">{a.cents === null ? '–' : <Balance cents={a.cents} month={a.month} thisMonth={month} />}</td>
                    <td>
                      {unlocked ? <AccessInput id={a.account.id} name={a.account.name} value={a.account.access ?? ''} run={run} /> : <span className="sheet-wrap">{a.account.access ?? ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        )}
      </section>

      <section className="dash-panel sheet-section">
        <h2>
          Bills and subscriptions{' '}
          <Info>From Upcoming: what keeps being paid, and how much notice a contract needs to be cancelled. Loans are under Accounts.</Info>
        </h2>
        {bills.length === 0 ? (
          <p className="muted small">Nothing found yet. Upcoming fills this in from Tracking, the Planner and what you add there.</p>
        ) : (
          <table className="progress-table sheet-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>How often</th>
                <th>Next</th>
                <th>Notice to cancel</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.sourceKey}>
                  <td>{b.name}</td>
                  <td className="muted">{categoryName(b.categoryId)}</td>
                  <td>{REPEAT_LABELS[b.repeat]}</td>
                  <td>{b.monthOnly ? monthLabel(b.date.slice(0, 7) as MonthKey, 'month') : sheetDate(b.date, today)}</td>
                  <td>{noticeLabel(b.noticeDays)}</td>
                  <td className="num">{b.cents === null ? '' : formatMoney(b.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {warranties.length > 0 && (
        <section className="dash-panel sheet-section">
          <h2>
            Warranties <Info>Things you own that are still covered, from the Wishlist.</Info>
          </h2>
          <table className="progress-table sheet-table">
            <thead>
              <tr>
                <th>Thing</th>
                <th>Bought</th>
                <th>Covered until</th>
              </tr>
            </thead>
            <tbody>
              {warranties.map((w) => (
                <tr key={w.id}>
                  <td>
                    {w.name}
                    {w.brand && <span className="muted"> · {w.brand}</span>}
                  </td>
                  <td>{w.purchasedOn ? sheetDate(w.purchasedOn, today) : ''}</td>
                  <td>{sheetDate(w.warrantyUntil!, today)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="sheet-footer muted small">Printed from Pulse on {sheetDate(today, today)} {today.slice(0, 4)}. Balances are the latest noted, not live.</p>

      </div>
      {editing && <ContactDialog contact={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Popup>,
    document.body,
    )
  )
}

/**
 * Prints the sheet. Inside the claude.ai preview the browser won't open its print window, so the sheet is
 * saved as a page instead, which opens its print window by itself.
 */
async function printSheet(body: HTMLElement | null) {
  if (window.self === window.top) {
    document.body.classList.add('printing-sheet')
    const done = () => (document.body.classList.remove('printing-sheet'), window.removeEventListener('afterprint', done))
    window.addEventListener('afterprint', done)
    window.print()
    return
  }
  if (!body) return
  const copy = body.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.no-print, textarea, input, .info').forEach((el) => el.remove())
  const css = [...document.styleSheets]
    .map((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText).join('\n')
      } catch {
        return ''
      }
    })
    .join('\n')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Emergency sheet</title><style>${css}</style><style>.print-only,.sheet-footer{display:block}body{background:#fff;padding:1.5rem}</style></head><body class="sheet-file">${copy.outerHTML}<script>window.onload=()=>print()</script></body></html>`
  await saveFile('Emergency sheet.html', new Blob([html], { type: 'text/html' }))
}

/** A balance, with the month it's from when that isn't this month. */
function Balance({ cents, month, thisMonth }: { cents: number; month: MonthKey | null; thisMonth: MonthKey }) {
  return (
    <>
      {formatMoney(cents)}
      {month && month !== thisMonth && <span className="worth-stale"> ({monthLabel(month, 'month')})</span>}
    </>
  )
}

/** A note typed straight into the table; saved when you leave it. */
function AccessInput({ id, name, value, run }: { id: string; name: string; value: string; run: ReturnType<typeof useErrorMessage>['run'] }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const box = useRef<HTMLTextAreaElement>(null)
  // As tall as its text, so a long note makes the row taller instead of running past the edge.
  useEffect(() => {
    const fit = () => {
      const el = box.current
      if (!el || el.scrollHeight === 0) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
    fit()
    // The window may still be opening, with nothing measured yet.
    const frame = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(frame)
  }, [draft])
  return (
    <>
      <textarea
        ref={box}
        rows={1}
        className="sheet-input no-print"
        aria-label={`How to get to ${name}`}
        placeholder="Add a note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && void run(() => setAccountAccess(id, draft))}
        onKeyDown={(e) => {
          // Enter saves; Shift+Enter starts a new line.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
      <span className="print-only sheet-wrap">{value}</span>
    </>
  )
}

function NoteBox({ value, onSave }: { value: string; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <>
      <textarea
        className="sheet-note no-print"
        aria-label="Where things are"
        placeholder="Bank papers in the blue folder in the hall cupboard. Spare keys with my sister. Passwords in the password manager; the main one is in the safe."
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft)}
      />
      <p className="sheet-note-print print-only">{value}</p>
    </>
  )
}

function ContactDialog({ contact, onClose }: { contact: EmergencyContact | null; onClose: () => void }) {
  const [name, setName] = useState(contact?.name ?? '')
  const [role, setRole] = useState(contact?.role ?? '')
  const [phone, setPhone] = useState(contact ? (contactPhone(contact) ?? '') : '')
  const [email, setEmail] = useState(contact ? (contactEmail(contact) ?? '') : '')
  const { error, run } = useErrorMessage()
  return (
    <Popup title={contact ? `Edit ${contact.name}` : 'Add a contact'} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await saveContact({ ...(contact ? { id: contact.id } : {}), name, role, phone, email })
            onClose()
          })
        }}
      >
        <label className="wish-field wide">
          <span>Name</span>
          <input autoFocus required placeholder="Your sister, Revolut support…" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="wish-field wide">
          <span>Who they are</span>
          <input placeholder="Sister, accountant, home insurance…" value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>
            Phone <Info>Fill in a phone number, an email, or both.</Info>
          </span>
          <input type="tel" placeholder="+34 600 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="wish-field">
          <span>Email</span>
          <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && (
          <p className="error-box wide" role="alert">
            <AlertIcon /> {error}
          </p>
        )}
        <div className="wish-actions wide">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {contact ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Popup>
  )
}
