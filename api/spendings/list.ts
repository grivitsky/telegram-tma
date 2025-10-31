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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const initData = req.body?.initData;
        if (!initData) return res.status(400).json({ ok: false, error: 'Missing initData' });

        const valid = isValid(initData, process.env.BOT_TOKEN!);
        if (!valid) return res.status(401).json({ ok: false, error: 'Invalid hash' });

        const params = new URLSearchParams(initData);
        const userRaw = params.get('user');
        if (!userRaw) return res.status(400).json({ ok: false, error: 'No user' });

        const user = JSON.parse(userRaw);

        // find user in DB
        const { data: dbUser, error: userErr } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', user.id)
            .maybeSingle();

        if (userErr) {
            console.error('users select error', userErr);
            return res.status(500).json({ ok: false, error: 'DB error (users)' });
        }
        if (!dbUser) return res.status(404).json({ ok: false, error: 'User not found' });

        // month range: [startOfMonth, startOfNextMonth)
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const { data: spendings, error: sErr } = await supabase
            .from('spendings')
            .select('*')
            .eq('user_id', dbUser.id)
            .gte('date_of_log', ymd(start))
            .lt('date_of_log', ymd(next))
            .order('date_of_log', { ascending: false })
            .order('created_at', { ascending: false });

        if (sErr) {
            console.error('spendings select error', sErr);
            return res.status(500).json({ ok: false, error: 'DB error (spendings)' });
        }

        const total = (spendings || []).reduce((sum, s) => sum + Number(s.amount || 0), 0);
        return res.status(200).json({ ok: true, total, spendings: spendings || [] });
    } catch (e: any) {
        console.error('💥 /api/spendings/list crash:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
