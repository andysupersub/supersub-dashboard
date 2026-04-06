module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

  // Get PostType and PostTypeFacebook enum values
  const introRes = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_API_KEY}` },
    body: JSON.stringify({ query: `
      query {
        postType: __type(name: "PostType") { enumValues { name } }
        postTypeFacebook: __type(name: "PostTypeFacebook") { enumValues { name } }
      }
    `}),
  });
  const data = await introRes.json();
  console.log('PostType enums:', JSON.stringify(data?.data?.postType?.enumValues?.map(e => e.name)));
  console.log('PostTypeFacebook enums:', JSON.stringify(data?.data?.postTypeFacebook?.enumValues?.map(e => e.name)));

  return res.status(200).json({ debug: true, data: data?.data });
};
