<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { callGeminiResearchAPI, type GeminiSource } from '../../services/geminiAi';
import { showNotification } from '../../services/notification';
import { useMarketStore } from '../../stores/market';
import { usePortfolioStore } from '../../stores/portfolio';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-settings'): void;
}>();

const portfolioStore = usePortfolioStore();
const marketStore = useMarketStore();

const deepResearchTab = ref<'portfolio' | 'ticker'>('portfolio');
const enableSearchGrounding = ref<boolean>(true);

const deepResearchReport = ref<string>('');
const deepResearchSources = ref<GeminiSource[]>([]);
const deepResearchTimestamp = ref<string>('');
const deepResearchError = ref<string>('');
const deepResearchProgress = ref<string>('');
const isGeneratingResearch = ref<boolean>(false);

const singleTickerQuery = ref<string>('NVDA');
const singleTickerReport = ref<string>('');
const singleTickerSources = ref<GeminiSource[]>([]);
const singleTickerProgress = ref<string>('');
const isGeneratingTickerResearch = ref<boolean>(false);

const deepResearchChatHistory = ref<
  { role: 'user' | 'model'; text: string; timestamp: string; sources?: GeminiSource[] }[]
>([]);
const deepResearchFollowUpInput = ref<string>('');
const isAskingFollowUp = ref<boolean>(false);
const followUpError = ref<string>('');

onMounted(() => {
  loadSavedState();
});

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      loadSavedState();
    }
  }
);

function loadSavedState() {
  try {
    deepResearchReport.value = localStorage.getItem('deep_research_report') || '';
    deepResearchTimestamp.value = localStorage.getItem('deep_research_timestamp') || '';
    enableSearchGrounding.value = localStorage.getItem('enable_search_grounding') !== 'false';

    const savedSources = localStorage.getItem('deep_research_sources');
    if (savedSources) {
      try {
        deepResearchSources.value = JSON.parse(savedSources);
      } catch {
        deepResearchSources.value = [];
      }
    }

    const savedChat = localStorage.getItem('deep_research_chat_history');
    if (savedChat) {
      try {
        deepResearchChatHistory.value = JSON.parse(savedChat);
      } catch {
        deepResearchChatHistory.value = [];
      }
    }
  } catch (e) {
    console.warn('Failed to load deep research state from localStorage', e);
  }
}

function saveSearchGroundingPref() {
  localStorage.setItem('enable_search_grounding', String(enableSearchGrounding.value));
}

const allHeldTickers = computed(() => {
  const set = new Set<string>();
  portfolioStore.stockHoldings.forEach((s) => {
    if (s.symbol) set.add(s.symbol);
  });
  portfolioStore.optionHoldings.forEach((o) => {
    if (o.symbol) set.add(o.symbol);
  });
  return Array.from(set).sort();
});

function formatNumber(val: number | string | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function renderHtmlTable(rows: string[]): string {
  if (!rows || rows.length === 0) return '';
  let html =
    '<div class="overflow-x-auto my-3"><table class="w-full text-left text-xs border border-gray-700/80 rounded-lg border-collapse min-w-[480px] bg-gray-900/60">';
  rows.forEach((row, rIdx) => {
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const isHeader = rIdx === 0;
    html += `<tr class="${isHeader ? 'bg-gray-800 text-gray-300 font-semibold border-b border-gray-700' : 'border-b border-gray-800/80 hover:bg-gray-800/40 text-gray-200'}">`;
    cells.forEach((cell) => {
      if (isHeader) {
        html += `<th class="p-2.5">${cell}</th>`;
      } else {
        html += `<td class="p-2.5">${cell}</td>`;
      }
    });
    html += '</tr>';
  });
  html += '</table></div>';
  return html;
}

function formatResearchMarkdown(md: string): string {
  if (!md) return '';
  let text = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = text.split('\n');
  const outputLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) inTable = true;
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(line)) {
        continue;
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        outputLines.push(renderHtmlTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      outputLines.push(line);
    }
  }
  if (inTable) {
    outputLines.push(renderHtmlTable(tableRows));
  }

  let html = outputLines.join('\n');

  // Headings
  html = html.replace(
    /^### (.*$)/gim,
    '<h4 class="text-sm sm:text-base font-bold text-emerald-400 mt-5 mb-2 pb-1 border-b border-gray-700/70 flex items-center gap-1.5">$1</h4>'
  );
  html = html.replace(
    /^## (.*$)/gim,
    '<h3 class="text-base sm:text-lg font-bold text-white mt-6 mb-3 pb-1.5 border-b border-indigo-500/40 flex items-center gap-2">$1</h3>'
  );
  html = html.replace(
    /^# (.*$)/gim,
    '<h2 class="text-lg sm:text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-sky-300 to-indigo-400 mt-6 mb-4">$1</h2>'
  );

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em class="text-gray-300 italic">$1</em>');

  // Blockquotes
  html = html.replace(
    /^\s*&gt;\s+(.*$)/gim,
    '<div class="border-l-4 border-indigo-500 bg-indigo-950/40 px-3 py-1.5 rounded-r my-2 text-xs text-indigo-200 italic">$1</div>'
  );

  // Lists: bullet points
  html = html.replace(
    /^\s*[-*]\s+(.*$)/gim,
    '<div class="flex items-start gap-2 text-gray-300 text-xs sm:text-sm my-1 leading-relaxed pl-1"><span class="text-emerald-400 font-bold select-none">•</span><span>$1</span></div>'
  );

  // Lists: numbered
  html = html.replace(
    /^\s*(\d+)\.\s+(.*$)/gim,
    '<div class="flex items-start gap-2 text-gray-300 text-xs sm:text-sm my-1 leading-relaxed pl-1"><span class="text-indigo-400 font-bold select-none text-xs">$1.</span><span>$2</span></div>'
  );

  // Paragraph spacing
  html = html.replace(/\n\n+/g, '<div class="h-2.5"></div>');

  return html;
}

