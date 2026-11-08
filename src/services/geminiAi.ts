export interface GeminiSource {
    title: string;
    uri: string;
}

export interface GeminiResearchResponse {
    text: string;
    sources: GeminiSource[];
    searchQueries: string[];
    usedSearch: boolean;
}

export async function callGeminiResearchAPI(
    promptOrContents: string | any[],
    apiKey: string,
    enableSearch = true,
    onStatusUpdate?: (status: string) => void
): Promise<GeminiResearchResponse> {
    if (!apiKey || !apiKey.trim()) {
        throw new Error('Google Gemini API Key is missing. Please enter your key in Settings.');
    }
    const key = apiKey.trim();
    const candidateModels = enableSearch
        ? ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.7-flash']
        : ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-flash-latest', 'gemini-3.7-flash'];

    const formattedContents = typeof promptOrContents === 'string'
        ? [{ parts: [{ text: promptOrContents }] }]
        : promptOrContents;

    const tryGenerate = async (modelName: string, withSearch: boolean) => {
        const payload: any = { contents: formattedContents };
        if (withSearch) {
            payload.tools = [{ google_search: {} }];
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err: any = new Error(data.error?.message || `API error ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return data;
    };

    let responseData: any = null;
    let usedSearch = false;
    let lastError: any = null;

    for (const model of candidateModels) {
        try {
            if (onStatusUpdate) {
                onStatusUpdate(enableSearch
                    ? `Searching live Google Market Data with ${model}...`
                    : `Analyzing portfolio with ${model}...`);
            }
            responseData = await tryGenerate(model, enableSearch);
            usedSearch = enableSearch;
            break;
        } catch (err: any) {
            lastError = err;
            if (err.status === 404) {
                continue; // Try next candidate model
            }
            break;
        }
    }

    if (!responseData) {
        throw new Error(lastError?.message || 'Failed to generate analysis.');
    }

    const candidate = responseData.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: any) => p.text || '').filter(Boolean).join('\n') || '';
    if (!text) {
        throw new Error('Gemini returned an empty response.');
    }

    const sources: GeminiSource[] = [];
    const metadata = candidate?.groundingMetadata;
    if (metadata?.groundingChunks) {
        metadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                sources.push({
                    title: chunk.web.title || chunk.web.uri.replace(/^https?:\/\//, '').split('/')[0],
                    uri: chunk.web.uri
                });
            }
        });
    }

    return {
        text,
        sources,
        searchQueries: metadata?.webSearchQueries || [],
        usedSearch
    };
}

export async function fetchGeminiBatchPrices(
    symbols: string[],
    apiKey: string
): Promise<Record<string, number>> {
    if (!symbols || symbols.length === 0 || !apiKey || !apiKey.trim()) return {};
    const prompt = `You are a financial pricing assistant. Provide the current real-time or latest regular market closing stock price in USD for the following ticker symbols: ${symbols.join(', ')}.
Respond ONLY with a valid, clean JSON object mapping each ticker symbol to its numeric price, with no markdown code blocks, explanation, or extra commentary.
Example output format: {"AAPL": 225.50, "TSLA": 210.25, "NVDA": 128.30}`;

    try {
        const res = await callGeminiResearchAPI(prompt, apiKey, true);
        if (!res || !res.text) return {};
        const clean = res.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const results: Record<string, number> = {};
            for (const [sym, val] of Object.entries(parsed)) {
                const num = parseFloat(String(val));
                if (!isNaN(num) && num > 0) {
                    results[sym.toUpperCase().trim()] = num;
                }
            }
            return results;
        }
    } catch (e) {
        console.error('Failed to parse Gemini batch prices:', e);
    }
    return {};
}
