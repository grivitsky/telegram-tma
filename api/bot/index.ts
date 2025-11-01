import { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import { getRandomMotivationalMessage } from './motivational-quotes';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

// --- commands ---
bot.start(async (ctx) => {
    try {
        const user = ctx.from;
        // create user if not exists
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', user.id)
            .maybeSingle();

        if (!existing) {
            // Get USD currency ID for default currency
            const { data: usdCurrency } = await supabase
                .from('currencies')
                .select('id')
                .eq('code', 'USD')
                .maybeSingle();

            await supabase.from('users').insert([
                {
                    telegram_id: user.id,
                    username: user.username,
                    first_name: user.first_name,
                    default_currency_id: usdCurrency?.id || null
                }
            ]);
        }

        await ctx.reply(
            `👋 Hi ${user.first_name}!  
Send me messages like:
\`15 Coffee\`
\`230 Rent\`
and I’ll save them to your spendings tracker.`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('start command error', e);
        ctx.reply('Something went wrong while setting you up 😅');
    }
});

// --- handle "Amount Name" messages ---
bot.on('text', async (ctx) => {
    const msg = ctx.message.text.trim();

    // skip commands like /start
    if (msg.startsWith('/')) return;

    // parse "amount name"
    const [amountStr, ...nameParts] = msg.split(' ');
    // Replace comma with dot for decimal separator (e.g., "23,24" -> "23.24")
    const normalizedAmountStr = amountStr.replace(',', '.');
    const amount = parseFloat(normalizedAmountStr);
    const name = nameParts.join(' ').trim();

    if (isNaN(amount) || !name) {
        return ctx.reply('⚠️ Please use format: `Amount Name`\nExample: `12.5 Coffee`', { parse_mode: 'Markdown' });
    }

    try {
        // find user
        const { data: dbUser, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', ctx.from.id)
            .maybeSingle();

        if (userError || !dbUser) {
            console.error('User lookup error:', userError);
            return ctx.reply('❌ Could not find your user in database.');
        }

        // get "undefined" category
        const { data: category, error: categoryError } = await supabase
            .from('categories')
            .select('id')
            .eq('name', 'undefined')
            .maybeSingle();

        if (categoryError) {
            console.error('Category lookup error:', categoryError);
            return ctx.reply('❌ Could not find category in database.');
        }

        // insert spending with undefined category
        const { error: insertError } = await supabase.from('spendings').insert([
            {
                user_id: dbUser.id,
                amount,
                name,
                category_id: category?.id || null
            }
        ]);

        if (insertError) {
            console.error('Insert error:', insertError);
            return ctx.reply('💥 Failed to add spending.');
        }

        const userName = ctx.from.first_name || 'there';
        const motivationalMessage = getRandomMotivationalMessage(userName);
        return ctx.reply(motivationalMessage);
    } catch (e) {
        console.error('Crash adding spending:', e);
        return ctx.reply('💥 Something went wrong.');
    }
});

// --- webhook handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await bot.handleUpdate(req.body as any);
        res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error('Webhook error:', e);
        res.status(200).json({ ok: false, error: e.message });
    }
}
