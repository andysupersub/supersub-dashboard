module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

  // Introspect AssetsInput and all related input types
  const query = `
    query {
      assetsInput: __type(name: "AssetsInput") {
        inputFields { name type { name kind ofType { name kind } } }
      }
      imageInput: __type(name: "ImageInput") {
        inputFields { name type { name kind ofType { name kind } } }
      }
      videoInput: __type(name: "VideoInput") {
        inputFields { name type { name kind ofType { name kind } } }
      }
      linkInput: __type(name: "LinkInput") {
        inputFields { name type { name kind ofType { name kind } } }
      }
    }
  `;

  const r = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BUFFER_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  const data = await r.json();
  console.log('AssetsInput:', JSON.stringify(data?.data?.assetsInput));
  console.log('ImageInput:', JSON.stringify(data?.data?.imageInput));

  return res.status(200).json({ debug: true, data: data?.data });
};
