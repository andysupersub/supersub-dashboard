// api/schedule.js — Vercel Serverless Function (CommonJS)
// Async fire-and-forget approach — returns immediately, schedules in background

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, caption, imageUrls, platforms, scheduledAt } = req.body;

  if (!caption || !imageUrls?.length || !platforms?.length || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const BUFFER_API_KEY    = process.env.BUFFER_API_KEY;

  const CHANNEL_IDS = {
    instagram: process.env.BUFFER_INSTAGRAM_ID,
    facebook:  process.env.BUFFER_FACEBOOK_ID,
    tiktok:    process.env.BUFFER_TIKTOK_ID,
  };

  const selectedChannelIds = platforms.map(p => CHANNEL_IDS[p]).filter(Boolean);

  if (!selectedChannelIds.length) {
    return res.status(400).json({ error: 'No valid channel IDs found for selected platforms' });
  }

  const prompt = `
Schedule this social media carousel post to Buffer.

Use the create_post tool for each of these channel IDs: ${selectedChannelIds.join(', ')}

Post details:
- Text: ${caption}
- Images (in order): ${imageUrls.join(', ')}
- Scheduled time (UTC): ${scheduledAt}

Schedule each channel separately. Use the same text and images for all channels.
  `.trim();

  // ============================================================
  // FIRE AND FORGET — respond immediately, schedule in background
  // ============================================================

  // Return success to dashboard right away
  res.status(200).json({
    success: true,
    message: `Scheduling to ${platforms.join(', ')} for ${scheduledAt}. Check Buffer in 30 seconds to confirm.`,
    platforms,
    scheduledAt,
    note: 'Post is being scheduled in the background. Please verify in Buffer.'
  });

  // Now do the actual work after responding
  // Vercel will keep the function alive briefly after res.end()
  try {
    console.log('Starting background schedule for:', title, 'to channels:', selectedChannelIds);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        mcp_servers: [
          {
            type: 'url',
            url: 'https://mcp.buffer.com/mcp',
            name: 'buffer',
            authorization_token: BUFFER_API_KEY,
          }
        ],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';
    console.log('Background schedule completed:', text.slice(0, 300));

  } catch (err) {
    console.error('Background schedule error:', err.message);
  }
};
