export default async function handler(request, response) {
  // CORS setup
  response.setHeader('Access-Control-Allow-Credentials', true)
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')

  if (request.method === 'OPTIONS') {
    response.status(200).end()
    return
  }

  try {
     const extPath = request.query.extPath || 'clientes';
     const url = `https://user.com.uy/api/external/${extPath}`;

     // Check if it's PATCH for assignment
     const fetchOptions = {
         method: request.method,
         headers: { 
            'Content-Type': 'application/json',
            'x-api-key': 'VilardeboyDefensa@2031' // SECURE: Inserted ONLY in Vercel backend
         }
     };

     if (request.method !== 'GET' && request.method !== 'HEAD') {
         // Pass the body (e.g. {"VendedorID": 12345678})
         fetchOptions.body = JSON.stringify(request.body);
     }

     const res = await fetch(url, fetchOptions);
     const data = await res.json();
     
     return response.status(res.status).json(data);
     
  } catch (err) {
     return response.status(500).json({ error: "Fallo proxy a API Externa: " + err.message });
  }
}
