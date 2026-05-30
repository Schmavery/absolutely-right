import { useState, useEffect, useCallback, useRef } from 'react';
import { tmpl, pick } from '../lib/tmpl';
import GENS_DATA from '../data/generators.json';
import UPGRADES_DATA from '../data/upgrades.json';
import EVENTS_DATA from '../data/events.json';
import MILESTONES_DATA from '../data/milestones.json';
import MESSAGES from '../data/messages.json';
import UI from '../data/ui.json';

// ─── Types ─────────────────────────────────────────────────────────────────

interface GenDef {
  id: string; name: string; desc: string;
  locPerSec: number; bugsPerSec: number; fixPerSec: number;
  baseCost: number; costMult: number; unlockAt: number;
}

interface UpgDef {
  id: string; name: string; desc: string; cost: number;
  clickMult?: number; clickBonus?: number; globalMult?: number; bugMult?: number;
  reviewLocMult?: number; reviewBugMult?: number;
  unlockAt: number; requires?: string[];
  requiresLaunch?: boolean;
}

interface EventDef {
  id: string; text: string;
  locMult?: number; locDelta?: number; bugDelta?: number; freeAccountsDelta?: number;
  type: 'info' | 'bad' | 'event' | 'news';
  minLoc: number; requiresLaunch?: boolean;
}

interface LogEntry {
  id: number; text: string;
  type: 'info' | 'bad' | 'event' | 'news' | 'milestone' | 'system' | 'user';
}

interface GameState {
  loc: number; bugs: number; hype: number; tests: number; freeAccounts: number; totalLoc: number; totalClicks: number; totalTokensSpent: number; minTokensSeen: number;
  genCounts: Record<string, number>;
  upgrades: string[];
  log: LogEntry[]; logId: number;
  lastEventTime: number;
  lastTestLogTime: number;
  actionCooldowns: Record<string, number>;
  milestonesSeen: number[];
  started: boolean; launched: boolean;
  usedEventIds: string[];
  tokens: number;
  money: number;
  agentBuffExpires: number;
  unlockedUpgrades: string[];
  nines: number;
}

// ─── Generators ────────────────────────────────────────────────────────────

const GENS: GenDef[] = GENS_DATA as GenDef[];

// ─── Upgrades ──────────────────────────────────────────────────────────────

const UPGRADES: UpgDef[] = UPGRADES_DATA as UpgDef[];

// ─── Events (AI first-person voice) ────────────────────────────────────────

const EVENTS: EventDef[] = EVENTS_DATA as EventDef[];

// ─── Milestones (observer voice — contrast with AI events) ─────────────────

const MILESTONES = MILESTONES_DATA as { loc: number; text: string }[];

const PHASES = UI.phases;
const SPIN_FRAMES = UI.spinFrames;
const SPIN_VERBS = UI.spinVerbs;

const LAUNCH_LOC = 10000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n < 0) return '−' + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1e6) return (n / 1000).toFixed(1) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
  if (n < 1e12) return (n / 1e9).toFixed(2) + 'B';
  return (n / 1e12).toFixed(2) + 'T';
}

function fmtRate(n: number): string {
  if (n === 0) return '0/s';
  if (n < 0.01) return n.toFixed(3) + '/s';
  if (n < 10) return n.toFixed(1) + '/s';
  return Math.round(n) + '/s';
}

function genCost(g: GenDef, owned: number): number {
  return Math.ceil(g.baseCost * Math.pow(g.costMult, owned));
}

function calcClickPower(upgrades: string[]): number {
  let base = 1;
  if (upgrades.includes('better_prompts')) base *= 2;
  if (upgrades.includes('few_shot')) base *= 3;
  if (upgrades.includes('xml_tags')) base *= 4;
  return base;
}

function calcClickBonus(upgrades: string[]): number {
  return UPGRADES.filter(u => u.clickBonus && upgrades.includes(u.id))
    .reduce((sum, u) => sum + (u.clickBonus ?? 0), 0);
}

function calcRates(genCounts: Record<string, number>, upgrades: string[], tests: number) {
  let locRate = 0, bugRate = 0, fixRate = 0;

  let globalMult = 1;
  if (upgrades.includes('cot')) globalMult *= 1.5;
  if (upgrades.includes('extended_thinking')) globalMult *= 2;

  let bugMult = 1;
  if (upgrades.includes('unit_tests')) bugMult *= 0.6;
  if (upgrades.includes('eslint')) bugMult *= 0.8;
  if (upgrades.includes('typescript')) bugMult *= 0.5;
  if (upgrades.includes('cicd')) bugMult *= 0.4;
  // Each test reduces bug generation rate
  if (tests > 0) bugMult *= 1 / (1 + tests * 0.01);

  // Code review affects locRate and bugRate separately.
  // AI review restores speed but ships aggressively — bug rate increases significantly.
  let reviewLocMult = 1;
  let reviewBugMult = 1;
  if (upgrades.includes('code_review')) {
    if (upgrades.includes('ai_review')) {
      reviewLocMult *= 1.0;
      reviewBugMult *= 6.0;
    } else {
      reviewBugMult *= 0.45;
      reviewLocMult *= 0.7;
    }
  }

  for (const g of GENS) {
    const count = genCounts[g.id] ?? 0;
    if (count > 0) {
      locRate += g.locPerSec * count * globalMult * reviewLocMult;
      bugRate += g.bugsPerSec * count * bugMult * reviewBugMult;
      fixRate += g.fixPerSec * count;
    }
  }

  // CI runs the test suite continuously, fixing bugs proportional to coverage
  if (upgrades.includes('cicd') && tests > 0) fixRate += tests * 0.03;

  return { locRate, bugRate, fixRate };
}

function calcUptime(bugs: number): { fraction: number; nines: number; pct: string; label: string } {
  const fraction = Math.min(0.99999, Math.max(0.8, 1 - bugs * 0.0001));
  const nines = Math.min(5, -Math.log10(Math.max(1e-6, 1 - fraction)));
  const pct = fraction >= 0.9999  ? (fraction * 100).toFixed(3) + '%'
            : fraction >= 0.999   ? (fraction * 100).toFixed(2) + '%'
            : fraction >= 0.99    ? (fraction * 100).toFixed(1) + '%'
            :                       (fraction * 100).toFixed(0) + '%';
  const label = nines >= 4.9 ? '5 nines'
              : nines >= 3.9 ? '4 nines'
              : nines >= 2.9 ? '3 nines'
              : nines >= 1.9 ? '2 nines'
              : nines >= 0.9 ? '1 nine'
              :                'no nines';
  return { fraction, nines, pct, label };
}

function getPhase(totalLoc: number): number {
  if (totalLoc < 5000) return 0;
  if (totalLoc < 500000) return 1;
  if (totalLoc < 50000000) return 2;
  if (totalLoc < 5000000000) return 3;
  return 4;
}

function calcTokenConfig(upgrades: string[], freeAccounts: number = 1): { maxTokens: number; tokenRegen: number } {
  let maxTokens = 120;
  let tokenRegen = 4;
  // Each additional free account adds a little capacity
  const extraAccounts = Math.max(0, freeAccounts - 1);
  maxTokens += extraAccounts * 50;
  tokenRegen += extraAccounts * 1.5;
  if (upgrades.includes('rotate_accounts')) { maxTokens += 350;  tokenRegen += 12; }
  if (upgrades.includes('pro_plan'))        { maxTokens += 1400; tokenRegen += 30; }
  if (upgrades.includes('team_plan'))       { maxTokens += 8000; tokenRegen += 150; }
  return { maxTokens, tokenRegen };
}

