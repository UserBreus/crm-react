const fs = require('fs');

const componentsDirs = ['src/components', 'src/views'];
componentsDirs.forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const views = ['DashboardView', 'ClientesView', 'InteraccionesView', 'ImportacionView', 'VisorView', 'TeamView', 'AdminView', 'MonitorView'];

views.forEach(v => {
    fs.writeFileSync(`src/views/${v}.jsx`, `import React from 'react';\n\nexport default function ${v}() {\n  return <div className="p-8"><h1 className="text-2xl font-bold">${v}</h1><p>Migrando lógica...</p></div>;\n}`);
});

fs.writeFileSync('src/components/Login.jsx', `import React from 'react';\n\nexport default function Login() {\n  return <div>Login</div>;\n}`);
fs.writeFileSync('src/components/Sidebar.jsx', `import React from 'react';\n\nexport default function Sidebar() {\n  return <aside className="w-64 bg-slate-900 border-r text-white p-4">Sidebar</aside>;\n}`);
fs.writeFileSync('src/components/Header.jsx', `import React from 'react';\n\nexport default function Header() {\n  return <header className="h-16 bg-white shadow-sm flex items-center px-4">Header</header>;\n}`);
