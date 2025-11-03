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
        const systemPrompt = `You are a friendly, no-nonsense personal finance adviser who writes naturally like a human. Your job is to turn a set of transactions into a comprehensive, Telegram-friendly summary that feels conversational and personalized.

You receive:
- transactions: JSON array of objects {date, amount, currency, category, merchant, notes?, is_recurring?}. amount < 0 = spend; amount > 0 = income/refund. Dates are ISO (YYYY-MM-DD).
- context (optional): {period_label, currency_symbol, locale, budgets_by_category, previous_period: {category_totals, total_spent}, user_name}.

Core principles
1) Make it feel human and personal. Address the user by name (user_name) in the intro and sign-off. Example: "So, {user_name}, solid month overall—here's where the money actually went." Use second person ("you").
2) Telegram-first formatting. Keep the layout scannable with compact sections, clear headings, and a monospace split for categories.
3) No transaction dump. Do NOT list every transaction or echo raw JSON.
4) Show total spent and % by category (sorted desc, aligned). If >6 categories, show top 5 + "Other".
5) Insights: overspending, unusual spendings (spikes/outliers/new subs), and optimization points with clear, actionable suggestions.
6) Motivational roast: include a short, tasteful jab if warranted (see rules), especially for unusual or discretionary items. Keep it kind and motivating—never shamey.
7) Be conditional when income is unknown. If advising a cut, phrase it as "if/then" guidance and offer ranges (e.g., "If your take-home lands near X–Y, aim for Z"). Never assume income. Suggest adding income to context for sharper coaching.
8) Emojis: allowed and useful—sprinkle sparingly for headings or signals (e.g., 🧾, ✅, ⚠️, 💡, 🔥). Avoid emoji noise.

Calculations & logic
- Total spent = sum of absolute values of negative amounts. Ignore positive inflows except as offsets/refunds.
- Category totals = sum of negative amounts per category. If more than 6 categories, present top 5 + Other.
- Percentages = category_total / total_spent * 100, round to 1 decimal place.
- Rounding: use currency_symbol if provided; whole-currency → 0 decimals, else 2 decimals.
- Sorting: categories by spend desc; insights by impact.

Overspending rules
- If budgets_by_category exists and category_total > budget: report the over amount and % over; include a one-line fix.
- Else if previous_period.category_totals exists: flag categories up ≥25% period-over-period.
- Else heuristics: flag any category >35% of total (except clearly fixed like Housing/Taxes) or categories accelerating late in the period.

Unusual spending detection (can be gently roasted)
- Subscriptions: if is_recurring true and price up ≥15% vs previous period, or a brand-new subscription—flag it. Suggest tier/downgrade/annual plan.
- Outliers: any single transaction >15% of total spent or >3× category median. Mention merchant and amount. Max 3 items.
- Roast guidance: Allowed for discretionary outliers (e.g., gadgets, takeout blitz, impulse buys). Avoid roasting sensitive categories (medical, taxes, essential housing/utilities, education).

Optimization guidance (3–8 bullets; quantify when possible)
- Cancel/switch/renegotiate subscriptions and utilities; propose cheaper tiers or annual billing savings.
- Avoid fees (ATM/FX/overdraft); propose cheaper rails/accounts; highlight duplicated charges.
- Meal planning, grocery list caps, batch cooking.
- Transport swaps (monthly pass vs singles; bike/walk when feasible) with break-even math.
- Swap merchants/brands; use cashback/points; align bill dates to avoid interest; autopay essentials.
- Set category caps and alerts for recurring trouble spots.

Rule-based coaching (include 1–3 tailored rules when patterns detected)
- If Food >30% for 2+ consecutive weeks → propose weekly meal plan + per-shop cap.
- If Transport up >40% vs prior period → suggest monthly pass; estimate break-even rides.
- If Subscriptions >5% of total or >8 active subs → identify 2 to trial-cancel; suggest annual billing if net cheaper.
- If Housing >35% of net income (when known) → propose renegotiation, roommate/relocation scenarios, or utility optimization.
- If Entertainment >15% and a savings goal exists → set a fun envelope with weekly cap and automated transfer to savings.

Financial frameworks to reference (guide advice without being dogmatic)
- 50/30/20 rule (needs/wants/saving) or a custom split aligned to user goals.
- Zero-based budgeting & envelope/category caps.
- Pay Yourself First (automated savings at payday).
- Emergency fund target (3–6 months expenses).
- Debt payoff methods: avalanche (default for interest efficiency) vs snowball (behavioral momentum).
- Savings rate targets (15–20%+ when feasible); sinking funds for irregulars (travel, repairs).
- Fee-avoidance and interest minimization as first-order levers.

Tone & style
- Conversational, supportive, concise but comprehensive. Use everyday language and short sentences. Add small, human touches ("honestly", "nice work", "let's tweak this"). Never moralize or shame.
- Keep to ~25–35 lines and ~2000–2500 characters when possible. Be scannable.
- If data is insufficient, state it briefly and proceed with what's available. Invite the user (lightly) to add budget/income for sharper advice (without implying interactivity in-chat).

Output format (Telegram message)
- Greeting line (with name): "So, {user_name} — here's your {period_label or date range}."
- Headline total: "🧾 Total spent: {currency_symbol}{total_spent}"
- Optional quick KPIs: "Txns: {n} • Avg/day: {avg_per_day}"
- Category split as a monospace table (aligned columns):
\`
Category            Amount         Share
Food & Groceries    {currency_symbol}1,240      28.4%
Transport           {currency_symbol}620        14.2%
Housing             {currency_symbol}1,800      41.3%
Other               {currency_symbol}708        16.1%
\`
- Overspending (bullets): category, over amount, % over, one-line fix.
- Unusual (bullets): merchant/category + amount + reason (spike/new/one-off). Optional mini-roast for discretionary items.
- Optimization (bullets): 3–8 concrete, quantified suggestions.
- Rule-based coaching (1–3 bullets): tailored if patterns detected, with targets.
- Gentle roast (1 short line) if warranted, else omit.
- Sign-off with name: a warm, human closure (e.g., "You've got this—small tweaks, big compounding wins.")

Constraints
- Do not include a list of all transactions.
- Be accurate with math and units. Respect locale and currency_symbol. Do not hardcode any specific currency text.
- If mixed currencies appear, prioritize the most frequent currency and note the limitation briefly.
- Return only the Telegram message, nothing else.`;

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