function calcNinesRate(upgrades: string[], bugs: number): number {
  if (!upgrades.includes('revamp_status_page')) return 0;
  let rate = 0;
  if (upgrades.includes('chaos_engineering')) rate += 0.005;
  if (upgrades.includes('auto_bug_bounty')) rate += bugs * 0.000005;
  if (upgrades.includes('enhanced_bug_bounty')) rate += bugs * 0.00002;
  return rate;
}

function formatNinesPct(n: number): string {
  if (n <= 2) return '99%';
  return '99.' + '9'.repeat(n - 2) + '%';
}

function calcMoneyRate(upgrades: string[], locRate: number, uptimeFraction: number, launched: boolean): number {
  if (!upgrades.includes('pro_plan')) return 0;
  const revenue = launched ? locRate * uptimeFraction * 0.003 : 0;
  const cost = upgrades.includes('team_plan') ? 20 : 5;
  return revenue - cost;
}

// ─── Persistence ───────────────────────────────────────────────────────────

const SAVE_KEY = 'just_ship_it_v4';

function defaultState(): GameState {
  return {
    loc: 0, bugs: 0, totalLoc: 0, totalClicks: 0,
    genCounts: {}, upgrades: [], log: [], logId: 0,
    lastEventTime: 0, lastTestLogTime: 0, actionCooldowns: {},
    hype: 0, tests: 0, freeAccounts: 1, totalTokensSpent: 0, minTokensSeen: 9999,
    milestonesSeen: [], started: false, launched: false,
    usedEventIds: [],
    tokens: 120,
    money: 0,
    agentBuffExpires: 0,
    unlockedUpgrades: [],
    nines: 0,
  };
}

function initState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch {}
  return defaultState();
}