function buildDailyPortfolioPrompt(): string {
  const todayDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  if (enableSearchGrounding.value) {
    const stocksList =
      portfolioStore.stockHoldings
        .map(
          (s) =>
            `- ${s.symbol}: ${s.quantity} shares | Avg Cost: $${formatNumber(s.avgCost)} | Current Price: $${formatNumber(s.currentPrice)} | Market Val: $${formatNumber(s.marketValue)} | P/L: ${s.unrealizedPL >= 0 ? '+' : ''}$${formatNumber(s.unrealizedPL)} (${s.unrealizedPercent.toFixed(1)}%)`
        )
        .join('\n') || 'No open stock holdings.';

    const optionsList =
      portfolioStore.optionHoldings
        .map(
          (o) =>
            `- ${o.symbol}: ${o.quantity} contracts | ${o.positionType} ${o.optionType || o.strategyName || 'Option'} | Strike: $${o.strike || 'N/A'} | Exp: ${o.expiration || 'N/A'} | Total Cost: $${formatNumber(o.totalCost)}`
        )
        .join('\n') || 'No active options or spread positions.';

    return `You are a world-class senior portfolio manager, Wall Street equity research director, and options risk specialist.
Conduct a comprehensive, institutional-grade daily market analysis for today (${todayDate}) based on the investor's exact portfolio below.
USE GOOGLE SEARCH GROUNDING TO RETRIEVE LIVE GOOGLE FINANCE DATA, CURRENT INDEX/VIX LEVELS, UPCOMING EARNINGS DATES, AND BREAKING MARKET NEWS.

=== INVESTOR PORTFOLIO HOLDINGS ===
STOCKS HELD:
${stocksList}

ACTIVE OPTIONS & SPREADS:
${optionsList}

PORTFOLIO TOTAL STOCK MARKET VALUE: $${formatNumber(portfolioStore.stockPortfolioValue)}
REALIZED NET PROFIT TO DATE: $${formatNumber(portfolioStore.totalRealizedPL)}
=== END PORTFOLIO ===

Please generate a high-conviction, professional report structured in Markdown with these exact sections:

## 1. 🌐 Daily Macro Pulse & Market Sentiment
- Current status of S&P 500, Nasdaq, 10-Year Treasury Yield, and CBOE VIX today.
- Today's top market drivers (Fed policy expectations, economic data, major sector rotations).
- How today's broader market environment directly influences the user's specific assets.

## 2. 📈 Held Stocks: Catalyst, News & Valuation Radar
- For each stock held in the portfolio:
  - Explain today's price action and recent catalyst.
  - Upcoming earnings announcement date and major expected events.
  - Wall Street consensus view, price target range, and key technical support/resistance levels.

## 3. ⚡ Active Options & Greeks Expiration Radar
- Expiration clock: Flag any options contracts with fewer than 14–21 Days to Expiration (DTE).
- Moneyness & early assignment risk (especially for short covered calls or short puts).
- Strategic guidance: Whether to hold for remaining theta decay, roll out and up/down, or close position to lock in capital.

## 4. 🎯 Strategic Portfolio Health & Tactical Action Items
- Concentration and diversification check (sector risk assessment).
- Hedging opportunities or covered call writing ideas on 100+ share lots.
- 3 clear, prioritized tactical action items for the investor today.

## 5. 🚀 High-Conviction Synergistic & Similar Opportunities
- Identify 2 to 3 actionable new opportunities that align with the user's portfolio profile:
  - Ecosystem / Value-Chain Synergies: Suppliers, customers, or direct peers benefiting from the same catalysts as held positions at compelling valuations.
  - Asymmetric Pullback / Breakout Plays: High-quality tickers near key support (50/200 DMA) with strong risk/reward.
  - Options Income / Wheel Opportunities: High IV rank candidates suitable for selling Cash-Secured Puts (CSPs) at discount strike prices.
- For each opportunity, provide: Ticker, Core Thesis, Recommended Entry Zone / Strike, Catalyst, and Invalidation (Stop-Loss) Level.
- Guardrail: Only recommend liquid mid-to-large-cap securities (market cap > $5B, robust trading volume). Do not recommend low-volume or speculative penny stocks.

Maintain an objective, analytical, and highly actionable tone. Ground all insights with today's real market prices and verified corporate news.`;
  } else {
    const stocksList =
      portfolioStore.stockHoldings
        .map(
          (s) =>
            `- ${s.symbol}: ${s.quantity} shs @ $${formatNumber(s.avgCost)} (Now $${formatNumber(s.currentPrice)}, P/L ${s.unrealizedPercent.toFixed(1)}%)`
        )
        .join('\n') || 'None';

    const optionsList =
      portfolioStore.optionHoldings
        .map(
          (o) =>
            `- ${o.symbol}: ${o.quantity}x ${o.positionType} ${o.optionType || o.strategyName || 'Option'} $${o.strike || 'N/A'} exp ${o.expiration || 'N/A'}`
        )
        .join('\n') || 'None';

    return `Provide a daily market & portfolio briefing for ${todayDate}.

PORTFOLIO:
Stocks:
${stocksList}
Options:
${optionsList}

Output in Markdown:
## 1. 🌐 Market Overview
- S&P 500, Nasdaq, VIX status, and macro trends today.

## 2. 📈 Held Stocks & Catalysts
- Key price action, earnings dates, and news for held tickers.

## 3. ⚡ Options & Risk Radar
- Upcoming expirations, moneyness, and assignment risks.

## 4. 🎯 Tactical Action Items
- 3 prioritized action items for the portfolio today.

## 5. 🚀 Synergistic & Similar Opportunities
- 2 high-quality peer, value-chain, or dip-buying opportunities matching this portfolio's style (Ticker, Thesis, Key Levels).`;
  }
}

