export interface PromptEnhancementConfig {
  enabled: boolean
  autoCorrect: boolean
  expandAbbreviations: boolean
  normalizeWhitespace: boolean
  fixGrammar: boolean
}

export interface EnhancementResult {
  enhanced: string
  changes: EnhancementChange[]
}

export interface EnhancementChange {
  type: "correction" | "expansion" | "normalization" | "grammar"
  original: string
  replacement: string
  reason: string
}

const abbreviations: Record<string, string> = {
  btw: "by the way",
  idk: "I don't know",
  imo: "in my opinion",
  imho: "in my humble opinion",
  fyi: "for your information",
  asap: "as soon as possible",
  tbh: "to be honest",
  lol: "laughing out loud",
  lmao: "laughing my ass off",
  omg: "oh my god",
  omfg: "oh my fucking god",
  wtf: "what the fuck",
  wth: "what the hell",
  idc: "I don't care",
  pls: "please",
  plz: "please",
  thx: "thanks",
  thnx: "thanks",
  u: "you",
  ur: "your",
  r: "are",
  b4: "before",
  "2": "to",
  "4": "for",
  bc: "because",
  bcz: "because",
  cz: "because",
  cuz: "because",
  coz: "because",
  doin: "doing",
  goin: "going",
  readin: "reading",
  writin: "writing",
  thinkin: "thinking",
  lovin: "loving",
  gotta: "got to",
  wanna: "want to",
  gonna: "going to",
  kinda: "kind of",
  sorta: "sort of",
  outta: "out of",
  lotta: "lot of",
  dunno: "don't know",
  coulda: "could have",
  woulda: "would have",
  shoulda: "should have",
  aint: "is not",
  cant: "can't",
  wont: "won't",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnot: "wasn't",
  hasnot: "hasn't",
  havenot: "haven't",
  hadnot: "hadn't",
  couldnot: "couldn't",
  wouldnot: "wouldn't",
  shouldnot: "shouldn't",
  wouldve: "would have",
  couldve: "could have",
  shouldve: "should have",
  mightve: "might have",
  mustve: "must have",
  yall: "you all",
  alot: "a lot",
}

const commonCorrections: Record<string, { replacement: string; reason: string }> = {
  teh: { replacement: "the", reason: "Common typo" },
  hte: { replacement: "the", reason: "Common typo" },
  thier: { replacement: "their", reason: "Common typo" },
  wierd: { replacement: "weird", reason: "Common typo" },
  recieve: { replacement: "receive", reason: "Common typo" },
  definate: { replacement: "definite", reason: "Common typo" },
  definately: { replacement: "definitely", reason: "Common typo" },
  occured: { replacement: "occurred", reason: "Common typo" },
  seperate: { replacement: "separate", reason: "Common typo" },
  untill: { replacement: "until", reason: "Common typo" },
  begining: { replacement: "beginning", reason: "Common typo" },
  beleive: { replacement: "believe", reason: "Common typo" },
  calender: { replacement: "calendar", reason: "Common typo" },
  committment: { replacement: "commitment", reason: "Common typo" },
  concensus: { replacement: "consensus", reason: "Common typo" },
  embarass: { replacement: "embarrass", reason: "Common typo" },
  enviroment: { replacement: "environment", reason: "Common typo" },
  goverment: { replacement: "government", reason: "Common typo" },
  independant: { replacement: "independent", reason: "Common typo" },
  intresting: { replacement: "interesting", reason: "Common typo" },
  knowlege: { replacement: "knowledge", reason: "Common typo" },
  neccessary: { replacement: "necessary", reason: "Common typo" },
  occassion: { replacement: "occasion", reason: "Common typo" },
  oportunity: { replacement: "opportunity", reason: "Common typo" },
  paralell: { replacement: "parallel", reason: "Common typo" },
  persistant: { replacement: "persistent", reason: "Common typo" },
  posession: { replacement: "possession", reason: "Common typo" },
  prefered: { replacement: "preferred", reason: "Common typo" },
  privelege: { replacement: "privilege", reason: "Common typo" },
  priviledge: { replacement: "privilege", reason: "Common typo" },
  profesional: { replacement: "professional", reason: "Common typo" },
  publically: { replacement: "publicly", reason: "Common typo" },
  realy: { replacement: "really", reason: "Common typo" },
  recomend: { replacement: "recommend", reason: "Common typo" },
  refered: { replacement: "referred", reason: "Common typo" },
  remmember: { replacement: "remember", reason: "Common typo" },
  responsability: { replacement: "responsibility", reason: "Common typo" },
  substract: { replacement: "subtract", reason: "Common typo" },
  successfull: { replacement: "successful", reason: "Common typo" },
  suprise: { replacement: "surprise", reason: "Common typo" },
  tommorow: { replacement: "tomorrow", reason: "Common typo" },
  tommorrow: { replacement: "tomorrow", reason: "Common typo" },
  truely: { replacement: "truly", reason: "Common typo" },
  usefull: { replacement: "useful", reason: "Common typo" },
  writting: { replacement: "writing", reason: "Common typo" },
}

