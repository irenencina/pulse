import { merchantKey, type Pocket, type Transaction } from './transactions'
import type { Block, Category } from './types'

/**
 * Suggests categories for bank rows nothing else could place. It runs entirely in the
 * browser: a small naive Bayes model that learns from the transactions you already
 * categorised, started off with a built-in list of common shops. The `Suggester` shape
 * lets another engine (a downloaded language model, or Claude) take its place later.
 */
export interface SuggestInput {
  description: string
  pocket: string | null
  cents: number
}

export interface Suggestion {
  categoryId: string
  /** 0..1, how sure the model is. */
  confidence: number
}

export type Suggester = (
  rows: SuggestInput[],
  categories: Category[],
  history: Transaction[],
  pockets: Pocket[],
) => Promise<Array<Suggestion | null>>

/** Kinds of spending, each with words that name it in category names and shops that belong to it. */
const KINDS: Array<{ names: string[]; shops: string[]; block: Block }> = [
  {
    block: 'expenses',
    names: ['grocer', 'supermarket', 'food', 'household', 'boodschap'],
    shops: ['albert heijn', 'ah to go', 'jumbo', 'lidl', 'aldi', 'dirk', 'coop', 'plus', 'spar', 'vomar', 'hoogvliet', 'ekoplaza', 'picnic', 'mercadona', 'carrefour', 'dia', 'eroski', 'tesco', 'sainsbury', 'rewe', 'edeka', 'kiosk'],
  },
  {
    block: 'expenses',
    names: ['transport', 'commut', 'car', 'fuel'],
    shops: ['ns reizigers', 'ns ', 'gvb', 'ret', 'htm', 'arriva', 'qbuzz', 'keolis', 'uber', 'bolt', 'renfe', 'shell', 'bp', 'esso', 'total', 'tinq', 'q park', 'ov chipkaart'],
  },
  {
    block: 'expenses',
    names: ['vacation', 'holiday', 'trip', 'travel'],
    shops: ['easyjet', 'ryanair', 'klm', 'transavia', 'vueling', 'iberia', 'booking', 'airbnb', 'hostel', 'hotel', 'flixbus'],
  },
  {
    block: 'expenses',
    names: ['subscription', 'streaming'],
    shops: ['spotify', 'netflix', 'disney', 'google play', 'apple com', 'icloud', 'youtube', 'hbo', 'videoland', 'prime video', 'audible', 'chatgpt', 'claude'],
  },
  {
    block: 'expenses',
    names: ['sport', 'gym', 'fitness'],
    shops: ['basic fit', 'basic-fit', 'sportcity', 'anytime fitness', 'decathlon', 'deporvillage', 'bike', 'klimcentrum', 'climbing', 'triathlon', 'voetbal', 'sportcentrum', 'zwembad', 'padel'],
  },
  {
    block: 'expenses',
    names: ['cloth', 'fashion', 'apparel'],
    shops: ['zalando', 'h&m', 'h m', 'primark', 'zara', 'uniqlo', 'c&a', 'c a', 'we fashion', 'only', 'vinted', 'mango', 'pull bear'],
  },
  {
    block: 'expenses',
    names: ['shopping', 'present', 'gift'],
    shops: ['amazon', 'bol com', 'ebay', 'coolblue', 'mediamarkt', 'ikea', 'action', 'hema', 'blokker', 'packlink'],
  },
  {
    block: 'expenses',
    names: ['medicine', 'body', 'pharma', 'drug', 'personal care'],
    shops: ['kruidvat', 'etos', 'trekpleister', 'drogisterij', 'apotheek', 'pharmacy', 'farmacia', 'boots', 'douglas', 'rituals', 'tandarts', 'huisarts'],
  },
  {
    block: 'expenses',
    names: ['fun', 'leisure', 'entertain', 'going out', 'restaurant', 'eat'],
    shops: ['eventix', 'ticketmaster', 'idticketing', 'pathe', 'vue', 'kinepolis', 'cafe', 'bar ', 'restaurant', 'thuisbezorgd', 'uber eats', 'deliveroo', 'mcdonald', 'burger king', 'starbucks', 'kantine'],
  },
  {
    block: 'expenses',
    names: ['utilit', 'energy', 'internet', 'phone'],
    shops: ['vattenfall', 'eneco', 'essent', 'greenchoice', 'ziggo', 'kpn', 'odido', 't mobile', 'vodafone', 'simyo', 'lebara', 'waternet', 'vitens'],
  },
  {
    block: 'expenses',
    names: ['rent', 'housing', 'mortgage'],
    shops: ['wonen', 'woningcorporatie', 'huur', 'vesteda'],
  },
  {
    block: 'expenses',
    names: ['insurance'],
    shops: ['zilveren kruis', 'cz ', 'vgz', 'menzis', 'ohra', 'centraal beheer', 'interpolis', 'fbto', 'nn ', 'allianz'],
  },
  {
    block: 'expenses',
    names: ['education', 'study', 'course', 'school', 'book'],
    shops: ['duo', 'udemy', 'coursera', 'universiteit', 'university', 'bruna', 'boekhandel', 'studystore'],
  },
  { block: 'income', names: ['interest', 'other'], shops: ['interest on'] },
  { block: 'income', names: ['job', 'salary', 'net', 'wage'], shops: [' bv', ' b v', ' b.v', ' sl', ' gmbh', ' ltd'] },
]