function copyDailyPortfolioPrompt() {
  const prompt = buildDailyPortfolioPrompt();
  if (!prompt) return;
  navigator.clipboard
    .writeText(prompt)
    .then(() => {
      showNotification('Daily research prompt copied to clipboard!', 'success');
    })
    .catch(() => {
      showNotification('Failed to copy prompt to clipboard.', 'error');
    });
}

function copyResearchReport() {
  const text = deepResearchTab.value === 'portfolio' ? deepResearchReport.value : singleTickerReport.value;
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showNotification('Research report copied to clipboard!', 'success');
    })
    .catch(() => {
      showNotification('Failed to copy to clipboard.', 'error');
    });
}

async function generateDailyPortfolioResearch() {
  if (!marketStore.geminiApiKey || !marketStore.geminiApiKey.trim()) {
    showNotification('Please configure your Google Gemini API Key first.', 'warning');
    emit('open-settings');
    return;
  }

  deepResearchError.value = '';
  isGeneratingResearch.value = true;
  deepResearchProgress.value = 'Gathering portfolio stocks and options...';

  const prompt = buildDailyPortfolioPrompt();

  const progressTimer = setInterval(() => {
    if (deepResearchProgress.value.includes('Gathering')) {
      deepResearchProgress.value = 'Searching Google Finance & live market news...';
    } else if (
      deepResearchProgress.value.includes('Searching') &&
      !deepResearchProgress.value.includes('(') &&
      !deepResearchProgress.value.includes('retrying') &&
      !deepResearchProgress.value.includes('quota')
    ) {
      deepResearchProgress.value = 'Analyzing stock catalysts & options risk...';
    }
  }, 3000);

  try {
    const res = await callGeminiResearchAPI(
      prompt,
      marketStore.geminiApiKey,
      enableSearchGrounding.value,
      (status) => {
        deepResearchProgress.value = status;
      }
    );
    deepResearchReport.value = res.text;
    deepResearchSources.value = res.sources;
    deepResearchTimestamp.value = new Date().toLocaleString();

    localStorage.setItem('deep_research_report', res.text);
    localStorage.setItem('deep_research_sources', JSON.stringify(res.sources));
    localStorage.setItem('deep_research_timestamp', deepResearchTimestamp.value);

    if (res.usedSearch) {
      showNotification('Daily AI Market Research generated with Live Google Finance!', 'success');
    } else {
      showNotification('Daily AI Market Research generated (Standard Gemini fallback)!', 'success');
    }
  } catch (e: any) {
    console.error('Deep Research Error:', e);
    deepResearchError.value = e.message;
    showNotification(`Analysis generation failed: ${e.message}`, 'error');
  } finally {
    clearInterval(progressTimer);
    isGeneratingResearch.value = false;
    deepResearchProgress.value = '';
  }
}

async function askDeepResearchFollowUp() {
  const question = (deepResearchFollowUpInput.value || '').trim();
  if (!question) return;

  if (!marketStore.geminiApiKey || !marketStore.geminiApiKey.trim()) {
    showNotification('Please configure your Google Gemini API Key first.', 'warning');
    emit('open-settings');
    return;
  }

  if (!deepResearchReport.value) {
    showNotification('Please generate the Daily Portfolio Analysis first.', 'warning');
    return;
  }

  followUpError.value = '';
  isAskingFollowUp.value = true;
  const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  deepResearchChatHistory.value.push({
    role: 'user',
    text: question,
    timestamp: userTimestamp
  });
  deepResearchFollowUpInput.value = '';

  const todayDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const stocksList =
    portfolioStore.stockHoldings
      .map(
        (s) =>
          `- ${s.symbol}: ${s.quantity} shares | Avg Cost: $${formatNumber(s.avgCost)} | Current Price: $${formatNumber(s.currentPrice)} | Market Val: $${formatNumber(s.marketValue)} | P/L: ${s.unrealizedPL >= 0 ? '+' : ''}$${formatNumber(s.unrealizedPL)} (${s.unrealizedPercent.toFixed(1)}%)`
      )
      .join('\n') || 'No open stock holdings.';

  const optionsList =
    portfolioStore.optionHoldings
      .map(
        (o) =>
          `- ${o.symbol}: ${o.quantity} contracts | ${o.positionType} ${o.optionType || o.strategyName || 'Option'} | Strike: $${o.strike || 'N/A'} | Exp: ${o.expiration || 'N/A'} | Total Cost: $${formatNumber(o.totalCost)}`
      )
      .join('\n') || 'No active options or spread positions.';

  const systemContext = `You are a world-class senior portfolio manager, Wall Street equity research director, and options risk specialist.
You recently generated this institutional Daily Market & Portfolio Research report for the investor on ${todayDate}:

=== DAILY RESEARCH REPORT ===
${deepResearchReport.value}

=== INVESTOR PORTFOLIO HOLDINGS ===
STOCKS HELD:
${stocksList}

ACTIVE OPTIONS & SPREADS:
${optionsList}

PORTFOLIO TOTAL STOCK MARKET VALUE: $${formatNumber(portfolioStore.stockPortfolioValue)}
REALIZED NET PROFIT TO DATE: $${formatNumber(portfolioStore.totalRealizedPL)}
=== END PORTFOLIO ===

Please answer the investor's follow-up questions with institutional accuracy, referencing their specific portfolio holdings, options strikes, expirations, or the research findings. Format your response in clean Markdown.`;

  const contents: any[] = [
    { role: 'user', parts: [{ text: systemContext }] },
    {
      role: 'model',
      parts: [
        {
          text: 'Understood. I have full context on your portfolio, active options contracts, and the daily research report. How can I assist you further with this analysis?'
        }
      ]
    }
  ];

  deepResearchChatHistory.value.forEach((msg) => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    });
  });

  try {
    const res = await callGeminiResearchAPI(
      contents,
      marketStore.geminiApiKey,
      enableSearchGrounding.value
    );
    const modelTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    deepResearchChatHistory.value.push({
      role: 'model',
      text: res.text,
      timestamp: modelTimestamp,
      sources: res.sources || []
    });
    localStorage.setItem('deep_research_chat_history', JSON.stringify(deepResearchChatHistory.value));
  } catch (e: any) {
    console.error('Follow-up Q&A Error:', e);
    followUpError.value = e.message;
    showNotification(`Q&A query failed: ${e.message}`, 'error');
  } finally {
    isAskingFollowUp.value = false;
  }
}

