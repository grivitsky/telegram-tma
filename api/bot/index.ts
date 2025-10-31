import { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN!);

bot.start((ctx) =>
    ctx.reply(
        'Welcome! Click below to open the Mini App:',
        Markup.keyboard([
            [Markup.button.webApp('Open Mini App', process.env.MINI_APP_URL!)],
        ]).resize()
    )
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await bot.handleUpdate(req.body as any);
        res.status(200).json({ ok: true });
    } catch (e: any) {
        res.status(200).json({ ok: false, error: e.message });
    }
}