function normalizeWhitespace(text: string): EnhancementResult {
  let enhanced = text
  const changes: EnhancementChange[] = []

  const original = enhanced
  enhanced = enhanced.replace(/\s+/g, " ")
  enhanced = enhanced.trim()

  if (enhanced !== original) {
    changes.push({
      type: "normalization",
      original: original,
      replacement: enhanced,
      reason: "Normalized whitespace",
    })
  }

  return { enhanced, changes }
}

function expandAbbreviations(text: string): EnhancementResult {
  let enhanced = text
  const changes: EnhancementChange[] = []

  for (const [abbr, full] of Object.entries(abbreviations)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi")
    if (regex.test(enhanced)) {
      const original = enhanced
      enhanced = enhanced.replace(regex, full)
      changes.push({
        type: "expansion",
        original: abbr,
        replacement: full,
        reason: "Expanded abbreviation",
      })
    }
  }

  return { enhanced, changes }
}

function autoCorrect(text: string): EnhancementResult {
  let enhanced = text
  const changes: EnhancementChange[] = []

  for (const [incorrect, { replacement, reason }] of Object.entries(commonCorrections)) {
    const regex = new RegExp(`\\b${incorrect}\\b`, "gi")
    if (regex.test(enhanced)) {
      const original = enhanced
      enhanced = enhanced.replace(regex, replacement)
      changes.push({
        type: "correction",
        original: incorrect,
        replacement,
        reason,
      })
    }
  }

  return { enhanced, changes }
}

function fixGrammar(text: string): EnhancementResult {
  let enhanced = text
  const changes: EnhancementChange[] = []

  const original = enhanced

  enhanced = enhanced.replace(/\bi\s+am\b/gi, "I am")
  enhanced = enhanced.replace(/\bi\s+will\b/gi, "I will")
  enhanced = enhanced.replace(/\bi\s+can\b/gi, "I can")
  enhanced = enhanced.replace(/\bi\s+do\b/gi, "I do")

  enhanced = enhanced.replace(/\s+([.?!,])([A-Za-z])/g, "$1$2")

  enhanced = enhanced.replace(/([.?!])\1+/g, "$1")

  const doubleSpace = /\s{2,}/g
  if (doubleSpace.test(enhanced)) {
    const original2 = enhanced
    enhanced = enhanced.replace(doubleSpace, " ")
    if (original2 !== enhanced) {
      changes.push({
        type: "grammar",
        original: original2,
        replacement: enhanced,
        reason: "Fixed spacing",
      })
    }
  }

  if (enhanced !== original) {
    changes.push({
      type: "grammar",
      original: original,
      replacement: enhanced,
      reason: "Grammar fixes",
    })
  }

  return { enhanced, changes }
}

export function enhancePrompt(text: string, config: PromptEnhancementConfig): EnhancementResult {
  if (!config.enabled || !text.trim()) {
    return { enhanced: text, changes: [] }
  }

  let enhanced = text
  const allChanges: EnhancementChange[] = []

  if (config.normalizeWhitespace) {
    const result = normalizeWhitespace(enhanced)
    enhanced = result.enhanced
    allChanges.push(...result.changes)
  }

  if (config.expandAbbreviations) {
    const result = expandAbbreviations(enhanced)
    enhanced = result.enhanced
    allChanges.push(...result.changes)
  }

  if (config.autoCorrect) {
    const result = autoCorrect(enhanced)
    enhanced = result.enhanced
    allChanges.push(...result.changes)
  }

  if (config.fixGrammar) {
    const result = fixGrammar(enhanced)
    enhanced = result.enhanced
    allChanges.push(...result.changes)
  }

  return { enhanced, changes: allChanges }
}

export function getDefaultConfig(): PromptEnhancementConfig {
  return {
    enabled: false,
    autoCorrect: true,
    expandAbbreviations: true,
    normalizeWhitespace: true,
    fixGrammar: false,
  }
}
