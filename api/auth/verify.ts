import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

function buildDataCheckString(params: URLSearchParams) {
    const pairs = [];
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
    const calc = crypto
        .createHmac('sha256', secret)
        .update(dataCheckString)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const initData = req.body?.initData;
    if (!initData)
        return res.status(400).json({ ok: false, error: 'Missing initData' });

    const valid = isValid(initData, process.env.BOT_TOKEN!);
    if (!valid) return res.status(401).json({ ok: false, error: 'Invalid hash' });

    const params = new URLSearchParams(initData);
    const userRaw = params.get('user');
    if (!userRaw) return res.status(400).json({ ok: false, error: 'No user data' });

    const user = JSON.parse(userRaw);

    // create or get user from supabase
    const { data: existing, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', user.id)
        .maybeSingle();

    if (error) {
        console.error(error);
        return res.status(500).json({ ok: false, error: 'Supabase error' });
    }

    let dbUser = existing;
    if (!dbUser) {
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([
                {
                    telegram_id: user.id,
                    first_name: user.first_name,
                    username: user.username,
                },
            ])
            .select()
            .single();

        if (insertError) {
            console.error(insertError);
            return res.status(500).json({ ok: false, error: 'Create user failed' });
        }
        dbUser = newUser;
    }

    return res.status(200).json({ ok: true, user: dbUser });
}
