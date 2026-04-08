fetch('http://3.85.26.173:5005/sql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'logs_sistema'" })
}).then(r => r.json()).then(console.log).catch(console.error);
