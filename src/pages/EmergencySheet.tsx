import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmButton from '../components/ConfirmButton'
import Info from '../components/Info'
import Menu from '../components/Menu'
import { DoneIcon, EditIcon, KeyIcon, PlusIcon, PrintIcon, TrashIcon } from '../components/icons'
import { useErrorMessage } from '../components/useErrorMessage'
import { getSettings } from '../db/actions'
import { db } from '../db/db'
import { checkIn, checkPin, deleteContact, resetPin, saveContact, setAccountAccess, setPin, setWhereThings } from '../db/emergency'
import { changesText, contactEmail, contactPhone, EMPTY_SHEET, nextCheck, sheetAccounts, sheetBills, sheetChanges, sheetWarranties, snapshotOf, type EmergencyContact } from '../domain/emergency'
import { formatMoney } from '../domain/money'
import type { MonthKey } from '../domain/periods'
import { NOTICE_OPTIONS, REPEAT_LABELS, upcomingEvents } from '../domain/upcoming'
import { kindLabel } from '../domain/worth'
import { monthLabel, todayIso } from './tracking/format'
import { AlertIcon } from '../components/TrackingChoice'
import { saveFile } from './settings/BackupPanel'
import { sheetPdf, type PdfSection } from './emergencyPdf'
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
  // It opens as an overview to read and print; Edit asks for the PIN and checks the sheet out, Done checks it back in.
  const [unlocked, setUnlocked] = useState(false)
  const [pinAsk, setPinAsk] = useState<'enter' | 'set' | null>(null)
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null)
  const { error, run } = useErrorMessage()

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
  const changes = sheetChanges(sheet, accounts, bills)
  // Done, or closing the window while editing, counts as a check: Upcoming reminds you again in six months.
  const checkBackIn = () => checkIn(today, snapshotOf(accounts, bills))
  const balanceText = (cents: number | null, from: MonthKey | null) => (cents === null ? '–' : `${formatMoney(cents)}${from && from !== month ? ` (${monthLabel(from, 'month')})` : ''}`)
  const pdf = () => {
    const sections: PdfSection[] = [
      {
        title: 'Who to call',
        text: 'No one yet.',
        head: ['Name', 'Who they are', 'Phone', 'Email'],
        groups: [{ rows: sheet.contacts.map((c) => [c.name, c.role ?? '', contactPhone(c) ?? '', contactEmail(c) ?? '']) }],
      },
      { title: 'Where things are', text: sheet.whereThings ?? 'Nothing noted yet.' },
      {
        title: 'Accounts',
        text: 'No accounts yet.',
        head: ['Account', 'Type', 'Balance', 'How to get to it'],
        widths: [0.24, 0.16, 0.16],
        right: [2],
        groups: [
          ...(own.length ? [{ label: 'Own', tone: 'own' as const, rows: own.map((a) => [a.account.name, kindLabel(a.account), balanceText(a.cents, a.month), a.account.access ?? '']) }] : []),
          ...(owe.length
            ? [
                {
                  label: 'Owe',
                  tone: 'owe' as const,
                  rows: owe.map((a) => [
                    a.account.name + (a.monthlyCents !== null ? `\n${formatMoney(a.monthlyCents)} a month${a.endMonth ? `, paid off in ${monthLabel(a.endMonth)}` : ''}` : ''),
                    kindLabel(a.account),
                    balanceText(a.cents, a.month),
                    a.account.access ?? '',
                  ]),
                },
              ]
            : []),
        ],
      },
      {
        title: 'Bills and subscriptions',
        text: 'Nothing found yet.',
        head: ['Name', 'Category', 'How often', 'Next', 'Notice to cancel', 'Amount'],
        right: [5],
        groups: [
          {
            rows: bills.map((b) => [
              b.name,
              categoryName(b.categoryId),
              REPEAT_LABELS[b.repeat],
              b.monthOnly ? monthLabel(b.date.slice(0, 7) as MonthKey, 'month') : sheetDate(b.date, today),
              noticeLabel(b.noticeDays),
              b.cents === null ? '' : formatMoney(b.cents),
            ]),
          },
        ],
      },
    ]
    if (warranties.length)
      sections.push({
        title: 'Warranties',
        head: ['Thing', 'Bought', 'Covered until'],
        groups: [{ rows: warranties.map((w) => [w.name + (w.brand ? ` · ${w.brand}` : ''), w.purchasedOn ? sheetDate(w.purchasedOn, today) : '', sheetDate(w.warrantyUntil!, today)]) }],
      })
    const checked = `${sheet.checkedOn ? `Last checked on ${sheetDate(sheet.checkedOn, today)}` : 'Not checked yet'}${due ? ` · next check ${sheetDate(due, today)}` : ''}`
    return sheetPdf('Emergency sheet', checked, sections, `Printed from Pulse on ${sheetDate(today, today)} ${today.slice(0, 4)}. Balances are the latest noted, not live.`)
  }
  const close = () => (unlocked ? void run(async () => (await checkBackIn(), onClose())) : onClose())

  return (
    createPortal(
    <Popup title="Emergency sheet" onClose={close} className="emergency-dialog">
      <div className="emergency-body">
      <div className="sheet-top">
        <p className="sheet-checked muted small">
          <span className="print-only sheet-title">Emergency sheet</span>
          {sheet.checkedOn ? `Last checked on ${sheetDate(sheet.checkedOn, today)}` : 'Not checked yet'}
          {due && ` · next check ${sheetDate(due, today)}`}
          {sheet.pinResetOn && <span className="no-print"> · PIN reset on {sheetDate(sheet.pinResetOn, today)}</span>}{' '}
          <Info>
            What someone handling your money for you would need: who to call, where things are, your accounts, your bills
            and your warranties. Print it, or save it as a PDF, and keep it somewhere a person you trust can find it. Most of
            it comes from Wealth, Upcoming and the Wishlist. Never write passwords or PINs here: say where they are kept instead.
            Editing asks for your PIN; when you click Done, the sheet counts as checked and Upcoming reminds you again in 6
            months, or sooner when an account or a bill is added or removed.
          </Info>
        </p>
        <div className="toolbox no-print" role="toolbar" aria-label="Tools">
          {unlocked && (
            <button type="button" className="tool" aria-label="Change PIN" title="Change PIN" onClick={() => setPinAsk('set')}>
              <KeyIcon />
            </button>
          )}
          {unlocked ? (
            <button
              type="button"
              className="tool"
              aria-label="Done"
              title="Done: back to the overview, and the sheet counts as checked today"
              onClick={() => void run(async () => (await checkBackIn(), setUnlocked(false)))}
            >
              <DoneIcon />
            </button>
          ) : (
            <button type="button" className="tool" aria-label="Edit" title="Edit the sheet (asks for your PIN)" onClick={() => setPinAsk(sheet.pinHash ? 'enter' : 'set')}>
              <EditIcon />
            </button>
          )}
          <button type="button" className="tool" aria-label="Print" title="Print, or save as a PDF" onClick={() => void run(() => printSheet(pdf))}>
            <PrintIcon />
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {changes && sheet.checkedOn && (
        <p className="sheet-changes no-print">
          <strong>{changesText(changes)}</strong> since {sheetDate(sheet.checkedOn, today)}{' '}
          <Info>
            {[
              changes.newAccounts.length > 0 && `New accounts: ${changes.newAccounts.join(', ')}.`,
              changes.goneAccounts.length > 0 && `Accounts gone: ${changes.goneAccounts.join(', ')}.`,
              changes.newBills.length > 0 && `New bills: ${changes.newBills.join(', ')}.`,
              changes.goneBills.length > 0 && `Bills gone: ${changes.goneBills.join(', ')}.`,
            ]
              .filter(Boolean)
              .join(' ')}{' '}
            Edit the sheet to look them over; clicking Done counts as checked.
          </Info>
        </p>
      )}

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
      {pinAsk && (
        <PinDialog
          mode={pinAsk}
          changing={unlocked}
          today={today}
          onMode={setPinAsk}
          onClose={() => setPinAsk(null)}
          onUnlock={() => (setPinAsk(null), setUnlocked(true))}
        />
      )}
    </Popup>,
    document.body,
    )
  )
}

