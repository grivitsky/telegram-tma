import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

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

export default function handler(req: VercelRequest, res: VercelResponse) {
    const initData = req.body?.initData;
    if (!initData)
        return res.status(400).json({ ok: false, error: 'Missing initData' });

    const valid = isValid(initData, process.env.BOT_TOKEN!);
    if (!valid) return res.status(401).json({ ok: false, error: 'Invalid hash' });

    const params = new URLSearchParams(initData);
    const user = params.get('user') || '{}';
    res.status(200).json({ ok: true, user });
}
