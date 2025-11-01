import { VercelRequest, VercelResponse } from '@vercel/node';
import { Telegraf, Markup } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const MOTIVATING_MESSAGES = [
  "Nice one, {name}! Every tracked expense is a victory.",
  "Boom! Another win for Team {name}.",
  "You did it again, {name}! Consistency pays—literally.",
  "You're crushing it, {name}! Financial freedom is waving at you.",
  "Another step closer to your goals, {name}. Keep that fire!",
  "Budget boss move, {name}! Keep that streak alive.",
  "Money managed. Confidence earned. Well done, {name}!",
  "Saving spree activated, {name}. Keep stacking those wins!",
  "{name}, you're proof that small steps lead to big change.",
  "Cha-ching! That's the sound of progress, {name}.",
  "Stay in the game, {name}. Millionaires are made one log at a time.",
  "Discipline beats motivation, and you've got both, {name}.",
  "Keep going, {name}—your future self will thank you.",
  "Progress is quiet, {name}. But it's happening every time you log.",
  "{name}, remember: budgets build freedom, not limits.",
  "You're not tracking money, {name}—you're tracking power.",
  "Keep that momentum, {name}. Habits make heroes.",
  "Stay focused, {name}. Wealth loves attention.",
  "Every log is a lesson, {name}. You're getting sharper.",
  "Step by step, {name}. Slow money is smart money.",
  "Nice! Somewhere, your future accountant is smiling, {name}.",
  "{name}, you just made your wallet 0.3% happier.",
  "Good job, {name}! Your inner adult is proud (and shocked).",
  "Keep it up, {name}—you're one log away from a Netflix documentary.",
  "{name}, that's another 'responsible adult' achievement unlocked.",
  "Budgeting level: Jedi Master. Way to go, {name}.",
  "Money moves made! Beyoncé would approve, {name}.",
  "Hey {name}, your wallet called—said it's feeling safer already.",
  "Look at you, {name}, adulting like a pro.",
  "Cash discipline: 100%. Impulse shopping: -100%. Nice one, {name}.",
  "Balance looks good on you, {name}.",
  "Small actions. Big outcomes. Keep your calm, {name}.",
  "{name}, you're not just saving money—you're shaping habits.",
  "Peace of mind starts with numbers in line. Good work, {name}.",
  "Clarity is wealth, {name}. Keep tracking your way to calm.",
  "Each log is a moment of mindfulness, {name}.",
  "Stay patient, {name}. Compound progress is invisible—until it's not.",
  "You're mastering control, {name}. That's real wealth.",
  "Every entry is proof of self-respect, {name}.",
  "Good things take time, {name}. You're on the right track.",
  "No excuses, {name}. You're doing what most won't.",
  "Keep pushing, {name}. Discipline is your superpower.",
  "{name}, winners track. Losers guess.",
  "Feel that? That's the sound of accountability, {name}.",
  "Logging even the small stuff? That's elite mindset, {name}.",
  "One more log, one less regret, {name}.",
  "Stay ruthless with your habits, {name}.",
  "Comfort won't build wealth, {name}. Action will.",
  "Track. Adjust. Dominate. Repeat, {name}.",
  "Keep showing up, {name}. Success is boring—and that's the point."
];

function getRandomMotivationalMessage(name: string): string {
  const randomIndex = Math.floor(Math.random() * MOTIVATING_MESSAGES.length);
  return MOTIVATING_MESSAGES[randomIndex].replace(/{name}/g, name);
}

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
