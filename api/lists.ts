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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const initData = req.body?.initData;
        const type = req.body?.type; // 'categories' or 'currencies' or 'both'

        if (!initData) return res.status(400).json({ ok: false, error: 'Missing initData' });

        const valid = isValid(initData, process.env.BOT_TOKEN!);
        if (!valid) return res.status(401).json({ ok: false, error: 'Invalid hash' });

        const params = new URLSearchParams(initData);
        const userRaw = params.get('user');
        if (!userRaw) return res.status(400).json({ ok: false, error: 'No user' });

        const user = JSON.parse(userRaw);

        const result: any = { ok: true };

        // Get categories if requested
        if (type === 'categories' || type === 'both') {
            const { data: categories, error: cErr } = await supabase
                .from('categories')
                .select('*')
                .neq('name', 'undefined')
                .order('name', { ascending: true });

            if (cErr) {
                console.error('categories select error', cErr);
                return res.status(500).json({ ok: false, error: 'DB error (categories)' });
            }
            result.categories = categories || [];
        }

        // Get currencies if requested
        if (type === 'currencies' || type === 'both') {
            // Get user's current currency
            const { data: dbUser, error: userErr } = await supabase
                .from('users')
                .select('default_currency_id')
                .eq('telegram_id', user.id)
                .maybeSingle();

            if (userErr) {
                console.error('users select error', userErr);
                return res.status(500).json({ ok: false, error: 'DB error (users)' });
            }

            const { data: currencies, error: currErr } = await supabase
                .from('currencies')
                .select('*')
                .order('code', { ascending: true });

            if (currErr) {
                console.error('currencies select error', currErr);
                return res.status(500).json({ ok: false, error: 'DB error (currencies)' });
            }

            result.currencies = currencies || [];
            result.currentCurrencyId = dbUser?.default_currency_id || null;
        }

        return res.status(200).json(result);
    } catch (e: any) {
        console.error('💥 /api/lists crash:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}

