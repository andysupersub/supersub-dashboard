// api/schedule.js — Buffer GraphQL API (final correct schema)

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

  // First introspect the image input type name
  const introQuery = `
    query {
      assetsInput: __type(name: "AssetsInput") {
        inputFields {
          name
          type {
            name kind
            ofType { name kind ofType { name kind } }
          }
        }
      }
    }
  `;

  const introRes = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_API_KEY}` },
    body: JSON.stringify({ query: introQuery }),
  });
  const introData = await introRes.json();
  const imageField = introData?.data?.assetsInput?.inputFields?.find(f => f.name === 'images');
  const imageTypeName = imageField?.type?.ofType?.ofType?.name || imageField?.type?.ofType?.name;
  console.log('Image type name:', imageTypeName);

  // Now introspect the image item type
  const imageTypeQuery = `query { __type(name: "${imageTypeName}") { inputFields { name type { name kind } } } }`;
  const imgTypeRes = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_API_KEY}` },
    body: JSON.stringify({ query: imageTypeQuery }),
  });
  const imgTypeData = await imgTypeRes.json();
  const imageTypeFields = imgTypeData?.data?.__type?.inputFields?.map(f => f.name) || [];
  console.log('Image type fields:', imageTypeFields);

  const results = await Promise.all(
    selectedChannels.map(async ({ platform, id }) => {
      try {
        const mutation = `
          mutation CreatePost($input: CreatePostInput!) {
            createPost(input: $input) {
              ... on PostActionSuccess {
                post { id status dueAt }
              }
            }
          }
        `;

        // assets.images is an array of image objects
        // Common fields are usually: url, type or just url
        const imageObjects = imageUrls.map(url => {
          if (imageTypeFields.includes('url') && imageTypeFields.includes('type')) {
            return { url, type: 'IMAGE' };
          }
          return { url };
        });

        const variables = {
          input: {
            channelId: id,
            schedulingType: 'notification',
            dueAt: scheduledAt,
            text: caption,
            assets: {
              images: imageObjects,
            },
          }
        };

        console.log(`Sending to ${platform}:`, JSON.stringify(variables).slice(0, 300));

        const r = await fetch('https://api.buffer.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BUFFER_API_KEY}`,
          },
          body: JSON.stringify({ query: mutation, variables }),
        });

        const data = await r.json();
        console.log(`Buffer ${platform} response:`, JSON.stringify(data).slice(0, 400));

        if (data.errors) {
          return { platform, success: false, error: data.errors[0]?.message };
        }

        return { platform, success: true, postId: data.data?.createPost?.post?.id };

      } catch (err) {
        console.error(`Buffer ${platform} error:`, err.message);
        return { platform, success: false, error: err.message };
      }
    })
  );

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  console.log('Final results:', JSON.stringify(results));

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