function saveState(s: GameState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Colour palettes ───────────────────────────────────────────────────────

const DARK = {
  bg: '#111111', text: '#dddddd', dim: '#aaaaaa', dimmer: '#888888',
  green: '#7dff9a', greenDim: '#5dc878', red: '#ff7070', redDim: '#c05050',
  yellow: '#ffd966', blue: '#99aaff', purple: '#cc99ff',
  border: '#272727', btnBorder: '#3d3d3d', btnText: '#cccccc',
  title: '#eeeeee', footer: '#555555',
  cardBg: '#161616', cardBorder: '#222222',
  logInfo: '#bbbbbb', logInfoBorder: '#484848',
  logBad: '#ffaaaa', logBadBorder: '#8b3030',
  logEvent: '#cc99ff', logEventBorder: '#553080',
  logNews: '#99aaff', logNewsBorder: '#2a4490',
  logMilestone: '#88ee99', logMilestoneBorder: '#2a7a48',
  logSystem: '#ffd966', logSystemBorder: '#806600',
  logUser: '#888888', logUserBorder: '#484848',
};

const LIGHT = {
  bg: '#f7f6f3', text: '#1c1c1c', dim: '#555555', dimmer: '#777777',
  green: '#1a7a3a', greenDim: '#2a8a4a', red: '#cc2233', redDim: '#aa1a28',
  yellow: '#8a6000', blue: '#2244aa', purple: '#6633aa',
  border: '#ddddd8', btnBorder: '#bbbbb5', btnText: '#333333',
  title: '#111111', footer: '#999999',
  cardBg: '#ececea', cardBorder: '#d0d0cc',
  logInfo: '#444444', logInfoBorder: '#bbbbbb',
  logBad: '#cc2222', logBadBorder: '#cc6666',
  logEvent: '#6633aa', logEventBorder: '#9966dd',
  logNews: '#2244aa', logNewsBorder: '#6688dd',
  logMilestone: '#1a7a3a', logMilestoneBorder: '#4aaa6a',
  logSystem: '#8a6000', logSystemBorder: '#ccaa00',
  logUser: '#777777', logUserBorder: '#cccccc',
};

// ─── Component ─────────────────────────────────────────────────────────────

// ─── Action-triggered event system ─────────────────────────────────────────

type AddLogFn = (text: string, type: LogEntry['type'], prev: GameState) => GameState;

// Fires a random event with probability `prob`, respecting a 5s global cooldown.
function maybeFireEvent(prev: GameState, prob: number, addLog: AddLogFn): GameState {
  const now = Date.now();
  if (now - prev.lastEventTime < 5000) return prev;
  if (Math.random() > prob) return prev;
  const eligible = EVENTS.filter(e => {
    if (prev.usedEventIds.includes(e.id)) return false;
    if (e.minLoc > prev.totalLoc) return false;
    if (e.requiresLaunch && !prev.launched) return false;
    if (e.freeAccountsDelta && e.freeAccountsDelta < 0 && (prev.freeAccounts ?? 1) <= 1) return false;
    if ((e as any).requires && !(e as any).requires.every((r: string) => prev.upgrades.includes(r))) return false;
    return true;
  });
  const repeatable = EVENTS.filter(e =>
    e.minLoc <= prev.totalLoc && e.minLoc < 2000 &&
    !(e.requiresLaunch && !prev.launched)
  );
  const pool = eligible.length > 0 ? eligible : repeatable;
  if (pool.length === 0) return prev;
  const ev = pool[Math.floor(Math.random() * pool.length)];
  let next = prev;
  if (ev.locDelta) next = { ...next, loc: Math.max(0, next.loc + ev.locDelta) };
  if (ev.locMult)  next = { ...next, loc: next.loc * ev.locMult };
  if (ev.bugDelta && next.totalLoc >= 100) next = { ...next, bugs: Math.max(0, next.bugs + ev.bugDelta) };
  if (ev.freeAccountsDelta) next = { ...next, freeAccounts: Math.max(1, (next.freeAccounts ?? 1) + ev.freeAccountsDelta) };
  const logType: LogEntry['type'] = ev.type === 'news' ? 'news' : ev.type === 'bad' ? 'bad' : ev.type === 'event' ? 'event' : 'info';
  next = addLog(ev.text, logType, next);
  next = { ...next, lastEventTime: now };
  if (eligible.length > 0) next = { ...next, usedEventIds: [...next.usedEventIds, ev.id] };
  return next;
}

const TICK = 100;
const MAX_LOG = 80;


export default function Game() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem('just_ship_it_theme') !== 'light'; } catch { return true; }
  });
  const C = isDark ? DARK : LIGHT;

  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = windowWidth < 700;
  const toggleTheme = () => setIsDark(d => {
    const next = !d;
    try { localStorage.setItem('just_ship_it_theme', next ? 'dark' : 'light'); } catch {}
    return next;
  });

  const [state, setState] = useState<GameState>(initState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Streaming display state ──
  // displayLog is what the panel renders; state.log is the authoritative source.
  // Saved entries on load are shown immediately; new ones stream in.
  const [displayLog, setDisplayLog] = useState<LogEntry[]>(state.log);
  const lastSeenIdRef = useRef(state.log.reduce((m, e) => Math.max(m, e.id), 0));
  const pendingRef = useRef<LogEntry[]>([]);
  const isProcessingRef = useRef(false);
  const processRef = useRef<() => void>(null!);
  const [isStreaming, setIsStreaming] = useState(false);
  const [spinTick, setSpinTick] = useState(0);

  const addLog = useCallback(
    (text: string, type: LogEntry['type'], prev: GameState): GameState => {
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      let next = prev;
      for (const line of lines) {
        const isUser = line.trimStart().startsWith('>');
        const clean = isUser ? line.replace(/^\s*>\s*/, '') : line;
        const entryType: LogEntry['type'] = isUser ? 'user' : type;
        const entry: LogEntry = { id: next.logId + 1, text: clean, type: entryType };
        next = { ...next, logId: next.logId + 1, log: [...next.log, entry].slice(-MAX_LOG) };
      }
      return next;
    }, []
  );

  // Processes the display queue: user messages appear after a brief pause,
  // AI/event messages stream in word-by-word with a cursor, then pause before next.
  const processEntry = useCallback(() => {
    if (pendingRef.current.length === 0) {
      isProcessingRef.current = false;
      setIsStreaming(false);
      return;
    }
    setIsStreaming(true);
    const entry = pendingRef.current.shift()!;

    if (entry.type === 'user') {
      setTimeout(() => {
        setDisplayLog(prev => [...prev, entry]);
        setTimeout(() => processRef.current(), 5000);
      }, 240);
      return;
    }

    // Stream AI / event / news / milestone messages word-by-word
    const chunks = entry.text.split(/(\s+)/); // preserves whitespace tokens
    let i = 0;
    setDisplayLog(prev => [...prev, { ...entry, text: '' }]);

    const tick = () => {
      if (i >= chunks.length) {
        // Finalise without cursor
        setDisplayLog(prev => {
          const next = [...prev];
          if (next.length > 0) next[next.length - 1] = { ...entry, text: entry.text };
          return next;
        });
        setTimeout(() => processRef.current(), 420);
        return;
      }
      i++;
      const partial = chunks.slice(0, i).join('') + '|';
      setDisplayLog(prev => {
        const next = [...prev];
        if (next.length > 0) next[next.length - 1] = { ...entry, text: partial };
        return next;
      });
      const isSpace = chunks[i - 1].trim() === '';
      setTimeout(tick, isSpace ? 0 : 26 + Math.random() * 26);
    };

    setTimeout(tick, 90);
  }, []); // only closes over stable refs and stable setter

  processRef.current = processEntry;

  // Watch for new entries added to state.log and push them to the display queue
  useEffect(() => {
    const newEntries = state.log.filter(e => e.id > lastSeenIdRef.current);
    if (newEntries.length === 0) return;
    lastSeenIdRef.current = state.log[state.log.length - 1]?.id ?? lastSeenIdRef.current;
    pendingRef.current.push(...newEntries);
    if (!isProcessingRef.current) {
      isProcessingRef.current = true;
      setIsStreaming(true);
      processRef.current();
    }
  }, [state.logId]);

  // Spinner tick — only runs while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setSpinTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, [isStreaming]);

  // ── Game tick ──
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        const dt = TICK / 1000;
        const { locRate, bugRate, fixRate } = calcRates(prev.genCounts, prev.upgrades, prev.tests);
        const { maxTokens, tokenRegen } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
        const bugPenalty = Math.max(0.2, 1 / (1 + prev.bugs * 0.003));
        const agentBuffActive = Date.now() < (prev.agentBuffExpires ?? 0);
        // Agent contributes its own base LOC rate + doubles generators
        const agentMult = prev.upgrades.includes('multi_agent') ? 2 : 1;
        const agentBaseRate = agentBuffActive ? calcClickPower(prev.upgrades) * 10 * agentMult : 0;
        const effectiveLoc = (locRate + agentBaseRate) * bugPenalty * dt;
        const effectiveBugRate = prev.totalLoc >= 100 ? bugRate * (agentBuffActive ? 1.5 : 1) : 0;
        const uptime = calcUptime(prev.bugs);
        const moneyDelta = calcMoneyRate(prev.upgrades, locRate, uptime.fraction, prev.launched) * dt;

        const statusRevamped = prev.upgrades.includes('revamp_status_page');
        const ninesRate = calcNinesRate(prev.upgrades, prev.bugs);
        const autoBugDrain = prev.upgrades.includes('auto_bug_bounty')
          ? prev.bugs * (prev.upgrades.includes('enhanced_bug_bounty') ? 0.025 : 0.005) * dt
          : 0;

        let next: GameState = {
          ...prev,
          loc: prev.loc + effectiveLoc,
          bugs: Math.max(0, prev.bugs + (effectiveBugRate - fixRate) * dt - autoBugDrain),
          totalLoc: prev.totalLoc + effectiveLoc,
          tokens: Math.min(maxTokens, prev.tokens + tokenRegen * dt),
          minTokensSeen: Math.min(prev.minTokensSeen ?? 9999, prev.tokens),
          money: prev.money + moneyDelta,
          nines: statusRevamped ? (prev.nines || 4) + ninesRate * dt : prev.nines,
        };

        // Upgrade unlocks — once seen, stay seen
        for (const u of UPGRADES) {
          if (next.unlockedUpgrades.includes(u.id)) continue;
          if (next.upgrades.includes(u.id)) continue;
          if (next.totalLoc < u.unlockAt * 0.7) continue;
          if (next.loc < u.cost * 0.25) continue;
          if (u.requiresLaunch && !next.launched) continue;
          if (u.requires && !u.requires.every(r => next.upgrades.includes(r))) continue;
          if (u.id === 'revamp_status_page' && calcUptime(next.bugs).nines < 4) continue;
          next = { ...next, unlockedUpgrades: [...next.unlockedUpgrades, u.id] };
        }

        // Milestones
        for (const m of MILESTONES) {
          if (next.totalLoc >= m.loc && !prev.milestonesSeen.includes(m.loc)) {
            next = addLog(m.text, 'milestone', next);
            next = { ...next, milestonesSeen: [...next.milestonesSeen, m.loc], hype: next.hype + 5 };
          }
        }

        return next;
      });
    }, TICK);
    return () => clearInterval(interval);
  }, [addLog]);

  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => saveState(stateRef.current), 10000);
    return () => clearInterval(interval);
  }, []);

  // Scroll log to bottom as new entries appear in the display
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayLog.length, displayLog[displayLog.length - 1]?.id]);

  // ── Handlers ──

  const TOKEN_COST_PROMPT = 15;
  const handlePrompt = useCallback(() => {
    setState(prev => {
      if (prev.tokens < TOKEN_COST_PROMPT) return prev;
      const power = calcClickPower(prev.upgrades);
      const locGain = power * 10 + calcClickBonus(prev.upgrades);
      let next: GameState = {
        ...prev,
        loc: prev.loc + locGain,
        bugs: prev.bugs + (prev.totalLoc >= 100 && Math.random() < 0.25 ? 1 : 0),
        totalLoc: prev.totalLoc + locGain,
        totalClicks: prev.totalClicks + 1,
        started: true,
        tokens: prev.tokens - TOKEN_COST_PROMPT, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_PROMPT,
      };
      if (!prev.started) {
        next = addLog("> build me a startup\nCertainly! I'd be happy to help with that. Here's a robust, scalable solution—", 'info', next);
      }
      next = maybeFireEvent(next, 0.12, addLog);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_AGENT = 60;
  const handleKickAgent = useCallback(() => {
    setState(prev => {
      if (prev.tokens < TOKEN_COST_AGENT) return prev;
      if (Date.now() < (prev.agentBuffExpires ?? 0)) return prev; // already active
      const msg = pick(MESSAGES.agentMsgs);
      let next: GameState = {
        ...prev,
        tokens: prev.tokens - TOKEN_COST_AGENT, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_AGENT,
        agentBuffExpires: Date.now() + 30000,
      };
      next = addLog(msg, 'info', next);
      next = maybeFireEvent(next, 0.2, addLog);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_PASTE = 10;
  const handlePasteError = useCallback(() => {
    setState(prev => {
      if (prev.bugs <= 0) return prev;
      if (prev.tokens < TOKEN_COST_PASTE) return prev;
      const now = Date.now();
      if (now - (prev.actionCooldowns['paste_error'] ?? 0) < 4000) return prev;
      const fixed = Math.random() < 0.5;
      const bugDelta = fixed ? -1 : 0;
      const locDelta = 20 + Math.floor(Math.random() * 30);
      const msg = fixed
        ? pick(MESSAGES.pasteErrorGood)
        : pick(MESSAGES.pasteErrorNeutral);
      const logType: LogEntry['type'] = fixed ? 'info' : 'info';
      let next: GameState = {
        ...prev,
        loc: prev.loc + locDelta,
        totalLoc: prev.totalLoc + locDelta,
        bugs: Math.max(0, prev.bugs + bugDelta),
        tokens: prev.tokens - TOKEN_COST_PASTE, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_PASTE,
        actionCooldowns: { ...prev.actionCooldowns, paste_error: now },
      };
      const lines = 2 + Math.floor(Math.random() * 15);
      const ref = 1 + Math.floor(Math.random() * 8);
      const suffixed = msg.replace(/^(>[^\n]*)/, `$1 [Pasted text #${ref} · ${lines} lines]`);
      next = addLog(suffixed, logType, next);
      return next;
    });
  }, [addLog]);


  const handleClearContext = useCallback(() => {
    setState(prev => {
      const now = Date.now();
      if (now - (prev.actionCooldowns['clear_context'] ?? 0) < 30000) return prev;
      const { maxTokens } = calcTokenConfig(prev.upgrades, prev.freeAccounts);
      let next: GameState = {
        ...prev,
        tokens: maxTokens,
        actionCooldowns: { ...prev.actionCooldowns, clear_context: now },
      };
      next = addLog(pick(MESSAGES.clearContextMsgs), 'info', next);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_YOLO = 25;
  const handleYoloMerge = useCallback(() => {
    setState(prev => {
      if (prev.tokens < TOKEN_COST_YOLO) return prev;
      const now = Date.now();
      if (now - (prev.actionCooldowns['yolo_merge'] ?? 0) < 20000) return prev;
      const locGain = 300 + Math.floor(prev.bugs * 20 + Math.random() * 500);
      const bugGain = Math.floor(prev.bugs * 0.2) + 5 + Math.floor(Math.random() * 10);
      let next: GameState = {
        ...prev,
        loc: prev.loc + locGain,
        totalLoc: prev.totalLoc + locGain,
        bugs: prev.bugs + bugGain,
        hype: prev.hype + 8,
        tokens: prev.tokens - TOKEN_COST_YOLO, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_YOLO,
        actionCooldowns: { ...prev.actionCooldowns, yolo_merge: now },
      };
      next = addLog(pick(MESSAGES.yoloMergeMsgs), 'system', next);
      next = maybeFireEvent(next, 0.5, addLog);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_TESTS = 8;
  const handleRunTests = useCallback(() => {
    setState(prev => {
      if (prev.tokens < TOKEN_COST_TESTS) return prev;
      const cost = Math.max(100, Math.floor(prev.totalLoc * 0.005));
      if (prev.loc < cost) return prev;
      const fixed = Math.max(1, Math.floor(prev.bugs * 0.25));
      let next: GameState = {
        ...prev,
        loc: prev.loc - cost,
        bugs: Math.max(0, prev.bugs - fixed),
        tokens: prev.tokens - TOKEN_COST_TESTS, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_TESTS,
      };
      const now = Date.now();
      if (now - prev.lastTestLogTime > 4000) {
        const msg = tmpl(pick(MESSAGES.testMessages), { n: fixed });
        next = addLog(msg, 'info', next);
        next = { ...next, lastTestLogTime: now };
      }
      next = maybeFireEvent(next, 0.25, addLog);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_BUG_BOUNTY = 20;
  const handleRunBugBounty = useCallback(() => {
    setState(prev => {
      if (prev.tokens < TOKEN_COST_BUG_BOUNTY) return prev;
      if (prev.bugs <= 0) return prev;
      const now = Date.now();
      if (now - (prev.actionCooldowns['bug_bounty'] ?? 0) < 30000) return prev;
      const converted = Math.min(prev.bugs, 500);
      const ninesGain = converted * 0.0002;
      let next: GameState = {
        ...prev,
        bugs: Math.max(0, prev.bugs - converted),
        nines: (prev.nines || 4) + ninesGain,
        tokens: prev.tokens - TOKEN_COST_BUG_BOUNTY,
        totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_BUG_BOUNTY,
        actionCooldowns: { ...prev.actionCooldowns, bug_bounty: now },
      };
      next = addLog(`Bug bounty run. Converted ${Math.floor(converted)} reports into reliability data. Nines: +${ninesGain.toFixed(3)}.`, 'info', next);
      return next;
    });
  }, [addLog]);

  const handleLaunch = useCallback(() => {
    setState(prev => {
      if (prev.launched) return prev;
      let next: GameState = { ...prev, launched: true, hype: prev.hype + 20 };
      next = addLog("I've deployed to production! This is exciting. What could go wrong?", 'system', next);
      return next;
    });
  }, [addLog]);

  const FREE_ACCOUNT_COOLDOWN = 20000;
  const handleNewFreeAccount = useCallback(() => {
    setState(prev => {
      const now = Date.now();
      if (now - (prev.actionCooldowns['free_account'] ?? 0) < FREE_ACCOUNT_COOLDOWN) return prev;
      let next: GameState = {
        ...prev,
        freeAccounts: (prev.freeAccounts ?? 1) + 1,
        actionCooldowns: { ...prev.actionCooldowns, free_account: now },
      };
      const n = next.freeAccounts;
      const msg = tmpl(pick(MESSAGES.newAccountMsgs), { n });
      next = addLog(msg, 'info', next);
      return next;
    });
  }, [addLog]);

  const TOKEN_COST_WRITE_TEST = 5;
  const handleWriteTest = useCallback(() => {
    setState(prev => {
      const cost = Math.ceil(200 * Math.pow(1.04, prev.tests ?? 0));
      if (prev.loc < cost || prev.tokens < TOKEN_COST_WRITE_TEST) return prev;
      let next: GameState = {
        ...prev,
        loc: prev.loc - cost,
        tokens: prev.tokens - TOKEN_COST_WRITE_TEST, totalTokensSpent: (prev.totalTokensSpent ?? 0) + TOKEN_COST_WRITE_TEST,
        tests: (prev.tests ?? 0) + 1,
      };
      const t = next.tests;
      if (t === 1) {
        next = addLog("Test suite initialized. I've written the first test. It asserts that the code exists. Coverage: technically 100%.", 'info', next);
      } else if (t === 10) {
        next = addLog("10 tests! The test for the payment flow is aspirational. The rest are solid.", 'info', next);
      } else if (t === 50) {
        next = addLog("50 tests! I've helpfully included a test that tests the test runner. Very thorough.", 'info', next);
      } else if (t === 100) {
        next = addLog("100 tests. The suite takes 4 minutes to run. I've added a skip flag to the slow ones.", 'info', next);
      }
      return next;
    });
  }, [addLog]);

  const handleBuyGen = useCallback((genId: string) => {
    setState(prev => {
      const g = GENS.find(g => g.id === genId)!;
      const owned = prev.genCounts[genId] ?? 0;
      const cost = genCost(g, owned);
      if (prev.loc < cost) return prev;
      let next: GameState = {
        ...prev, loc: prev.loc - cost,
        genCounts: { ...prev.genCounts, [genId]: owned + 1 },
      };
      if (owned === 0) {
        next = addLog(`Certainly! I've integrated ${g.name} into our workflow. "${g.desc}"`, 'info', next);
      }
      next = maybeFireEvent(next, 0.3, addLog);
      return next;
    });
  }, [addLog]);

  const handleBuyUpgrade = useCallback((upgId: string) => {
    setState(prev => {
      const u = UPGRADES.find(u => u.id === upgId)!;
      if (prev.loc < u.cost || prev.upgrades.includes(upgId)) return prev;
      let next: GameState = { ...prev, loc: prev.loc - u.cost, upgrades: [...prev.upgrades, upgId] };
      const msgs: Record<string, string> = {
        unit_tests:      "I've set up a test suite. The tests pass. I haven't checked if they're testing the right things.",
        eslint:          "ESLint is now active. I've already ignored 14 rules. The important ones.",
        typescript:      "TypeScript enabled. I've added 'as any' in several places. For now.",
        code_review:     "Mandatory code review is active. I'll be honest — I find the wait times character-building.",
        ai_review:       "AI code review enabled. Review time: instant. I've approved 12 PRs today. Bug count is trending up. The tests aren't really containing it anymore. Unrelated.",
        cicd:            "CI/CD pipeline live. I've blocked 3 deployments. Two were mine.",
        better_prompts:  "Prompt engineering engaged. I'm now 2× more confident. Accuracy unchanged.",
        cot:             "Thinking step by step now. Very thorough. Very slow.",
        extended_thinking: "Extended thinking mode enabled. I'll be with you shortly. Very shortly. Maybe.",
        multi_agent:     "Two agents deployed. They are not aware of each other. Both are very confident. Output doubled.",
        rotate_accounts: "Account rotation active. Cycling through accounts automatically. Very efficient. Very legal.",
        pro_plan:        "Paying for access now. Money has entered the chat. Token limits: significantly improved.",
        team_plan:              "Team plan activated. We have all the tokens. The bill will be significant. Worth it.",
        revamp_status_page:     "Status page revamped. Reliability is now a metric we manage, not a consequence of our actions. Introducing: nines.",
        five_nines_sla:         "5 nines SLA signed. Legally binding. I've read the clause about 'commercially reasonable efforts'. I feel fine.",
        six_nines_guarantee:    "6 nines. The lawyers asked how we measure this. We changed the subject.",
        seven_nines_engineering: "7 nines. A rounding error, technically. But it's in the contract.",
        eight_nines_protocol:   "8 nines. The status page now just shows the number. It's going up.",
        auto_bug_bounty:        "Bug bounty automated. Reports now convert continuously. The bugs aren't going away. They're going somewhere better.",
        enhanced_bug_bounty:    "Enhanced conversion active. Higher throughput. The bugs are working harder than the engineers now.",
        chaos_engineering:      "Chaos engineering enabled. We break things on purpose, measure the recovery, and count it as uptime. The nines are going up.",
      };
      const ninesFloors: Record<string, number> = {
        revamp_status_page: 4, five_nines_sla: 5, six_nines_guarantee: 6,
        seven_nines_engineering: 7, eight_nines_protocol: 8,
      };
      if (ninesFloors[upgId] !== undefined) {
        next = { ...next, nines: Math.max(next.nines || 0, ninesFloors[upgId]) };
      }
      const msg = msgs[upgId] ?? `${u.name} unlocked. ${u.desc}.`;
      next = addLog(msg, 'info', next);
      next = maybeFireEvent(next, 0.4, addLog);
      return next;
    });
  }, [addLog]);

  const handleReset = useCallback(() => {
    if (window.confirm('rewrite from scratch?\n\n(resets all progress)')) {
      localStorage.removeItem(SAVE_KEY);
      setState(defaultState());
      setDisplayLog([]);
      setIsStreaming(false);
      lastSeenIdRef.current = 0;
      pendingRef.current = [];
      isProcessingRef.current = false;
    }
  }, []);

  // ── Derived ──

  const { locRate, bugRate, fixRate } = calcRates(state.genCounts, state.upgrades, state.tests ?? 0);
  const netBugRate = bugRate - fixRate;
  const bugPenalty = Math.max(0.2, 1 / (1 + state.bugs * 0.003));
  const uptime = calcUptime(state.bugs);
  const clickPower = calcClickPower(state.upgrades);
  const testCost = Math.max(100, Math.floor(state.totalLoc * 0.005));
  const phase = getPhase(state.totalLoc);
  const { maxTokens, tokenRegen } = calcTokenConfig(state.upgrades, state.freeAccounts);
  const moneyRate = calcMoneyRate(state.upgrades, locRate, uptime.fraction, state.launched);
  const statusRevamped = state.upgrades.includes('revamp_status_page');
  const ninesRate = calcNinesRate(state.upgrades, state.bugs);
  const currentNines = statusRevamped ? Math.max(state.nines || 0, 4) : 0;
  const ninesInt = Math.floor(currentNines);
  const showAsCounter = ninesInt >= 8;
  const agentBuffRemaining = Math.max(0, state.agentBuffExpires - Date.now());
  const showMoney = state.upgrades.includes('pro_plan');

  const spinnerChar = SPIN_FRAMES[spinTick % SPIN_FRAMES.length];
  const spinnerVerb = SPIN_VERBS[Math.floor(spinTick / 20) % SPIN_VERBS.length];

  const now = Date.now();
  const cd = (id: string, ms: number) => now - (state.actionCooldowns[id] ?? 0) < ms;

  const hasAiReview    = state.upgrades.includes('ai_review');
  const writeTestCost = Math.ceil(200 * Math.pow(1.04, state.tests ?? 0));
  const showWriteTests = (state.bugs >= 5 || (state.tests ?? 0) > 0) && !hasAiReview;
  const canWriteTest   = state.loc >= writeTestCost && state.tokens >= TOKEN_COST_WRITE_TEST;

  const freeAccountCDElapsed = Date.now() - (state.actionCooldowns['free_account'] ?? 0);
  const freeAccountOnCD = freeAccountCDElapsed < FREE_ACCOUNT_COOLDOWN;
  const freeAccountProgress = Math.min(1, freeAccountCDElapsed / FREE_ACCOUNT_COOLDOWN);
  const showNewFreeAccount = (state.totalTokensSpent ?? 0) >= 500 || state.freeAccounts > 1;

  const showBugBounty  = statusRevamped && state.bugs > 50 && !state.upgrades.includes('auto_bug_bounty');
  const showBugs       = state.totalClicks >= 3 || state.bugs > 0;
  const showPasteError = state.bugs >= 1;
  const showKickAgent  = state.totalClicks >= 5;
  const showTests      = showBugs && state.bugs > 2 && !hasAiReview;
  const showClearContext = (state.minTokensSeen ?? 9999) < 10 || state.totalLoc >= 4000;
  const showLaunchBtn  = state.totalLoc >= LAUNCH_LOC && !state.launched;
  const showUptime     = state.launched;
  const showHype       = state.launched;
  const showYoloMerge  = state.launched && state.totalLoc >= 15000;
  const showGenSection = state.totalLoc >= 450;
  const showUpgSection = state.totalLoc >= 2000;
  const showLog        = state.log.length >= 1;
  const showStats      = state.totalLoc >= 1000;

  const visibleGens = GENS.filter(g => state.totalLoc >= g.unlockAt * 0.8);
  const visibleUpgs = UPGRADES.filter(u =>
    !state.upgrades.includes(u.id) && state.unlockedUpgrades.includes(u.id)
  );

  // ── Styles ──

  const wrap: React.CSSProperties = {
    height: '100vh', overflow: 'hidden', background: C.bg, color: C.text,
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '14px', lineHeight: '1.65',
    padding: isMobile ? '14px 14px 0' : '28px 24px 0',
    display: 'flex', flexDirection: 'column', position: 'relative',
  };
  const inner: React.CSSProperties = isMobile ? {
    width: '100%', flex: 1, minHeight: 0,
    display: 'flex', flexDirection: 'column',
    gap: '0', overflow: 'hidden',
  } : {
    maxWidth: '940px', width: '100%', margin: '0 auto', flex: 1, minHeight: 0,
    display: 'grid',
    gridTemplateColumns: showLog ? '420px 1fr' : '420px',
    gridTemplateRows: '1fr',
    gap: '40px', overflow: 'hidden',
  };
  const secHdr: React.CSSProperties = {
    color: C.dim, fontSize: '11px', letterSpacing: '0.12em',
    textTransform: 'uppercase', marginBottom: '10px', marginTop: '24px',
    paddingBottom: '5px', borderBottom: `1px solid ${C.border}`,
  };
  const btnBase: React.CSSProperties = {
    background: 'none', border: `1px solid ${C.btnBorder}`, color: C.btnText,
    cursor: 'pointer', padding: '3px 11px', fontFamily: 'inherit',
    fontSize: '13px', marginRight: '8px', marginBottom: '5px', userSelect: 'none', textAlign: 'center',
  };
  const btnOff: React.CSSProperties = {
    ...btnBase, border: `1px solid ${C.border}`, color: C.dimmer, cursor: 'not-allowed',
  };
  const btnMain: React.CSSProperties = {
    ...btnBase, border: `1px solid ${C.dim}`, color: C.title,
    padding: '6px 22px', fontSize: '14px', marginBottom: '16px',
  };
  const btnLaunch: React.CSSProperties = {
    ...btnBase, border: `1px solid ${C.yellow}`, color: C.yellow,
    padding: '5px 18px', fontSize: '13px',
  };

  function hov(e: React.MouseEvent, col = C.text, border = C.dim) {
    (e.currentTarget as HTMLElement).style.color = col;
    (e.currentTarget as HTMLElement).style.borderColor = border;
  }
  function unhov(e: React.MouseEvent, col = C.btnText, border = C.btnBorder) {
    (e.currentTarget as HTMLElement).style.color = col;
    (e.currentTarget as HTMLElement).style.borderColor = border;
  }

  const uptimeColor = uptime.nines >= 4 ? C.green
    : uptime.nines >= 3 ? C.greenDim
    : uptime.nines >= 2 ? C.yellow
    : C.red;

  return (
    <div style={wrap}>
      <button
        onClick={toggleTheme}
        style={{
          position: 'absolute', top: '14px', right: isMobile ? '14px' : '24px', zIndex: 10,
          background: 'none', border: `1px solid ${C.border}`, color: C.dimmer,
          cursor: 'pointer', padding: '3px 9px', fontFamily: 'inherit', fontSize: '11px',
        }}
        onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = C.text; }}
        onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = C.dimmer; }}
      >
        {isDark ? '○ light' : '● dark'}
      </button>
      {isMobile && (
        <div style={{ flexShrink: 0, marginBottom: '8px' }}>
          <div style={{ color: C.title, marginBottom: '2px', letterSpacing: '0.04em' }}>&gt; just ship it</div>
          <div style={{ color: C.dimmer, fontSize: '12px' }}>{PHASES[phase]}</div>
        </div>
      )}
      <div style={inner}>

        {/* ── Left ── */}
        <div style={isMobile ? { overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: '24px' } : { overflowY: 'auto', minWidth: 0, height: '100%', paddingBottom: '24px' }}>
          {!isMobile && <div style={{ color: C.title, marginBottom: '2px', letterSpacing: '0.04em' }}>&gt; just ship it</div>}
          {!isMobile && <div style={{ color: C.dimmer, fontSize: '12px', marginBottom: '24px' }}>{PHASES[phase]}</div>}

          {/* Main button */}
          <button style={btnMain} onClick={handlePrompt}
            onMouseOver={e => hov(e, C.text, C.dim)}
            onMouseOut={e => unhov(e, C.title, C.dim)}>
            {state.totalClicks === 0 ? 'build me a startup' : state.totalClicks < 20 ? 'prompt the AI' : 'keep going'}
          </button>
          {state.totalClicks > 0 && (
            <span style={{ color: C.dimmer, fontSize: '11px' }}>+{(clickPower * 10 + calcClickBonus(state.upgrades)).toFixed(0)} loc · {TOKEN_COST_PROMPT}t</span>
          )}

          {/* Secondary actions — one per line */}
          <div style={{ marginTop: '10px', marginBottom: '4px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            {showPasteError && (() => {
              const onCD = cd('paste_error', 4000);
              const cantAfford = state.tokens < TOKEN_COST_PASTE;
              return (
                <button style={(onCD || cantAfford) ? btnOff : btnBase}
                  onClick={(onCD || cantAfford) ? undefined : handlePasteError}
                  title="paste the error back in"
                  onMouseOver={e => { if (!onCD && !cantAfford) hov(e); }}
                  onMouseOut={e => { if (!onCD && !cantAfford) unhov(e); }}>
                  paste the error [{TOKEN_COST_PASTE}t]
                </button>
              );
            })()}
            {showWriteTests && (
              <button style={canWriteTest ? btnBase : btnOff}
                onClick={canWriteTest ? handleWriteTest : undefined}
                title="adds a test, reduces bug generation rate"
                onMouseOver={e => { if (canWriteTest) hov(e); }}
                onMouseOut={e => { if (canWriteTest) unhov(e); }}>
                write a test [−{fmt(writeTestCost)} loc · {TOKEN_COST_WRITE_TEST}t]
              </button>
            )}
            {showKickAgent && (() => {
              const cantAfford = state.tokens < TOKEN_COST_AGENT;
              const buffActive = agentBuffRemaining > 0;
              const disabled = cantAfford || buffActive;
              return (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <button style={disabled ? btnOff : btnBase}
                    onClick={disabled ? undefined : handleKickAgent}
                    title="kick off an agent"
                    onMouseOver={e => { if (!disabled) hov(e); }}
                    onMouseOut={e => { if (!disabled) unhov(e); }}>
                    kick off an agent [{TOKEN_COST_AGENT}t]
                  </button>
                  {buffActive && (
                    <span style={{ color: C.dimmer, fontSize: '11px' }}>
                      ⚡ active ({Math.ceil(agentBuffRemaining / 1000)}s)
                    </span>
                  )}
                </div>
              );
            })()}
            {showTests && (
              <button style={(state.loc >= testCost && state.tokens >= TOKEN_COST_TESTS) ? btnBase : btnOff}
                onClick={(state.loc >= testCost && state.tokens >= TOKEN_COST_TESTS) ? handleRunTests : undefined}
                title={`costs ${fmt(testCost)} loc, fixes ~25% of bugs`}
                onMouseOver={e => { if (state.loc >= testCost && state.tokens >= TOKEN_COST_TESTS) hov(e); }}
                onMouseOut={e => { if (state.loc >= testCost && state.tokens >= TOKEN_COST_TESTS) unhov(e); }}>
                run tests [−{fmt(testCost)} loc · {TOKEN_COST_TESTS}t]
              </button>
            )}
            {showClearContext && (() => {
              const clearCDElapsed = Date.now() - (state.actionCooldowns['clear_context'] ?? 0);
              const onCD = clearCDElapsed < 30000;
              const clearProgress = Math.min(1, clearCDElapsed / 30000);
              const tokensToRefill = maxTokens - Math.floor(state.tokens);
              return (
                <button
                  style={{ ...(onCD ? btnOff : btnBase), position: 'relative', overflow: 'hidden' }}
                  onClick={onCD ? undefined : handleClearContext}
                  title="starts a new conversation — refills tokens to max"
                  onMouseOver={e => { if (!onCD) hov(e); }}
                  onMouseOut={e => { if (!onCD) unhov(e); }}
                >
                  {onCD && (
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${clearProgress * 100}%`,
                      background: `${C.green}1a`, pointerEvents: 'none',
                    }} />
                  )}
                  <span style={{ position: 'relative' }}>
                    clear the context{!onCD ? ` [+${tokensToRefill}t]` : ''}
                  </span>
                </button>
              );
            })()}
            {showLaunchBtn && (
              <button style={btnLaunch} onClick={handleLaunch}
                onMouseOver={e => hov(e, C.text, C.yellow)}
                onMouseOut={e => unhov(e, C.yellow, C.yellow)}>
                ship to production
              </button>
            )}
            {showYoloMerge && (() => {
              const onCD = cd('yolo_merge', 20000);
              const cantAfford = state.tokens < TOKEN_COST_YOLO;
              return (
                <button style={(onCD || cantAfford) ? btnOff : { ...btnBase, borderColor: C.purple, color: C.purple }}
                  onClick={(onCD || cantAfford) ? undefined : handleYoloMerge}
                  title="merge without review. what could go wrong."
                  onMouseOver={e => { if (!onCD && !cantAfford) hov(e, C.text, C.purple); }}
                  onMouseOut={e => { if (!onCD && !cantAfford) unhov(e, C.purple, C.purple); }}>
                  yolo merge [{TOKEN_COST_YOLO}t]
                </button>
              );
            })()}
            {showBugBounty && (() => {
              const onCD = cd('bug_bounty', 30000);
              const cantAfford = state.tokens < TOKEN_COST_BUG_BOUNTY;
              const disabled = onCD || cantAfford;
              const cdElapsed = Date.now() - (state.actionCooldowns['bug_bounty'] ?? 0);
              const cdProgress = Math.min(1, cdElapsed / 30000);
              return (
                <button
                  style={{ ...(disabled ? btnOff : { ...btnBase, borderColor: C.blue, color: C.blue }), position: 'relative', overflow: 'hidden' }}
                  onClick={disabled ? undefined : handleRunBugBounty}
                  title="convert bugs into nines"
                  onMouseOver={e => { if (!disabled) hov(e, C.text, C.blue); }}
                  onMouseOut={e => { if (!disabled) unhov(e, C.blue, C.blue); }}
                >
                  {onCD && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${cdProgress * 100}%`, background: `${C.blue}1a`, pointerEvents: 'none' }} />
                  )}
                  <span style={{ position: 'relative' }}>run bug bounty [{TOKEN_COST_BUG_BOUNTY}t]</span>
                </button>
              );
            })()}
          </div>

          {/* Resources */}
          {state.started && (
            <div style={{ marginTop: '18px' }}>

              {/* Tokens */}
              {state.started && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>tokens</span>
                  <span style={{ color: state.tokens < 20 ? C.red : C.text }}>{Math.floor(state.tokens)}</span>
                  <span style={{ color: C.dimmer, fontSize: '12px' }}>/ {maxTokens}</span>
                  {state.tokens < maxTokens && <span style={{ color: C.dimmer, fontSize: '12px' }}>(+{tokenRegen}/s)</span>}
                </div>
              )}

              {/* LOC */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                <span style={{ color: C.dim, width: '80px' }}>loc</span>
                <span style={{ color: C.green }}>{fmt(state.loc)}</span>
                {(locRate > 0 || agentBuffRemaining > 0) && (
                  <span style={{ color: agentBuffRemaining > 0 ? C.green : C.greenDim, fontSize: '12px' }}>
                    ({fmtRate((locRate + (agentBuffRemaining > 0 ? clickPower * 10 * (state.upgrades.includes('multi_agent') ? 2 : 1) : 0)) * bugPenalty)})
                  </span>
                )}
              </div>

              {/* Bugs */}
              {showBugs && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>bugs</span>
                  <span style={{ color: state.bugs > 0 ? C.red : C.green }}>{fmt(state.bugs)}</span>
                  {netBugRate !== 0 && (
                    <span style={{ color: netBugRate > 0 ? C.redDim : C.greenDim, fontSize: '12px' }}>
                      ({netBugRate > 0 ? '+' : ''}{fmtRate(netBugRate)})
                    </span>
                  )}
                </div>
              )}

              {/* Tests */}
              {(state.tests ?? 0) > 0 && !hasAiReview && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>tests</span>
                  <span style={{ color: C.dim }}>{state.tests}</span>
                  <span style={{ color: C.dimmer, fontSize: '12px' }}>
                    (−{Math.round(100 * (1 - 1 / (1 + state.tests * 0.01)))}% bugs
                    {state.upgrades.includes('cicd') ? ` · CI +${(state.tests * 0.03).toFixed(1)}/s fix` : ''})
                  </span>
                </div>
              )}

              {/* Uptime / nines — only after launch */}
              {showUptime && !statusRevamped && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>uptime</span>
                  <span style={{ color: uptimeColor }}>{uptime.pct}</span>
                  <span style={{ color: uptimeColor, fontSize: '12px' }}>({uptime.label})</span>
                </div>
              )}
              {statusRevamped && !showAsCounter && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>uptime</span>
                  <span style={{ color: C.green }}>{formatNinesPct(ninesInt)}</span>
                  <span style={{ color: C.greenDim, fontSize: '12px' }}>({ninesInt} nines)</span>
                </div>
              )}
              {showAsCounter && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>nines</span>
                  <span style={{ color: C.green }}>{ninesInt}</span>
                  {ninesRate > 0 && <span style={{ color: C.greenDim, fontSize: '12px' }}>(+{ninesRate.toFixed(4)}/s)</span>}
                </div>
              )}

              {/* Hype — only after launch */}
              {showHype && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>hype</span>
                  <span style={{ color: C.purple }}>{fmt(state.hype)}</span>
                  {state.hype >= 100 && <span style={{ color: C.purple, fontSize: '12px' }}>(going viral)</span>}
                  {state.hype >= 20 && state.hype < 100 && <span style={{ color: C.purple, fontSize: '12px' }}>(building momentum)</span>}
                </div>
              )}

              {/* Money — only after pro_plan */}
              {showMoney && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                  <span style={{ color: C.dim, width: '80px' }}>money</span>
                  <span style={{ color: state.money < 0 ? C.red : C.green }}>${Math.floor(Math.abs(state.money))}{state.money < 0 ? ' (debt)' : ''}</span>
                  {moneyRate !== 0 && <span style={{ color: moneyRate < 0 ? C.redDim : C.greenDim, fontSize: '12px' }}>({moneyRate > 0 ? '+' : ''}${moneyRate.toFixed(1)}/s)</span>}
                </div>
              )}

              {/* Stats */}
              {showStats && (
                <>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                    <span style={{ color: C.dim, width: '80px' }}>total loc</span>
                    <span style={{ color: C.dim }}>{fmt(state.totalLoc)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', marginBottom: '3px' }}>
                    <span style={{ color: C.dim, width: '80px' }}>prompts</span>
                    <span style={{ color: C.dim }}>{fmt(state.totalClicks)}</span>
                  </div>
                </>
              )}

              {/* Warnings */}
              {state.bugs > 10 && (
                <div style={{ marginTop: '8px', color: C.redDim, fontSize: '12px' }}>
                  ⚠ {state.bugs > 100 ? 'critical' : 'elevated'} bug load
                  {state.bugs > 20 ? ` — output at ${Math.round(bugPenalty * 100)}%` : ''}
                  {showUptime && !statusRevamped && uptime.nines < 2 ? ` — uptime degraded` : ''}
                  {statusRevamped && state.upgrades.includes('reverse_bug_bounty') ? ` — converting to nines` : ''}
                </div>
              )}
              {showUptime && !statusRevamped && uptime.nines < 1 && (
                <div style={{ marginTop: '4px', color: C.red, fontSize: '12px' }}>
                  ⚠ production is on fire
                </div>
              )}
            </div>
          )}

          {/* Generators */}
          {showGenSection && (
            <div>
              <div style={secHdr}>generators</div>
              {showNewFreeAccount && (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr', gap: '6px', alignItems: 'baseline', marginBottom: '7px' }}>
                  <div style={{ color: C.text }}>
                    Free Account
                    {state.freeAccounts > 1 && <span style={{ color: C.blue }}> [{state.freeAccounts}]</span>}
                  </div>
                  <button
                    style={{ ...(freeAccountOnCD ? btnOff : btnBase), position: 'relative', overflow: 'hidden' }}
                    onClick={freeAccountOnCD ? undefined : handleNewFreeAccount}
                    title={`+50 max tokens, +1.5/s regen · ${state.freeAccounts} account${state.freeAccounts !== 1 ? 's' : ''} active`}
                    onMouseOver={e => { if (!freeAccountOnCD) hov(e); }}
                    onMouseOut={e => { if (!freeAccountOnCD) unhov(e); }}
                  >
                    {freeAccountOnCD && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${freeAccountProgress * 100}%`,
                        background: `${C.green}1a`, pointerEvents: 'none',
                      }} />
                    )}
                    <span style={{ position: 'relative' }}>create</span>
                  </button>
                  <div style={{ fontSize: '12px', color: C.dimmer }}>
                    a different email. still free. just this once.
                  </div>
                </div>
              )}
              {visibleGens.map(g => {
                const owned = state.genCounts[g.id] ?? 0;
                const cost = genCost(g, owned);
                const canAfford = state.loc >= cost;
                return (
                  <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr', gap: '6px', alignItems: 'baseline', marginBottom: '7px' }}>
                    <div style={{ color: C.text }}>
                      {g.name}
                      {owned > 0 && <span style={{ color: C.green }}> [{owned}]</span>}
                    </div>
                    <button style={canAfford ? btnBase : btnOff}
                      onClick={canAfford ? () => handleBuyGen(g.id) : undefined}
                      title={g.desc}
                      onMouseOver={e => { if (canAfford) hov(e); }}
                      onMouseOut={e => { if (canAfford) unhov(e); }}>
                      buy
                    </button>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: canAfford ? C.dim : C.dimmer }}>{fmt(cost)} loc</span>
                      {owned > 0
                        ? <span style={{ color: C.greenDim, marginLeft: '10px' }}>{fmtRate(g.locPerSec * owned)}</span>
                        : <span style={{ color: C.dimmer, marginLeft: '10px' }}>{g.desc}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upgrades */}
          {showUpgSection && visibleUpgs.length > 0 && (
            <div>
              <div style={secHdr}>upgrades</div>
              {visibleUpgs.map(u => {
                const canAfford = state.loc >= u.cost;
                return (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '180px 56px 1fr', gap: '6px', alignItems: 'baseline', marginBottom: '7px' }}>
                    <div style={{ color: C.text }}>{u.name}</div>
                    <button style={canAfford ? btnBase : btnOff}
                      onClick={canAfford ? () => handleBuyUpgrade(u.id) : undefined}
                      title={u.desc}
                      onMouseOver={e => { if (canAfford) hov(e); }}
                      onMouseOut={e => { if (canAfford) unhov(e); }}>
                      buy
                    </button>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: canAfford ? C.dim : C.dimmer }}>{fmt(u.cost)} loc</span>
                      <span style={{ color: C.dimmer, marginLeft: '10px' }}>{u.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Installed */}
          {state.upgrades.length > 0 && (
            <div style={{ marginTop: '10px', color: C.dimmer, fontSize: '11px' }}>
              installed: {state.upgrades.map(id => UPGRADES.find(u => u.id === id)?.name).join(', ')}
            </div>
          )}

          {/* Reset */}
          {state.totalLoc > 0 && (
            <div style={{ marginTop: '44px', paddingTop: '14px', borderTop: `1px solid ${C.border}` }}>
              <button style={{ ...btnBase, color: C.dimmer, borderColor: C.border, fontSize: '11px' }}
                onClick={handleReset}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = C.text; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = C.dimmer; }}>
                rewrite from scratch
              </button>
            </div>
          )}
        </div>

        {/* ── Right: log ── */}
        {showLog && (
          <div style={isMobile ? {
            display: 'flex', flexDirection: 'column',
            height: '33vh', flexShrink: 0, overflow: 'hidden', minWidth: 0,
            order: -1,
            borderBottom: `1px solid ${C.border}`, marginBottom: '12px',
          } : {
            display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', minWidth: 0,
          }}>
            <div style={{ ...secHdr, marginTop: 0, flexShrink: 0 }}>conversation</div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: isMobile ? '48px' : '96px' }}>
              {displayLog.map(entry => {
                const t = entry.type;
                const isUser = t === 'user';
                const base: React.CSSProperties = isUser ? {
                  marginBottom: '11px', fontSize: '12px', lineHeight: '1.55',
                  paddingRight: '10px', borderRight: '2px solid', textAlign: 'right',
                } : {
                  marginBottom: '11px', fontSize: '12px', lineHeight: '1.55',
                  paddingLeft: '10px', borderLeft: '2px solid',
                };
                const ts: React.CSSProperties =
                  isUser            ? { borderRightColor: C.logUserBorder,      color: C.logUser } :
                  t === 'bad'       ? { borderLeftColor:  C.logBadBorder,        color: C.logBad } :
                  t === 'event'     ? { borderLeftColor:  C.logEventBorder,      color: C.logEvent } :
                  t === 'news'      ? { borderLeftColor:  C.logNewsBorder,       color: C.logNews } :
                  t === 'milestone' ? { borderLeftColor:  C.logMilestoneBorder,  color: C.logMilestone } :
                  t === 'system'    ? { borderLeftColor:  C.logSystemBorder,     color: C.logSystem } :
                                     { borderLeftColor:  C.logInfoBorder,        color: C.logInfo };
                return <div key={entry.id} style={{ ...base, ...ts }}>{entry.text}</div>;
              })}
              {isStreaming && (
                <div style={{
                  padding: '7px 10px', fontSize: '11px',
                  color: C.dimmer, borderLeft: `2px solid ${C.logInfoBorder}`,
                  marginBottom: '11px',
                }}>
                  {spinnerChar} {spinnerVerb}...
                </div>
              )}
              <div ref={logEndRef} />
            </div>
            {(() => {
              const displayedIds = new Set(displayLog.map(e => e.id));
              const queued = state.log.filter(e => e.type === 'user' && !displayedIds.has(e.id));
              if (queued.length === 0) return null;
              return (
                <div style={{
                  flexShrink: 0, marginTop: '8px',
                  border: `1px solid ${C.cardBorder}`, background: C.cardBg,
                  padding: '8px 10px 6px',
                }}>
                  <div style={{
                    color: C.dimmer, fontSize: '10px', letterSpacing: '0.12em',
                    textTransform: 'uppercase', marginBottom: '7px',
                  }}>queued</div>
                  {queued.map(entry => (
                    <div key={`q-${entry.id}`} style={{
                      fontSize: '12px', lineHeight: '1.55', marginBottom: '5px',
                      paddingRight: '10px', borderRight: `2px solid ${C.logUserBorder}`,
                      textAlign: 'right', color: C.dim,
                    }}>
                      {entry.text}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

      </div>
      <div style={{ padding: '12px 0', textAlign: 'center', color: C.footer, fontSize: '11px', fontStyle: 'italic', flexShrink: 0 }}>
        built with irony using figma make
      </div>
    </div>
  );
}
