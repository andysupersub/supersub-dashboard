module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BUFFER_API_KEY = process.env.BUFFER_API_KEY;

  const introRes = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_API_KEY}` },
    body: JSON.stringify({ query: `
      query {
        postInputMetaData: __type(name: "PostInputMetaData") {
          inputFields {
            name
            type { name kind ofType { name kind ofType { name kind } } }
          }
        }
      }
    `}),
  });
  const data = await introRes.json();
  const fields = data?.data?.postInputMetaData?.inputFields || [];
  console.log('PostInputMetaData fields:', JSON.stringify(fields));

  // Also introspect each nested type
  const nestedTypes = fields
    .map(f => f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name)
    .filter(Boolean);
  console.log('Nested types:', nestedTypes);

  // Introspect all nested types at once
  const nestedQuery = nestedTypes.map((t, i) => `
    type${i}: __type(name: "${t}") {
      name
      kind
      inputFields { name type { name kind ofType { name } } }
      enumValues { name }
    }
  `).join('\n');

  const nestedRes = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_API_KEY}` },
    body: JSON.stringify({ query: `query { ${nestedQuery} }` }),
  });
  const nestedData = await nestedRes.json();
  console.log('Nested types detail:', JSON.stringify(nestedData?.data));

  return res.status(200).json({ debug: true, fields, nestedData: nestedData?.data });
};