/**
 * Prints the sheet. Inside the claude.ai preview the browser won't open its print window, so the sheet is
 * saved as a PDF instead.
 */
async function printSheet(pdf: () => Blob) {
  if (window.self === window.top) {
    document.body.classList.add('printing-sheet')
    const done = () => (document.body.classList.remove('printing-sheet'), window.removeEventListener('afterprint', done))
    window.addEventListener('afterprint', done)
    window.print()
    return
  }
  await saveFile('Emergency sheet.pdf', pdf())
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

/** Asks for the PIN before the sheet can be changed, or sets one. A soft lock: "Forgot PIN" lets anyone set a new one, and the sheet then says so. */
function PinDialog({ mode, changing, today, onMode, onClose, onUnlock }: { mode: 'enter' | 'set'; changing: boolean; today: string; onMode: (mode: 'set') => void; onClose: () => void; onUnlock: () => void }) {
  const [pin, setPinText] = useState('')
  const [repeat, setRepeat] = useState('')
  const { error, run } = useErrorMessage()
  const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6)
  const title = mode === 'enter' ? 'Enter your PIN' : changing ? 'Change PIN' : 'Set a PIN'
  return (
    <Popup title={title} onClose={onClose} className="small-dialog">
      <form
        className="wish-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            if (mode === 'enter') {
              if (!(await checkPin(pin))) throw new Error('That PIN isn’t right.')
            } else {
              await setPin(pin, repeat)
            }
            if (changing) onClose()
            else onUnlock()
          })
        }}
      >
        <label className={`wish-field${mode === 'enter' ? ' wide' : ''}`}>
          <span>
            {mode === 'enter' ? 'PIN' : 'New PIN'}{' '}
            {mode === 'set' && (
              <Info>
                4 to 6 digits. Anyone can read and print the sheet; only someone with the PIN can change it. It keeps edits
                away from others, but it isn’t a safe: “Forgot PIN” lets anyone set a new one, and the sheet then shows the day it
                was reset.
              </Info>
            )}
          </span>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="pin-input"
            value={pin}
            onChange={(e) => setPinText(digits(e.target.value))}
          />
        </label>
        {mode === 'set' && (
          <label className="wish-field">
            <span>Repeat it</span>
            <input type="password" inputMode="numeric" autoComplete="off" className="pin-input" value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} />
          </label>
        )}
        {error && (
          <p className="error-box wide" role="alert">
            <AlertIcon /> {error}
          </p>
        )}
        <div className="wish-actions wide">
          {mode === 'enter' && (
            <ConfirmButton
              className="push-left"
              label="Forgot PIN?"
              confirmLabel="Reset it?"
              title="Take the PIN away and set a new one. The sheet will show the day it was reset."
              onConfirm={() => void run(async () => (await resetPin(today), setPinText(''), onMode('set')))}
            />
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {mode === 'enter' ? 'Unlock' : 'Save PIN'}
          </button>
        </div>
      </form>
    </Popup>
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
