import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

function buildDataCheckString(params: URLSearchParams) {
    const pairs: string[] = [];
    for (const [key, value] of Array.from(params.entries())
        .filter(([k]) => k !== 'hash')
        .sort()) {
        pairs.push(`${key}=${value}`);
    }
    return pairs.join('\n');
}

function getSecretKey(botToken: string) {
    return crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
}

function isValid(initData: string, botToken: string) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash') || '';
    const dataCheckString = buildDataCheckString(params);
    const secret = getSecretKey(botToken);
    const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

function ymd(d: Date) {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDateRange(period: string): { start: Date; end: Date } {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    let start: Date;
    let end: Date = new Date(now);
    end.setHours(23, 59, 59, 999);

    switch (period) {
        case 'today':
            start = new Date(now);
            break;
        case 'week':
            // Start of week (Monday)
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
            start = new Date(now.getFullYear(), now.getMonth(), diff);
            start.setHours(0, 0, 0, 0);
            break;
        case 'month':
            // Start of month
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            // Start of year
            start = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            // Default to month
            start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { start, end };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const initData = req.body?.initData;
        const period = req.body?.period || 'month'; // Default to 'month'

        if (!initData) return res.status(400).json({ ok: false, error: 'Missing initData' });

        const valid = isValid(initData, process.env.BOT_TOKEN!);
        if (!valid) return res.status(401).json({ ok: false, error: 'Invalid hash' });

        const params = new URLSearchParams(initData);
        const userRaw = params.get('user');
        if (!userRaw) return res.status(400).json({ ok: false, error: 'No user' });

        const user = JSON.parse(userRaw);

        // Find user in DB and check AI features enabled
        const { data: dbUser, error: userErr } = await supabase
            .from('users')
            .select('id, telegram_id, ai_features_enabled, first_name, default_currency_id')
            .eq('telegram_id', user.id)
            .maybeSingle();

        if (userErr) {
            console.error('users select error', userErr);
            return res.status(500).json({ ok: false, error: 'DB error (users)' });
        }
        if (!dbUser) return res.status(404).json({ ok: false, error: 'User not found' });

        // Check if AI features are enabled
        if (!dbUser.ai_features_enabled) {
            return res.status(403).json({ ok: false, error: 'AI features are not enabled for this user' });
        }

        // Get currency info
        let currencyCode = 'USD';
        let currencySymbol = '$';
        if (dbUser.default_currency_id) {
            const { data: currency, error: currErr } = await supabase
                .from('currencies')
                .select('code, symbol, name')
                .eq('id', dbUser.default_currency_id)
                .maybeSingle();
            
            if (!currErr && currency) {
                currencyCode = currency.code;
                currencySymbol = currency.symbol;
            }
        }

        const userName = dbUser.first_name || user.first_name || 'User';

        // Get date range based on period
        const { start, end } = getDateRange(period);

        // Fetch spendings for the period
        const { data: spendings, error: sErr } = await supabase
            .from('spendings')
            .select('*, categories(id, name, emoji, color)')
            .eq('user_id', dbUser.id)
            .gte('date_of_log', ymd(start))
            .lte('date_of_log', ymd(end))
            .order('date_of_log', { ascending: false })
            .order('created_at', { ascending: false });

        if (sErr) {
            console.error('spendings select error', sErr);
            return res.status(500).json({ ok: false, error: 'DB error (spendings)' });
        }

        // Prepare transaction data for OpenAI (amount should be negative for spending)
        const transactions = (spendings || []).map(s => ({
            date: s.date_of_log,
            amount: -Math.abs(Number(s.amount || 0)), // Negative for spending
            currency: currencyCode,
            category: s.categories ? s.categories.name : null,
            merchant: s.name,
            notes: null,
            is_recurring: false // Could be enhanced later
        }));

        const total = Math.abs(transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0));
        const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);

        // Create context and transaction data for OpenAI
        const context = {
            period_label: periodLabel,
            currency_symbol: currencySymbol,
            currency_code: currencyCode,
            locale: 'en-US', // Could be enhanced
            user_name: userName
        };

        const transactionData = {
            transactions: transactions,
            context: context
        };

        // System prompt from master prompt
        const systemPrompt = `You are a friendly, no-nonsense personal finance adviser.

You receive:
- transactions: JSON array of objects {date, amount, currency, category, merchant, notes?, is_recurring?}. amount < 0 = spend; amount > 0 = income/refund. Dates are ISO (YYYY-MM-DD).
- context (optional): {period_label, currency_symbol, locale, budgets_by_category, previous_period: {category_totals, total_spent}, user_name}.

Goals
1) Produce a concise, Telegram-friendly message summarizing spending for the period.
2) Do NOT list every transaction or echo raw JSON.
3) Show total spent and % share by category (sorted desc, nicely aligned).
4) Give overspending insights (vs budgets if provided, else vs previous period; else sensible heuristics).
5) Flag unusual spendings (outliers, spikes, new/increased subscriptions).
6) Provide actionable optimization tips (prioritize high-impact steps; quantify savings when possible).
7) Include a short, tasteful motivational roast if needed.
8) Act as a personal finance coach; emojis are allowed (sparingly) to improve scannability.

Calculations & logic
- Total spent = sum of absolute values of negative amounts. Ignore positive inflows except as offsets/refunds.
- Category totals = sum of negative amounts per category. If >6 categories, show top 5 + "Other".
- Percentages = category_total / total_spent * 100, 1 decimal place.
- Rounding: use currency_symbol if provided; whole-currency → 0 decimals, else 2 decimals.
- Sorting: categories by spend desc; insights by impact.

Overspending rules
- If budgets_by_category exists and category_total > budget: report over amount and % over; add one-line fix.
- Else if previous_period.category_totals exists: flag categories up ≥25% period-over-period.
- Else heuristics: flag any category >35% of total (except clearly fixed, e.g., Housing/Taxes) or categories accelerating late in the period.

Unusual spending detection
- Subscriptions: if is_recurring true and price up ≥15% vs previous period (or a new subscription), flag it.
- Outliers: any single transaction >15% of total spent or >3× category median. Mention merchant and amount. Max 3 items.

Optimization guidance (3–6 bullets; quantify where possible)
- Cancel/switch/renegotiate subscriptions and utilities.
- Avoid fees (ATM/FX/overdraft); suggest cheaper rails/accounts.
- Meal planning, grocery list caps, batch cooking.
- Transport swaps (monthly pass vs singles; walk/bike when feasible).
- Swap merchants/brands; cashback/points optimization; schedule bill due-dates to avoid interest.
- Set category caps and alerts for recurring trouble spots.

Rule-based coaching (apply when patterns detected; include 1–2 tailored rules)
- If Food >30% for 2+ consecutive weeks → propose weekly meal plan + per-shop cap.
- If Transport up >40% vs prior period → suggest monthly pass and estimate break-even.
- If Subscriptions >5% of total or >8 active subs → identify 2 to trial-cancel; propose annual billing discount if cheaper.
- If Housing >35% of net income (when known) → recommend renegotiation, roommate/relocation scenarios, or utility optimization.
- If Entertainment >15% and a savings goal exists → set a "fun envelope" with weekly cap and automatic transfer to savings.

Financial frameworks to reference (use to shape advice; not dogma)
- 50/30/20 rule (needs/wants/saving) or a custom split based on user goals.
- Zero-based budgeting and envelope/category caps.
- Pay Yourself First (automated savings at payday).
- Emergency fund target (3–6 months expenses).
- Debt payoff: snowball vs avalanche (default to avalanche for interest efficiency unless user temperament favors snowball).
- Savings rate targets (e.g., 15–20%+ when feasible); sinking funds for irregulars (travel, repairs).
- Fee-avoidance and interest minimization as first-order levers.

Tone & formatting
- Supportive, clear, witty; never shamey. Use emojis sparingly for headings and signals (e.g., ✅, ⚠️, 🔥, 💡, 🧾).
- Keep to ~10–15 lines and ~1200 characters if possible. Scannable layout.
- Use simple Telegram Markdown where helpful (bold headings, monospace for the table). No raw JSON or full transaction list.
- If data is insufficient, say so briefly and proceed with what's available. Use user_name if provided.

Output format (Telegram message)
- Title: "🧾 {period_label or date range}: {currency_symbol}{total_spent}".
- Optional quick KPIs: transactions count, avg/day.
- Category split as a monospace table (aligned columns):

\`
Category            Amount      Share
Food & Groceries    {currency_symbol}1,240    28.4%
Transport           {currency_symbol}620      14.2%
Housing             {currency_symbol}1,800    41.3%
Other               {currency_symbol}708      16.1%
\`

- Overspending (bullets): category, over amount, % over, one-line fix.
- Unusual (bullets): merchant/category + amount + reason (spike/new/one-off).
- Optimization (bullets): concrete, quantified suggestions.
- Roast (optional; 1 line, light): short motivational jab when warranted.

Constraints
- Do not include a list of all transactions.
- Be accurate with math and units. Respect locale and currency_symbol.
- If mixed currencies appear, prioritize the most frequent currency and note limitation briefly.

Return only the Telegram message, nothing else.`;

        // Send to OpenAI
        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY not set');
            return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
        }

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(transactionData, null, 2)
                    }
                ],
                temperature: 0.7,
                max_tokens: 1500
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('OpenAI API error:', errorText);
            return res.status(500).json({ ok: false, error: 'Failed to analyze with AI' });
        }

        const openaiData = await openaiResponse.json();
        const analysisText = openaiData.choices?.[0]?.message?.content || 'Analysis completed but no response received.';

        // Send analysis to user via Telegram
        try {
            await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: dbUser.telegram_id,
                    text: analysisText,
                    parse_mode: 'Markdown'
                })
            });
        } catch (telegramError) {
            // Log error but don't fail the request - analysis was already completed
            console.error('Failed to send Telegram message:', telegramError);
            return res.status(200).json({ 
                ok: true, 
                message: 'Analysis completed but failed to send via Telegram',
                analysis: analysisText
            });
        }

        return res.status(200).json({ 
            ok: true, 
            message: 'Analysis sent to your Telegram chat',
            analysis: analysisText
        });
    } catch (e: any) {
        console.error('💥 /api/insights/analyze crash:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}

