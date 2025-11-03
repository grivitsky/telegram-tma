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
            .select('id, telegram_id, ai_features_enabled')
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

        // Prepare transaction data for OpenAI
        const transactions = (spendings || []).map(s => ({
            date: s.date_of_log,
            amount: Number(s.amount || 0),
            name: s.name,
            category: s.categories ? {
                name: s.categories.name,
                emoji: s.categories.emoji
            } : null
        }));

        const total = transactions.reduce((sum, t) => sum + t.amount, 0);
        const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);

        // Create JSON for OpenAI
        const transactionData = {
            period: periodLabel,
            dateRange: {
                start: ymd(start),
                end: ymd(end)
            },
            total: total,
            transactionCount: transactions.length,
            transactions: transactions
        };

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
                        role: 'user',
                        content: `Analyse those transactions:\n\n${JSON.stringify(transactionData, null, 2)}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
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
                    text: `📊 AI Analysis for ${periodLabel}:\n\n${analysisText}`
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