function clearDeepResearchChat() {
  deepResearchChatHistory.value = [];
  localStorage.removeItem('deep_research_chat_history');
  followUpError.value = '';
  showNotification('Follow-up Q&A conversation cleared.', 'info');
}

function copyChatMessage(text: string) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showNotification('Answer copied to clipboard!', 'success');
    })
    .catch(() => {
      showNotification('Failed to copy to clipboard.', 'error');
    });
}

async function generateSingleTickerResearch(tickerOverride?: string) {
  const sym = (tickerOverride || singleTickerQuery.value || '').trim().toUpperCase();
  if (!sym) {
    showNotification('Please enter a stock ticker symbol.', 'warning');
    return;
  }
  if (!marketStore.geminiApiKey || !marketStore.geminiApiKey.trim()) {
    showNotification('Please configure your Google Gemini API Key first.', 'warning');
    emit('open-settings');
    return;
  }

  deepResearchError.value = '';
  singleTickerQuery.value = sym;
  isGeneratingTickerResearch.value = true;

  const todayDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  let prompt = '';
  if (enableSearchGrounding.value) {
    prompt = `You are an equity research analyst.
Conduct an in-depth, institutional-grade research analysis on ticker symbol: ${sym} for today (${todayDate}).
USE GOOGLE SEARCH GROUNDING TO CHECK LIVE GOOGLE FINANCE QUOTES, RECENT EARNINGS REPORTS, WALL STREET PRICE TARGETS, AND BREAKING NEWS.

Format your output in clean Markdown:
## 1. 📊 Executive Summary & Today's Performance
- Current real-time price, intraday % change, 52-week high/low, and market capitalization.
- Brief overview of business model and core revenue drivers.

## 2. 🐂 Bull Case vs 🐻 Bear Case
- Top 3 Bullish catalysts and long-term tailwinds.
- Top 3 Bearish headwinds, competitive threats, or valuation risks.

## 3. 🎯 Fundamentals, Valuation & Earnings Calendar
- Key financial metrics: P/E, Forward P/E, Revenue Growth (YoY), Free Cash Flow.
- Next scheduled earnings date and Wall Street average analyst price target (% upside/downside).

## 4. ⚡ Technical Levels & Options Volatility
- Key support and resistance price levels, moving average trends.
- Implied Volatility (IV) regime and options playbook (e.g. Covered Call, Cash-Secured Put, Long Stock, or Wait).

## 5. 💡 Strategic Verdict & Rating
- Bottom-line investment verdict (Strong Buy / Buy / Hold / Trim / Sell) with clear justification.`;
  } else {
    prompt = `Provide a concise equity research briefing for ${sym} (${todayDate}).

Format in Markdown:
## 1. 📊 Overview & Price
- Current price, intraday % change, 52-week range, and P/E ratio.

## 2. 🐂 Bull vs 🐻 Bear Case
- Top 2 catalysts (Bull) and top 2 risks (Bear).

## 3. 🎯 Valuation & Earnings
- Next earnings date and Wall Street average price target.

## 4. ⚡ Technicals & Verdict
- Key support/resistance levels and bottom-line verdict (Buy/Hold/Sell) with reasoning.`;
  }

  singleTickerProgress.value = enableSearchGrounding.value
    ? `Analyzing ${sym} with Live Google Finance...`
    : `Analyzing ${sym} with Gemini AI...`;

  try {
    const res = await callGeminiResearchAPI(
      prompt,
      marketStore.geminiApiKey,
      enableSearchGrounding.value,
      (status) => {
        singleTickerProgress.value = status;
      }
    );
    singleTickerReport.value = res.text;
    singleTickerSources.value = res.sources;
    if (res.usedSearch) {
      showNotification(`Deep Research completed for ${sym} with Live Search!`, 'success');
    } else {
      showNotification(`Deep Research completed for ${sym} (Standard Gemini)!`, 'success');
    }
  } catch (e: any) {
    console.error('Ticker Research Error:', e);
    deepResearchError.value = e.message;
    showNotification(`Failed to research ${sym}: ${e.message}`, 'error');
  } finally {
    isGeneratingTickerResearch.value = false;
    singleTickerProgress.value = '';
  }
}

