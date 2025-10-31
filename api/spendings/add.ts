import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

// --- helper functions (same as verify.ts) ---
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

// --- main handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('🧾 /api/spendings/add called');
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'POST only' });
    }

    try {
        const { initData, text } = req.body || {};
        if (!initData) {
            return res.status(400).json({ ok: false, error: 'Missing initData' });
        }
        if (!text) {
            return res.status(400).json({ ok: false, error: 'Missing text (e.g. "12.5 Coffee")' });
        }

        // validate Telegram signature
        const valid = isValid(initData, process.env.BOT_TOKEN!);
        if (!valid) {
            return res.status(401).json({ ok: false, error: 'Invalid Telegram hash' });
        }

        // parse user
        const params = new URLSearchParams(initData);
        const userRaw = params.get('user');
        if (!userRaw) {
            return res.status(400).json({ ok: false, error: 'No user in initData' });
        }
        const user = JSON.parse(userRaw);

        // find the user in DB
        const { data: dbUser, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', user.id)
            .maybeSingle();

        if (userError || !dbUser) {
            return res.status(404).json({ ok: false, error: 'User not found in DB' });
        }

        // parse "Amount Name" string
        const [amountStr, ...nameParts] = text.trim().split(' ');
        const amount = parseFloat(amountStr);
        const name = nameParts.join(' ').trim();

        if (isNaN(amount) || !name) {
            return res.status(400).json({
                ok: false,
                error: 'Invalid format. Use "Amount Name", e.g. "12.5 Coffee"',
            });
        }

        // insert into spendings
        const { data: spending, error: insertError } = await supabase
            .from('spendings')
            .insert([
                {
                    user_id: dbUser.id,
                    amount,
                    name,
                },
            ])
            .select()
            .single();

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return res.status(500).json({ ok: false, error: 'Failed to insert spending' });
        }

        console.log('✅ Added spending:', spending);
        return res.status(200).json({ ok: true, spending });
    } catch (e: any) {
        console.error('💥 Crash in /api/spendings/add:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
