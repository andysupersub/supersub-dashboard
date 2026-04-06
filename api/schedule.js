// api/schedule.js — Vercel Serverless Function
// Receives schedule request from dashboard, calls Buffer MCP via Claude API

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const {
    title,       // carousel title
    caption,     // full caption text
    imageUrls,   // array of image URLs (slides)
    platforms,   // array: ['instagram', 'facebook', 'tiktok']
    scheduledAt, // ISO datetime string in NZ time converted to UTC
  } = req.body;

  // Validate
  if (!caption || !imageUrls?.length || !platforms?.length || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ============================================================
  // FILL IN YOUR VALUES HERE
  // ============================================================
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const BUFFER_MCP_URL = 'https://mcp.buffer.com/mcp';
  const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

  // Your Buffer Channel IDs — fill these in
  const CHANNEL_IDS = {
    instagram: process.env.BUFFER_INSTAGRAM_ID, // e.g. '6123abc456def789'
    facebook:  process.env.BUFFER_FACEBOOK_ID,
    tiktok:    process.env.BUFFER_TIKTOK_ID,
  };

  // Build selected channel IDs
  const selectedChannelIds = platforms
    .map(p => CHANNEL_IDS[p])
    .filter(Boolean);

  if (!selectedChannelIds.length) {
    return res.status(400).json({ error: 'No valid channel IDs found for selected platforms' });
  }

  // ============================================================
  // BUILD THE PROMPT FOR CLAUDE + BUFFER MCP
  // ============================================================
  const prompt = `
You are a social media scheduling assistant for SuperSub New Zealand.

Please schedule the following carousel post to Buffer using the create_post tool.

Post details:
- Title: ${title}
- Caption: ${caption}
- Image URLs (in order): ${imageUrls.join(', ')}
- Channel IDs to post to: ${selectedChannelIds.join(', ')}
- Scheduled time (UTC): ${scheduledAt}

Use the Buffer MCP create_post tool to schedule this post to each of the channel IDs provided.
Schedule each channel separately with the same content and scheduled time.
Confirm when all posts have been scheduled successfully.
  `.trim();

  try {
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
            url: BUFFER_MCP_URL,
            name: 'buffer',
            authorization_token: BUFFER_API_KEY,
          }
        ],
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', data);
      return res.status(500).json({ error: 'Claude API error', detail: data });
    }

    // Extract text response
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return res.status(200).json({
      success: true,
      message: text,
      platforms,
      scheduledAt,
    });

  } catch (err) {
    console.error('Schedule error:', err);
    return res.status(500).json({ error: 'Failed to schedule post', detail: err.message });
  }
}
