async function run() {
    const q = "UPDATE usuarios SET rol = 'administrador' WHERE id = 'Martin'";
    const res = await fetch('http://3.85.26.173:5005/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    console.log("Update res:", await res.text());
}
run();
