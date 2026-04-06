// api/schedule.js — Buffer GraphQL API (final clean version)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { caption, imageUrls, platforms, scheduledAt } = req.body;

  if (!caption || !imageUrls?.length || !platforms?.length || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

  const CHANNEL_IDS = {
    instagram: process.env.BUFFER_INSTAGRAM_ID,
    facebook:  process.env.BUFFER_FACEBOOK_ID,
    tiktok:    process.env.BUFFER_TIKTOK_ID,
  };

  const selectedChannels = platforms
    .map(p => ({ platform: p, id: CHANNEL_IDS[p] }))
    .filter(c => c.id);

  if (!selectedChannels.length) {
    return res.status(400).json({ error: 'No valid channel IDs found' });
  }

  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id status dueAt }
        }
      }
    }
  `;

  const results = await Promise.all(
    selectedChannels.map(async ({ platform, id }) => {
      try {
        const variables = {
          input: {
            channelId: id,
            schedulingType: 'automatic',
            dueAt: scheduledAt,
            text: caption,
            mode: 'customScheduled',
            assets: {
              images: imageUrls.map(url => ({ url })),
            },
          }
        };

        const r = await fetch('https://api.buffer.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BUFFER_API_KEY}`,
          },
          body: JSON.stringify({ query: mutation, variables }),
        });

        const data = await r.json();

        if (data.errors) {
          console.error(`Buffer ${platform} error:`, data.errors[0]?.message);
          return { platform, success: false, error: data.errors[0]?.message };
        }

        console.log(`Buffer ${platform}: scheduled successfully`);
        return { platform, success: true };

      } catch (err) {
        console.error(`Buffer ${platform} exception:`, err.message);
        return { platform, success: false, error: err.message };
      }
    })
  );

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (succeeded.length > 0) {
    return res.status(200).json({
      success: true,
      message: `Scheduled to ${succeeded.map(r => r.platform).join(', ')} successfully.`,
      results,
      scheduledAt,
      failed: failed.length ? failed : undefined,
    });
  } else {
    return res.status(500).json({ error: 'Failed to schedule to any platform', results });
  }
};