const words = (text: string) => merchantKey(text).split(' ').filter((w) => w.length > 1)

/** Features of a row: its words, the letters inside them (so "Jumbo Supermarkt" ~ "Jumbo"), its pocket and direction. */
function features(r: SuggestInput): string[] {
  const out: string[] = []
  for (const w of words(r.description)) {
    out.push(`w:${w}`)
    const padded = `^${w}$`
    for (let i = 0; i + 3 <= padded.length; i++) out.push(`g:${padded.slice(i, i + 3)}`)
  }
  if (r.pocket) out.push(`p:${r.pocket.toLowerCase()}`)
  out.push(r.cents > 0 ? 'd:in' : 'd:out')
  return out
}

/** The kinds a category's name points to, e.g. "Sports & Gym" -> sport. Matches word starts, so "Transportation" isn't sport. */
function kindsOf(category: Category): number[] {
  const name = ` ${category.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')}`
  return KINDS.flatMap((k, i) => (k.block === category.block && k.names.some((n) => name.includes(` ${n}`)) ? [i] : []))
}

function shopKinds(description: string): number[] {
  const text = ` ${merchantKey(description)} `
  return KINDS.flatMap((k, i) => (k.shops.some((s) => text.includes(s.startsWith(' ') ? s : ` ${s}`)) ? [i] : []))
}

/** The local engine: naive Bayes over your own history, with the shop list as a head start. */
export const localSuggester: Suggester = async (rows, categories, history, pockets) => {
  const live = categories.filter((c) => !c.archived)
  const trained = history.filter((t) => t.categoryId !== null && live.some((c) => c.id === t.categoryId))
  const counts = new Map<string, Map<string, number>>()
  const totals = new Map<string, number>()
  const background = new Map<string, number>()
  let all = 0
  for (const t of trained) {
    const id = t.categoryId!
    const f = counts.get(id) ?? new Map<string, number>()
    for (const feature of features({ description: t.details, pocket: t.pocket ?? null, cents: t.block === 'income' ? 1 : -1 })) {
      f.set(feature, (f.get(feature) ?? 0) + 1)
      totals.set(id, (totals.get(id) ?? 0) + 1)
      background.set(feature, (background.get(feature) ?? 0) + 1)
      all++
    }
    counts.set(id, f)
  }
  const vocabulary = background.size + 1
  const kindsByCategory = new Map(live.map((c) => [c.id, kindsOf(c)]))

  return rows.map((row) => {
    const incoming = row.cents > 0
    const candidates = live.filter((c) => (incoming ? c.block === 'income' : c.block !== 'income'))
    if (candidates.length === 0) return null
    const linked = row.pocket ? (pockets.find((p) => p.name === row.pocket)?.categoryIds ?? []) : []
    const shop = shopKinds(row.description)
    const f = features(row)
    const scores = candidates.map((c) => {
      // How much more likely this row's words are under the category than under all your
      // transactions together (naive Bayes log-likelihood ratio). Categories you never
      // used start at 0, so the shop list decides for them.
      let score = 0
      const own = counts.get(c.id)
      if (own) {
        const size = totals.get(c.id)! + vocabulary
        for (const feature of f) {
          score += Math.log(((own.get(feature) ?? 0) + 1) / size) - Math.log(((background.get(feature) ?? 0) + 1) / (all + vocabulary))
        }
      }
      if (shop.some((k) => kindsByCategory.get(c.id)!.includes(k))) score += 3
      if (linked.includes(c.id)) score += 2
      return { id: c.id, score }
    })
    scores.sort((a, b) => b.score - a.score)
    // Softmax over the top scores gives a confidence between 0 and 1.
    const max = scores[0]!.score
    const sumExp = scores.reduce((s, x) => s + Math.exp(x.score - max), 0)
    const confidence = 1 / sumExp
    const learned = counts.get(scores[0]!.id)
    const evidence = shop.length > 0 || f.some((feature) => feature.startsWith('w:') && learned?.has(feature))
    if (!evidence || confidence < 0.35) return null
    return { categoryId: scores[0]!.id, confidence }
  })
}
