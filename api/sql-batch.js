export default async function handler(request, response) {
  // CORS setup
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  try {
     const body = request.body;
     const query = body.query;
     
     if (!query) {
         return response.status(400).json({ error: "No query provided for batch" });
     }
     
     const upperQuery = query.toUpperCase();
     
     // FIREWALL ANTI-DESTRUCCIÓN BATCH
     if (/DROP\s+TABLE/i.test(upperQuery) || 
         /\bDELETE\s+FROM\b/i.test(upperQuery) || 
         /\bTRUNCATE\b/i.test(upperQuery) || 
         /\bALTER\s+TABLE\b/i.test(upperQuery) ||
         /\bDROP\s+DATABASE\b/i.test(upperQuery) ||
         /xp_cmdshell/i.test(upperQuery)) {
         
         console.warn("[SECURITY BLOCK] BATCH Intento de inyección letal bloqueada:", query);
         return response.status(403).json({ error: "Operación SQL Prohibida por Políticas de Seguridad de Vercel/AWS." });
     }
     
     // Forward to real AWS IP
     const res = await fetch("http://3.85.26.173:5005/sql-batch", {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
     });
     
     const data = await res.json();
     return response.status(res.status).json(data);
     
  } catch (err) {
     return response.status(500).json({ error: "Fallo del Firewall Batch Serverless: " + err.message });
  }
}
