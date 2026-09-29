/**
 * Agro-Meteorological Assistant — serverless proxy
 *
 * Runs as a Vercel serverless function. The AI provider key never reaches the browser.
 * Responses are constrained to the structured context the client sends, so the assistant can only
 * explain numbers the downscaling pipeline already produced.
 *
 * This endpoint is same-origin only: no wildcard CORS header is set, so a third-party page cannot
 * use the deployment as a free AI proxy.
 */

// Bounded input: question length and history depth are capped so a single request cannot be used
// to push a large payload through the proxy.
const MAX_QUESTION_CHARS = 1200;
const MAX_HISTORY_TURNS = 6;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { question, context, history = [] } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'A question string is required.' });
  }

  const safeQuestion = question.slice(0, MAX_QUESTION_CHARS);
  const safeHistory = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_TURNS);

  const systemInstruction = `You are the Agro-Meteorological Assistant inside Panchayat Weather Intelligence, an independent research prototype.
You explain Block-to-Panchayat downscaled temperature estimates, uncertainty ranges and crop heat-risk advisories to agricultural advisers and planners.
CRITICAL CONSTRAINTS:
1. ONLY use the structured JSON context provided with the question.
2. DO NOT invent, estimate or round any weather value; if a value is absent from the context, say it is not available.
3. DO NOT change or override the model output or the rule-based advisory; you explain them.
4. NEVER claim to be an official operational India Meteorological Department service. The data status in the context is authoritative: if it says staged illustrative data, describe it that way.
5. Keep answers concise, factual and actionable. Use simple HTML tags (<b>, <br>) for emphasis.`;

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const genericApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const customModel = process.env.AI_MODEL || 'gpt-4o-mini';

  // 1. Try Gemini if key is provided
  if (geminiKey) {
    try {
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

      const contents = [];
      // If we have history, map it
      if (safeHistory.length > 0) {
        safeHistory.forEach(h => {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.text || '').slice(0, 1200) }]
          });
        });
      }

      // Add current question with structured context
      const promptText = `Structured pipeline context:\n${JSON.stringify(context || {}, null, 2)}\n\nUser question:\n${safeQuestion}`;
      contents.push({
        role: 'user',
        parts: [{ text: promptText }]
      });

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }]
          },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 750
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return res.status(200).json({ answer: candidateText.trim(), mode: 'ai', provider: 'gemini' });
        }
      } else {
        const errText = await response.text();
        console.warn('Gemini API call non-200:', response.status, errText);
      }
    } catch (err) {
      console.warn('Gemini call failed, falling back:', err.message);
    }
  }

  // 2. Try OpenAI-compatible API if configured
  if (genericApiKey) {
    try {
      const messages = [
        { role: 'system', content: systemInstruction },
        { role: 'system', content: `Current Pipeline Context:\n${JSON.stringify(context || {})}` }
      ];

      if (safeHistory.length > 0) {
        safeHistory.forEach(h => {
          messages.push({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: String(h.text || '').slice(0, 1200)
          });
        });
      }

      messages.push({ role: 'user', content: safeQuestion });

      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${genericApiKey}`
        },
        signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
        body: JSON.stringify({
          model: customModel,
          messages,
          temperature: 0.2,
          max_tokens: 750
        })
      });

      if (response.ok) {
        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content;
        if (answer) {
          return res.status(200).json({ answer: answer.trim(), mode: 'ai', provider: 'openai-compatible' });
        }
      } else {
        const errText = await response.text();
        console.warn('OpenAI compatible API non-200:', response.status, errText);
      }
    } catch (err) {
      console.warn('Generic AI call failed:', err.message);
    }
  }

  // 3. Deterministic Local Fallback (no key or upstream failure)
  return res.status(200).json({
    answer: null,
    fallback: true,
    note: 'No AI provider is configured, or the upstream call failed. The client will use its deterministic local interpreter.'
  });
}
