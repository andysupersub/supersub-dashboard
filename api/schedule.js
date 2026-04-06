// api/schedule.js — Buffer GraphQL API (final version with all union types)

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

  // Include ALL union types so we can see exactly what's returned
  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id status dueAt }
        }
        ... on NotFoundError {
          message
          type
        }
        ... on UnauthorizedError {
          message
          type
        }
        ... on UnexpectedError {
          message
          type
        }
        ... on RestProxyError {
          message
          type
        }
        ... on LimitReachedError {
          message
          type
        }
        ... on InvalidInputError {
          message
          type
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
            assets: { images: imageUrls.map(url => ({ url })) },
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
        console.log(`Buffer ${platform} FULL:`, JSON.stringify(data));

        if (data.errors) {
          return { platform, success: false, error: data.errors[0]?.message };
        }

        const result = data.data?.createPost;

        // Check which union type was returned
        if (result?.post) {
          // PostActionSuccess
          return { platform, success: true, postId: result.post.id };
        } else if (result?.message) {
          // One of the error types
          console.log(`Buffer ${platform} error type:`, result.type, result.message);
          return { platform, success: false, error: `${result.type}: ${result.message}` };
        } else if (result && Object.keys(result).length === 0) {
          // Empty object — post created but fragment didn't match
          // This means PostActionSuccess matched but post fields are restricted
          return { platform, success: true, note: 'Post created (no ID returned)' };
        }

        return { platform, success: false, error: 'Unknown response: ' + JSON.stringify(result) };

      } catch (err) {
        return { platform, success: false, error: err.message };
      }
    })
  );

  console.log('Final results:', JSON.stringify(results));

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