function closeDeepResearchModal() {
  emit('close');
}
</script>

<template>
  <!-- AI Market & Portfolio Deep Research Modal -->
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-gray-900 border border-indigo-500/40 rounded-2xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col"
    >
      <!-- Modal Header -->
      <div class="flex justify-between items-start border-b border-gray-800 pb-3.5">
        <div class="flex items-center gap-3">
          <span
            class="p-2.5 bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-700/60 rounded-xl text-indigo-400 shadow-md shadow-indigo-950/50"
          >
            <svg class="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </span>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                AI Market & Portfolio Deep Research
              </h3>
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                Google Finance Grounded
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">
              Institutional-grade daily market briefings, earnings radars, and options risk analysis powered by Gemini AI.
            </p>
          </div>
        </div>
        <button
          @click="closeDeepResearchModal"
          class="text-gray-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-gray-800 transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      <!-- Missing Key Warning Banner (if no Gemini API key) -->
      <div
        v-if="!marketStore.geminiApiKey"
        class="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-200"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>A free Google Gemini API Key is required to run live Google Finance search analysis.</span>
        </div>
        <button
          @click="emit('open-settings')"
          class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition whitespace-nowrap cursor-pointer"
        >
          Configure Key ↗
        </button>
      </div>

      <!-- Error Notice Banner (Inside Modal) -->
      <div
        v-if="deepResearchError"
        class="p-3.5 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-start justify-between gap-3 shadow-lg"
      >
        <div class="flex items-start gap-2.5">
          <svg class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <div class="font-bold text-rose-300">AI Research Notice</div>
            <div class="mt-0.5 text-gray-200 leading-relaxed">{{ deepResearchError }}</div>
            <div
              v-if="
                deepResearchError.includes('429') ||
                deepResearchError.includes('demand') ||
                deepResearchError.includes('rate') ||
                deepResearchError.includes('quota') ||
                deepResearchError.includes('busy')
              "
              class="mt-2 flex items-center gap-2 flex-wrap"
            >
              <button
                @click="
                  enableSearchGrounding = false;
                  deepResearchError = '';
                  deepResearchTab === 'portfolio'
                    ? generateDailyPortfolioResearch()
                    : generateSingleTickerResearch(singleTickerQuery);
                "
                class="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition cursor-pointer"
              >
                ⚡ Retry with Standard AI (Bypass Search Quota)
              </button>
              <button
                v-if="deepResearchError.includes('429') || deepResearchError.includes('quota')"
                @click="
                  deepResearchError = '';
                  deepResearchTab === 'portfolio'
                    ? generateDailyPortfolioResearch()
                    : generateSingleTickerResearch(singleTickerQuery);
                "
                class="px-2.5 py-1 bg-gray-800 hover:bg-gray-750 text-gray-200 border border-gray-700 rounded text-[11px] font-medium transition cursor-pointer"
              >
                🔄 Retry Now
              </button>
            </div>
          </div>
        </div>
        <button @click="deepResearchError = ''" class="text-gray-400 hover:text-white font-bold p-1 cursor-pointer">
          ✕
        </button>
      </div>

      <!-- Search Grounding Mode Toggle Bar -->
      <div class="flex items-center justify-between px-1 text-xs text-gray-400">
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            v-model="enableSearchGrounding"
            @change="saveSearchGroundingPref"
            class="rounded bg-gray-800 border-gray-700 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span class="flex items-center gap-1.5 text-gray-300 font-medium">
            <span>Live Google Search Grounding</span>
            <span
              v-if="enableSearchGrounding"
              class="px-1.5 py-0.2 rounded text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-bold"
            >
              ACTIVE
            </span>
            <span
              v-else
              class="px-1.5 py-0.2 rounded text-[10px] bg-gray-800 border border-gray-700 text-gray-400 font-mono font-normal"
            >
              OFF (Standard AI)
            </span>
          </span>
        </label>
        <span class="text-[11px] text-gray-500 hidden sm:inline">
          Turn OFF if your Gemini key hits search rate limits.
        </span>
      </div>

      <!-- Navigation Tabs & Action Bar -->
      <div
        class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gray-850/80 p-2.5 rounded-xl border border-gray-800"
      >
        <!-- Tab Buttons -->
        <div class="flex items-center gap-1.5 bg-gray-900 p-1 rounded-lg border border-gray-750">
          <button
            @click="deepResearchTab = 'portfolio'"
            :class="
              deepResearchTab === 'portfolio'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-950/50'
                : 'text-gray-400 hover:text-white'
            "
            class="px-3 py-1 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span>Daily Portfolio Briefing</span>
          </button>
          <button
            @click="deepResearchTab = 'ticker'"
            :class="
              deepResearchTab === 'ticker'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-950/50'
                : 'text-gray-400 hover:text-white'
            "
            class="px-3 py-1 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Single Ticker Deep Dive</span>
          </button>
        </div>

        <!-- Right Controls -->
        <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <span v-if="deepResearchTab === 'portfolio' && deepResearchTimestamp" class="text-[11px] text-gray-400 font-mono">
            Updated: {{ deepResearchTimestamp }}
          </span>

          <button
            v-if="deepResearchTab === 'portfolio'"
            @click="generateDailyPortfolioResearch"
            :disabled="isGeneratingResearch || !marketStore.geminiApiKey"
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <svg v-if="isGeneratingResearch" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span v-else>✨</span>
            <span>{{ deepResearchReport ? 'Refresh Daily Analysis' : 'Generate Daily Analysis' }}</span>
          </button>

          <button
            v-if="deepResearchTab === 'portfolio'"
            @click="copyDailyPortfolioPrompt"
            class="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700 transition flex items-center gap-1 shadow-sm cursor-pointer"
            title="Copy current research prompt containing portfolio data and instructions to clipboard"
          >
            <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>Copy Prompt</span>
          </button>

          <button
            v-if="(deepResearchTab === 'portfolio' && deepResearchReport) || (deepResearchTab === 'ticker' && singleTickerReport)"
            @click="copyResearchReport"
            class="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700 transition flex items-center gap-1 cursor-pointer"
            title="Copy analysis report to clipboard"
          >
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <span>Copy Report</span>
          </button>
        </div>
      </div>

      <!-- Scrollable Body Content -->
      <div class="overflow-y-auto pr-1 space-y-4 max-h-[65vh]">
        <!-- TAB 1: Daily Portfolio Briefing -->
        <div v-show="deepResearchTab === 'portfolio'">
          <!-- Generating Progress State -->
          <div
            v-if="isGeneratingResearch"
            class="p-8 rounded-2xl bg-gray-950/60 border border-indigo-500/30 text-center space-y-4 my-2"
          >
            <div class="relative w-16 h-16 mx-auto">
              <div class="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping"></div>
              <div
                class="relative w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-950"
              >
                ✨
              </div>
            </div>
            <div>
              <h4 class="text-base font-bold text-white animate-pulse">
                {{ deepResearchProgress || 'Connecting to Google Gemini...' }}
              </h4>
              <p class="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                Scanning real-time Google Finance data, today's macro catalysts, and calculating options moneyness across your positions.
              </p>
            </div>
            <div class="w-48 h-1.5 bg-gray-800 rounded-full mx-auto overflow-hidden">
              <div
                class="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full animate-pulse w-full"
              ></div>
            </div>
          </div>

          <!-- Rendered Report -->
          <div v-else-if="deepResearchReport" class="space-y-4">
            <!-- Report Document Card -->
            <div class="bg-gray-950/60 border border-gray-800 rounded-2xl p-5 sm:p-7 shadow-inner">
              <div class="text-sm leading-relaxed text-gray-200" v-html="formatResearchMarkdown(deepResearchReport)"></div>
            </div>

            <!-- Grounding Citations Section -->
            <div v-if="deepResearchSources.length > 0" class="bg-gray-850 border border-gray-800 rounded-xl p-4">
              <div class="text-xs font-semibold text-gray-400 uppercase mb-2.5 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span>Grounded Financial Sources & Live Citations</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <a
                  v-for="(src, idx) in deepResearchSources"
                  :key="idx"
                  :href="src.uri"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-750 text-indigo-300 hover:text-white border border-gray-700 transition flex items-center gap-1"
                >
                  <span>{{ src.title || src.uri }}</span>
                  <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <div
              v-else-if="deepResearchReport && enableSearchGrounding"
              class="bg-gray-850 border border-gray-800 rounded-xl p-3 text-xs text-gray-400 flex items-center gap-2"
            >
              <span class="text-amber-400">⚡</span>
              <span>Note: Google Search Grounding was busy; analysis was completed successfully using standard Gemini analytical models.</span>
            </div>

            <!-- Interactive Follow-up Q&A Copilot -->
            <div class="bg-gray-950/80 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 mt-6">
              <!-- Q&A Header -->
              <div class="flex items-center justify-between border-b border-gray-800 pb-3 flex-wrap gap-2">
                <div class="flex items-center gap-2.5">
                  <span class="p-2 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-indigo-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </span>
                  <div>
                    <h4 class="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      Ask AI Copilot About This Report
                    </h4>
                    <p class="text-[11px] text-gray-400 mt-0.5">
                      Ask arbitrary questions about these findings, specific holdings, options risks, or new opportunities.
                    </p>
                  </div>
                </div>
                <button
                  v-if="deepResearchChatHistory.length > 0"
                  @click="clearDeepResearchChat"
                  class="px-2.5 py-1 text-[11px] text-gray-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg border border-gray-800 hover:border-rose-900 transition flex items-center gap-1 cursor-pointer"
                >
                  <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  <span>Clear Conversation</span>
                </button>
              </div>

              <!-- Q&A Conversation Thread -->
              <div v-if="deepResearchChatHistory.length > 0" class="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                <div v-for="(msg, mIdx) in deepResearchChatHistory" :key="mIdx">
                  <!-- User Message Bubble -->
                  <div
                    v-if="msg.role === 'user'"
                    class="bg-indigo-950/70 border border-indigo-800/80 rounded-2xl rounded-tr-sm p-3.5 text-xs text-indigo-100 max-w-[92%] sm:max-w-[82%] ml-auto shadow-sm space-y-1"
                  >
                    <div class="flex items-center justify-between gap-2 text-[10px] text-indigo-300 font-semibold border-b border-indigo-900/60 pb-1">
                      <span class="flex items-center gap-1">
                        <span>👤</span>
                        <span>You</span>
                      </span>
                      <span class="font-mono text-indigo-400/80">{{ msg.timestamp }}</span>
                    </div>
                    <div class="whitespace-pre-wrap leading-relaxed pt-1 text-gray-100">{{ msg.text }}</div>
                  </div>

                  <!-- AI Response Bubble -->
                  <div
                    v-else
                    class="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm p-4 text-xs text-gray-200 max-w-[96%] sm:max-w-[92%] shadow-md space-y-2"
                  >
                    <div class="flex items-center justify-between gap-2 text-[10px] text-emerald-400 font-semibold border-b border-gray-800 pb-1.5">
                      <span class="flex items-center gap-1.5">
                        <span>✨</span>
                        <span>Gemini Investment Copilot</span>
                      </span>
                      <div class="flex items-center gap-2">
                        <span class="text-gray-500 font-mono text-[9px]">{{ msg.timestamp }}</span>
                        <button
                          @click="copyChatMessage(msg.text)"
                          class="text-gray-400 hover:text-white p-1 hover:bg-gray-800 rounded transition cursor-pointer"
                          title="Copy answer"
                        >
                          <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div class="leading-relaxed space-y-1 text-gray-200" v-html="formatResearchMarkdown(msg.text)"></div>

                    <!-- Citations if any -->
                    <div v-if="msg.sources && msg.sources.length > 0" class="pt-2 border-t border-gray-800/80 flex flex-wrap gap-1.5">
                      <a
                        v-for="(s, sIdx) in msg.sources"
                        :key="sIdx"
                        :href="s.uri"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-750 text-indigo-300 hover:text-white border border-gray-700 transition"
                      >
                        {{ s.title || s.uri }} ↗
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Thinking / Loading Bubble -->
              <div
                v-if="isAskingFollowUp"
                class="bg-gray-900/90 border border-indigo-500/30 rounded-2xl rounded-tl-sm p-3.5 text-xs text-gray-300 max-w-[92%] flex items-center gap-3"
              >
                <div class="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500 flex items-center justify-center text-indigo-400 animate-spin shrink-0">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
                <span class="text-xs text-indigo-300 animate-pulse font-medium">
                  Analyzing portfolio and synthesizing response...
                </span>
              </div>

              <!-- Error Notice -->
              <div
                v-if="followUpError"
                class="p-2.5 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-2"
              >
                <div class="flex items-center gap-2">
                  <span class="text-rose-400">⚠️</span>
                  <span>{{ followUpError }}</span>
                </div>
                <button @click="followUpError = ''" class="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
              </div>

              <!-- Input Box Area -->
              <div class="space-y-1.5 pt-1">
                <div class="relative flex items-end gap-2 bg-gray-900/90 border border-gray-750 focus-within:border-indigo-500 rounded-xl p-2 transition shadow-inner">
                  <textarea
                    v-model="deepResearchFollowUpInput"
                    @keydown.enter.exact.prevent="askDeepResearchFollowUp"
                    rows="2"
                    placeholder="Ask a question about this research or your portfolio... (e.g. 'What is my max downside on my options?' or 'Explain Opportunity #1 in detail')"
                    class="w-full bg-transparent text-xs text-gray-200 placeholder-gray-500 focus:outline-none resize-none leading-relaxed font-sans pr-2"
                    :disabled="isAskingFollowUp || !marketStore.geminiApiKey"
                  ></textarea>
                  <button
                    @click="askDeepResearchFollowUp"
                    :disabled="isAskingFollowUp || !deepResearchFollowUpInput.trim() || !marketStore.geminiApiKey"
                    class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <svg v-if="isAskingFollowUp" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Send</span>
                  </button>
                </div>
                <div class="flex items-center justify-between px-1 text-[10px] text-gray-500">
                  <span>
                    Press <kbd class="px-1 py-0.2 bg-gray-800 rounded text-gray-400 font-mono">Enter</kbd> to send,
                    <kbd class="px-1 py-0.2 bg-gray-800 rounded text-gray-400 font-mono">Shift+Enter</kbd> for newline
                  </span>
                  <span>Context: Full Portfolio &amp; Briefing Attached</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="p-8 rounded-2xl bg-gray-950/40 border border-dashed border-gray-800 text-center space-y-4">
            <div
              class="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-800/80 text-indigo-400 flex items-center justify-center mx-auto text-xl shadow-lg"
            >
              📊
            </div>
            <div class="max-w-md mx-auto">
              <h4 class="text-base font-bold text-white">Daily Market & Portfolio Intelligence</h4>
              <p class="text-xs text-gray-400 mt-1.5">
                Generate a real-time, comprehensive briefing analyzing today's macro environment, held stock earnings catalysts, and options expiration risk.
              </p>
            </div>

            <!-- Portfolio Scan Highlights -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left pt-2">
              <div class="p-3 bg-gray-900 rounded-xl border border-gray-800">
                <div class="text-[11px] text-gray-400 uppercase font-semibold">Held Stocks</div>
                <div class="text-lg font-bold text-white mt-0.5">{{ portfolioStore.stockHoldings.length }}</div>
                <div class="text-[10px] text-gray-500">Earnings & catalysts radar</div>
              </div>
              <div class="p-3 bg-gray-900 rounded-xl border border-gray-800">
                <div class="text-[11px] text-gray-400 uppercase font-semibold">Active Options</div>
                <div class="text-lg font-bold text-white mt-0.5">{{ portfolioStore.optionHoldings.length }}</div>
                <div class="text-[10px] text-gray-500">Moneyness & DTE alerts</div>
              </div>
              <div class="p-3 bg-gray-900 rounded-xl border border-gray-800">
                <div class="text-[11px] text-gray-400 uppercase font-semibold">Grounding Engine</div>
                <div class="text-lg font-bold text-emerald-400 mt-0.5">Google</div>
                <div class="text-[10px] text-gray-500">Live web & news data</div>
              </div>
            </div>

            <button
              @click="generateDailyPortfolioResearch"
              :disabled="!marketStore.geminiApiKey"
              class="mt-4 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-950/50 cursor-pointer"
            >
              🚀 Run Today's Market & Portfolio Scan
            </button>
          </div>
        </div>

        <!-- TAB 2: Single Ticker Deep Dive -->
        <div v-show="deepResearchTab === 'ticker'" class="space-y-4">
          <!-- Ticker Search Bar & Quick Ticker Pills -->
          <div class="bg-gray-850/70 border border-gray-800 rounded-xl p-4 space-y-3">
            <div class="flex gap-2">
              <div class="relative flex-1">
                <input
                  type="text"
                  v-model="singleTickerQuery"
                  placeholder="Enter any stock symbol (e.g. NVDA, AAPL, TSLA)..."
                  @keyup.enter="generateSingleTickerResearch(singleTickerQuery)"
                  class="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3.5 py-2 text-xs text-white uppercase placeholder-gray-500 focus:outline-none font-mono"
                />
                <button
                  v-if="singleTickerQuery"
                  @click="singleTickerQuery = ''"
                  class="absolute right-2.5 top-2 text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <button
                @click="generateSingleTickerResearch(singleTickerQuery)"
                :disabled="isGeneratingTickerResearch || !singleTickerQuery.trim() || !marketStore.geminiApiKey"
                class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-lg text-xs font-semibold transition whitespace-nowrap flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <svg v-if="isGeneratingTickerResearch" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Deep Research</span>
              </button>
            </div>

            <!-- Quick Select from Active Portfolio Positions -->
            <div
              v-if="allHeldTickers.length > 0"
              class="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-800/80 text-xs"
            >
              <span class="text-gray-400 text-[11px]">Your Portfolio Positions:</span>
              <button
                v-for="t in allHeldTickers"
                :key="t"
                @click="
                  singleTickerQuery = t;
                  generateSingleTickerResearch(t);
                "
                class="px-2 py-0.5 rounded bg-gray-800 hover:bg-indigo-900/60 hover:text-indigo-200 border border-gray-700 hover:border-indigo-600 text-[11px] font-mono font-semibold text-gray-300 transition cursor-pointer"
              >
                {{ t }}
              </button>
            </div>
          </div>

          <!-- Single Ticker Loading State -->
          <div
            v-if="isGeneratingTickerResearch"
            class="p-8 rounded-2xl bg-gray-950/60 border border-indigo-500/30 text-center space-y-3 my-2"
          >
            <div
              class="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500 flex items-center justify-center mx-auto text-indigo-400 animate-spin"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h4 class="text-sm font-bold text-white">
              {{ singleTickerProgress || `Analyzing ${singleTickerQuery} with Live Google Finance...` }}
            </h4>
            <p class="text-xs text-gray-400 max-w-sm mx-auto">
              Retrieving valuation multiples, Wall Street price targets, Bull/Bear thesis, and options implied volatility.
            </p>
          </div>

          <!-- Single Ticker Report -->
          <div v-else-if="singleTickerReport" class="space-y-4">
            <div class="bg-gray-950/60 border border-gray-800 rounded-2xl p-5 sm:p-7 shadow-inner">
              <div class="text-sm leading-relaxed text-gray-200" v-html="formatResearchMarkdown(singleTickerReport)"></div>
            </div>

            <!-- Citations -->
            <div v-if="singleTickerSources.length > 0" class="bg-gray-855 border border-gray-800 rounded-xl p-4">
              <div class="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                <span>Grounded Web Sources</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <a
                  v-for="(src, idx) in singleTickerSources"
                  :key="idx"
                  :href="src.uri"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-750 text-indigo-300 hover:text-white border border-gray-700 transition flex items-center gap-1"
                >
                  <span>{{ src.title || src.uri }}</span>
                  <svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <div
              v-else-if="singleTickerReport && enableSearchGrounding"
              class="bg-gray-855 border border-gray-800 rounded-xl p-3 text-xs text-gray-400 flex items-center gap-2"
            >
              <span class="text-amber-400">⚡</span>
              <span>Note: Google Search Grounding was busy; analysis generated using standard Gemini models.</span>
            </div>
          </div>

          <!-- Single Ticker Empty State -->
          <div v-else class="p-8 rounded-2xl bg-gray-950/40 border border-dashed border-gray-800 text-center space-y-2">
            <div class="text-2xl">🔍</div>
            <h4 class="text-sm font-bold text-white">Institutional Single-Stock Research</h4>
            <p class="text-xs text-gray-400 max-w-sm mx-auto">
              Type any ticker above or click one of your portfolio positions to run an on-demand deep dive grounded with Google Finance.
            </p>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-between items-center pt-3 border-t border-gray-800 text-xs text-gray-400">
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            :class="marketStore.geminiApiKey ? 'bg-emerald-400' : 'bg-gray-600'"
          ></span>
          <span>{{ marketStore.geminiApiKey ? 'Gemini AI Ready' : 'API Key Not Set' }}</span>
        </div>
        <button
          type="button"
          @click="closeDeepResearchModal"
          class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold transition cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
