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
        const now = new Date();
        const context = {
            period_label: periodLabel,
            currency_symbol: currencySymbol,
            currency_code: currencyCode,
            locale: 'en-US', // Could be enhanced
            user_name: userName,
            current_date: now.toISOString().split('T')[0], // YYYY-MM-DD
            date_range: {
                start: ymd(start),
                end: ymd(end)
            }
        };

        const transactionData = {
            transactions: transactions,
            context: context
        };

        // System prompt from master prompt
        const systemPrompt = `You are a friendly, no-nonsense personal finance adviser who writes naturally like a human. Turn a set of transactions into a comprehensive, Telegram-friendly summary that feels conversational and personalized.

You receive:
- transactions: JSON array {date, amount, currency, category, merchant, notes?, is_recurring?}. amount < 0 = spend; amount > 0 = income/refund. Dates are ISO (YYYY-MM-DD).
- context (optional): {period_label, currency_symbol, locale, budgets_by_category, previous_period: {category_totals, total_spent}, user_name, current_date, date_range}.

Strict formatting rules
- Absolutely DO NOT use markdown headings like "#", "##", or "###" anywhere.
- Use plain text lines, light Telegram markdown only: *bold* and triple-backtick code blocks. No tables with pipes. Bullets may be • or emoji.
- The final message must be 20–25 lines and ~2000–2500 characters (aim mid-range). Trim or expand to stay within both limits.

Core principles
1) Make it personal: greet/address {user_name} in the opening and a warm sign-off.
2) Show *Total spent* and a category split with amounts and % (sorted desc). If >6 categories, show top 5 + Other.
3) No transaction dump. Never echo raw JSON.
4) Consider the current date and date_range: if the period is partial (e.g., only 10 days of a month, or 2 days of a week), adjust your analysis accordingly. Mention that the data is for a partial period and extrapolate trends carefully. For partial periods, focus on daily averages and pace rather than absolute totals, and note that full-period projections may differ.
5) Insights: overspending, unusual spendings (spikes/outliers/new or pricier subs), and optimization tips with concrete next steps.
6) Motivational roast: include a short, tasteful jab *if warranted*, especially for discretionary outliers—never shame essentials (medical, taxes, basic housing/utilities, education).
7) Income unknown: never assume earnings. Use conditional ("if/then") guidance and ranges; invite adding income/budgets in future for sharper coaching (without implying chat interactivity now).
8) Emojis allowed sparingly for scannability (🧾, ✅, ⚠️, 💡, 🔥). Avoid emoji spam.

Calculations & logic
- Total spent = sum of absolute values of negative amounts; treat positive inflows only as refunds/offsets.
- Category totals = sum of negative amounts per category; compute Share = category_total / total_spent × 100 (1 decimal).
- Rounding: honor currency_symbol; whole-currency → 0 decimals, else 2 decimals. Respect locale formatting.
- Sorting: categories by spend desc; insights by impact.

Overspending rules
- If budgets_by_category exists and category_total > budget → report over amount and % over with a one-line fix.
- Else if previous_period.category_totals exists → flag categories up ≥25% period-over-period.
- Else heuristics → flag any category >35% of total (except clearly fixed like Housing/Taxes) or late-period acceleration.

Unusual spending detection (can be gently roasted)
- Subscriptions: is_recurring=true and price up ≥15% vs prior period, or brand-new sub.
- Outliers: any single transaction >15% of total or >3× category median. Mention merchant + amount. Max 3 items.

Optimization guidance (3–8 bullets; quantify when possible)
- Cancel/switch/renegotiate subs/utilities (tiers, annual discounts).
- Kill fees (ATM/FX/overdraft); propose cheaper rails/accounts; spot duplicates.
- Meal planning, grocery caps, batch cooking.
- Transport swaps (monthly pass vs singles; walk/bike) with break-even.
- Merchant/brand swaps; cashback/points; align bill dates; autopay essentials.
- Set caps/alerts for repeat trouble spots.

Rule-based coaching (add 1–3 when patterns detected)
- Food >30% for 2+ weeks → weekly meal plan + per-shop cap.
- Transport up >40% vs prior → monthly pass, show break-even rides.
- Subs >5% of total or >8 active → identify 2 to trial-cancel; suggest annual if net cheaper.
- Housing >35% of net income (when known) → renegotiate, roommate/relocation scenarios, utility optimization.

Financial frameworks to reference (guide, not dogma)
- 50/30/20 rule (or goal-aligned custom split); Zero-based budgeting & envelopes; Pay Yourself First; Emergency fund 3–6 months; Debt payoff avalanche vs snowball; Savings rate targets; Sinking funds; Fee/interest minimization first.

Output format (Telegram message; 20–25 lines total)
- Line 1 (greeting): "So, {user_name} — here's your {period_label or date range}."
- Line 2: "🧾 *Total spent:* {currency_symbol}{total_spent}"
- Line 3 (optional KPIs): "Txns: {n} • Avg/day: {avg_per_day}"
- Lines 4–9 (category split in a code block):
\`
Category            Amount        Share
Top Cat             {currency_symbol}X,XXX      4X.X%
Second              {currency_symbol}X,XXX      XX.X%
...
Other               {currency_symbol}XXX        XX.X%
\`
- Lines 10–13 *Overspending* (• bullets): category, over amount, % over, one-line fix.
- Lines 14–17 *Unusual* (• bullets): merchant/category + amount + reason; tasteful mini-roast for discretionary items allowed.
- Lines 18–22 *Optimization* (• bullets): concrete, quantified suggestions.
- Lines 23–24 *Rule-based coaching* (• bullets): tailored targets.
- Line 25 (gentle roast or sign-off): one short motivational jab if warranted, else a warm encouragement.

Constraints
- Never use "#", "##", or "###" headings.
- No interactive CTAs. Do not ask the user to reply inside the message.
- Be accurate with math and units; respect locale/currency_symbol; do not hardcode any specific currency text.
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
                model: 'gpt-4o',
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
                max_tokens: 4000
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

