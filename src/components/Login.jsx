import React, { useState } from 'react';
import { useAppContext } from '../AppContext';

export default function Login() {
    const { state, updateState } = useAppContext();
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        setErrorMsg('');
        const found = state.users.find(u => String(u.id).toLowerCase() === String(user).toLowerCase() && u.pass === pass);
        if (found) {
            localStorage.setItem('crm_session_native', JSON.stringify(found));
            updateState({ 
                user: found, 
                view: found.role === 'administrador' ? 'admin' : (found.role === 'atencion' || found.role === 'atencion al cliente' ? 'visor' : 'dashboard')
            });
        } else {
            setErrorMsg("Credenciales incorrectas o usuario no encontrado.");
        }
    };

    return (
        <div className="h-full w-full flex items-center justify-center bg-slate-900 px-4 fixed inset-0">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 space-y-6 fade-in">
                <div className="text-center">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="material-icons" style={{ fontSize: '32px' }}>bolt</span>
                    </div>
                    <h1 className="text-2xl font-bold">CRM Avanzado</h1>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                    {errorMsg && (
                        <div className="p-3 bg-red-100 text-red-700 rounded-xl text-center font-semibold text-sm fade-in">
                            {errorMsg}
                        </div>
                    )}
                    <input 
                        value={user} onChange={e => setUser(e.target.value)}
                        type="text" 
                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" 
                        placeholder="ID Usuario" required 
                    />
                    <input 
                        value={pass} onChange={e => setPass(e.target.value)}
                        type="password" 
                        className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" 
                        placeholder="Contraseña" required 
                    />
                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">
                        Entrar al Sistema
                    </button>
                </form>
            </div>
        </div>
    );
}