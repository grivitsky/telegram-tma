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
        const spendingId = req.body?.spendingId;
        const amount = req.body?.amount;
        const name = req.body?.name;

        if (!initData) return res.status(400).json({ ok: false, error: 'Missing initData' });
        if (!spendingId) return res.status(400).json({ ok: false, error: 'Missing spendingId' });
        if (amount === undefined) return res.status(400).json({ ok: false, error: 'Missing amount' });
        if (!name) return res.status(400).json({ ok: false, error: 'Missing name' });

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

        // Verify the spending belongs to this user
        const { data: spending, error: sErr } = await supabase
            .from('spendings')
            .select('id, user_id')
            .eq('id', spendingId)
            .eq('user_id', dbUser.id)
            .maybeSingle();

        if (sErr || !spending) {
            console.error('spending verification error', sErr);
            return res.status(404).json({ ok: false, error: 'Spending not found' });
        }

        // Update the spending
        const { error: updateErr } = await supabase
            .from('spendings')
            .update({ 
                amount: parseFloat(amount),
                name: name.trim()
            })
            .eq('id', spendingId)
            .eq('user_id', dbUser.id);

        if (updateErr) {
            console.error('update error', updateErr);
            return res.status(500).json({ ok: false, error: 'DB error (update)' });
        }

        return res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error('💥 /api/spendings/update crash:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}

