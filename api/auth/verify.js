// api/auth/verify.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

function getTelegramInitData(req: VercelRequest) {
    // accept as raw string, or JSON { initData: "querystring..." }
    return typeof req.body === 'string' ? req.body : (req.body?.initData || '');
}

function buildDataCheckString(params: URLSearchParams) {
    // sort keys (excluding 'hash'); join as key=value with '\n'
    const pairs = [];
    for (const [key, value] of Array.from(params.entries()).filter(([k]) => k !== 'hash').sort()) {
        pairs.push(`${key}=${value}`);
    }
    return pairs.join('\n');
}

function getSecretKey(botToken: string) {
    // secret = HMAC_SHA256("WebAppData", botToken)
    return crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
}

function isValidInitData(initData: string, botToken: string) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash') || '';
    const dataCheckString = buildDataCheckString(params);
    const secret = getSecretKey(botToken);
    const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const initData = getTelegramInitData(req);
        if (!initData) return res.status(400).json({ ok: false, error: 'Missing initData' });

        const ok = isValidInitData(initData, process.env.BOT_TOKEN!);
        if (!ok) return res.status(401).json({ ok: false, error: 'Invalid hash' });

        // Optional freshness check (recommended): verify auth_date not too old
        const params = new URLSearchParams(initData);
        const user = params.get('user'); // JSON string
        const authDate = Number(params.get('auth_date') || '0') * 1000;

        // Issue your own session (JWT/cookie); here we just echo minimal info
        return res.json({ ok: true, user: user ? JSON.parse(user) : null });
    } catch (e: any) {
        return res.status(500).json({ ok: false, error: e.message });
    }
}
