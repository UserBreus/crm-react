async function run() {
    const q = "SELECT id, nombre_completo, rol FROM usuarios WHERE nombre_completo LIKE '%Martin%' OR nombre_completo LIKE '%Martín%'";
    const res = await fetch('http://3.85.26.173:5005/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    console.log("Martin DB:", await res.json());
}
run();
