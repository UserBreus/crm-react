async function run() { 
    const res = await fetch('http://3.85.26.173:5005/sql', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ query: "SELECT id, nombre_completo, rol FROM usuarios" }) 
    }); 
    const data = await res.json();
    console.log("Todos los usuarios y sus roles:");
    if (data.data) {
        data.data.forEach(u => console.log(`  ${u.id} | ${u.nombre_completo} | rol: '${u.rol}'`));
    }
} 
run();
