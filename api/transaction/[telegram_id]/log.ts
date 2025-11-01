import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getRandomMotivationalMessage } from '../../bot/motivational-quotes';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

function parseTransactionMessage(message: string): { amount: number | null; name: string | null } {
    // Handle URL-encoded newlines (%0A or \n)
    const decodedMessage = decodeURIComponent(message.replace(/%0A/g, '\n'));
    const lines = decodedMessage.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let amount: number | null = null;
    let name: string | null = null;

    // Extract amount from second row (line index 1)
    // Format: "Kwota 87.19 PLN" or "Kwota 87,19 PLN"
    if (lines.length > 1) {
        const amountLine = lines[1];
        // Match: Kwota followed by digits, comma/dot, and 1-2 digits (e.g., "87.19" or "87,19" or "87.1")
        const amountMatch = amountLine.match(/Kwota\s+(\d+[,.]\d{1,2})/i);
        if (amountMatch) {
            // Replace comma with dot for parsing (Polish format uses comma as decimal)
            const amountStr = amountMatch[1].replace(',', '.');
            amount = parseFloat(amountStr);
            if (isNaN(amount)) {
                amount = null;
            }
        }
    }

    // Extract full third row (line index 2) as name
    if (lines.length > 2) {
        name = lines[2].trim();
    }

    return { amount, name };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Get telegram_id from URL path
        const telegramId = req.query.telegram_id as string;
        const message = req.query.message as string;

        if (!telegramId) {
            return res.status(400).json({ ok: false, error: 'Missing telegram_id in URL' });
        }

        if (!message) {
            return res.status(400).json({ ok: false, error: 'Missing message query parameter' });
        }

        // Parse the message
        const { amount, name } = parseTransactionMessage(message);

        if (!amount || !name) {
            return res.status(400).json({ 
                ok: false, 
                error: 'Could not parse transaction from message',
                parsed: { amount, name }
            });
        }

        // Find user by telegram_id
        const { data: dbUser, error: userError } = await supabase
            .from('users')
            .select('id, first_name')
            .eq('telegram_id', parseInt(telegramId))
            .maybeSingle();

        if (userError) {
            console.error('User lookup error:', userError);
            return res.status(500).json({ ok: false, error: 'DB error (users)' });
        }

        if (!dbUser) {
            return res.status(404).json({ ok: false, error: 'User not found' });
        }

        // Get "undefined" category
        const { data: category, error: categoryError } = await supabase
            .from('categories')
            .select('id')
            .eq('name', 'undefined')
            .maybeSingle();

        if (categoryError) {
            console.error('Category lookup error:', categoryError);
            return res.status(500).json({ ok: false, error: 'DB error (categories)' });
        }

        // Insert spending with undefined category
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
            return res.status(500).json({ ok: false, error: 'DB error (insert)' });
        }

        // Send motivational message via Telegram Bot API
        try {
            const userName = dbUser.first_name || 'there';
            const motivationalMessage = getRandomMotivationalMessage(userName);
            
            await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: parseInt(telegramId),
                    text: motivationalMessage
                })
            });
        } catch (telegramError) {
            // Log error but don't fail the request - transaction was already saved
            console.error('Failed to send Telegram message:', telegramError);
        }

        return res.status(200).json({ 
            ok: true, 
            message: 'Transaction logged successfully',
            transaction: { amount, name }
        });
    } catch (e: any) {
        console.error('💥 /api/transaction/[telegram_id]/log crash:', e);
        return res.status(500).json({ ok: false, error: e.message });
    }
}

