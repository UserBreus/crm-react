import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function MonitorView() {
  const { state } = useAppContext();
  
  const [logs, setLogs] = useState([]);
  const [liveTraffic, setLiveTraffic] = useState([]);
  const [loading, setLoading] = useState(false);
  const [localEgressBytes, setLocalEgressBytes] = useState(0);

  const fetchLogs = useCallback(async () => {
      setLoading(true);
      try {
          const res = await execSQL('SELECT TOP 300 * FROM logs_sistema ORDER BY timestamp DESC');
          if (Array.isArray(res) && !res.error) {
              setLogs(res);
          } else {
              setLogs([]);
          }
      } catch (err) {
          console.error(err);
          setLogs([]);
      } finally {
          setLoading(false);
      }
  }, []);

  useEffect(() => {
      if (state.user?.role === 'administrador') {
          fetchLogs();
      }
      setLocalEgressBytes(parseFloat(localStorage.getItem('crm_local_egress') || 0));

      const interval = setInterval(() => {
          setLiveTraffic([...(window.sqlTrafficLogs || [])]);
      }, 1000);
      return () => clearInterval(interval);
  }, [state.user, fetchLogs]);

  const handleResetEgress = () => {
      if (!window.confirm("¿Deseas poner a cero el medidor de consumo de esta computadora?")) return;
      localStorage.setItem('crm_local_egress', '0');
      setLocalEgressBytes(0);
  };

  if (state.user?.role !== 'administrador') {
      return <div className="p-10 text-center font-bold text-slate-400">Acceso denegado. Solo Super Administrador.</div>;
  }

  const formattedUsage = formatBytes(localEgressBytes);

  return (
    <div className="fade-in h-full flex flex-col gap-6 max-w-[1200px] mx-auto w-full pb-8">
       {/* CABECERA */}
       <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 md:p-8 rounded-[2rem] shadow-lg text-white flex flex-col md:flex-row justify-between items-center flex-shrink-0 relative overflow-hidden">
           <div className="absolute -right-4 -bottom-10 opacity-10 pointer-events-none"><span className="material-icons" style={{fontSize: '150px'}}>monitor_heart</span></div>
           <div className="relative z-10">
             <h2 className="text-2xl md:text-3xl font-black flex items-center gap-2"><span className="material-icons text-indigo-400">monitor_heart</span> Telemetría y Logs</h2>
             <p className="text-slate-300 mt-1 font-medium text-sm">Monitorea los automatismos y el consumo de tu plan de datos.</p>
           </div>
           <button onClick={fetchLogs} disabled={loading} className="relative z-10 mt-4 md:mt-0 px-6 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-50 border border-white/30 rounded-xl font-black transition flex items-center gap-2 backdrop-blur-md">
              {loading ? <span className="material-icons text-[18px] animate-spin">sync</span> : <span className="material-icons text-[18px]">refresh</span>}
              Refrescar Logs
           </button>
       </div>
       
       {/* MEDIDOR */}
       <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><span className="material-icons" style={{fontSize:'32px'}}>network_check</span></div>
              <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Medidor de Tráfico Local (Esta PC)</p>
                 <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tight">{formattedUsage}</h3>
              </div>
           </div>
           <button onClick={handleResetEgress} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition text-xs shadow-sm flex items-center gap-2">
              <span className="material-icons text-[16px]">restart_alt</span> Poner a Cero
           </button>
       </div>

       {/* LOG VIEWER */}
       <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
           <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-indigo-500">router</span> Tráfico API en Vivo</h4>
           </div>
           <div className="overflow-y-auto h-64 p-2 bg-slate-900 border-b 4 border-slate-700 font-mono text-[9px] sm:text-[11px] text-emerald-400">
               {liveTraffic.length === 0 ? (
                   <div className="p-10 text-center text-slate-500">Esperando tráfico... navega por la app para ver las consultas.</div>
               ) : (
                   liveTraffic.map((t, idx) => {
                       const lColor = t.latency > 1500 ? 'text-red-400' : (t.latency > 500 ? 'text-amber-400' : 'text-emerald-400');
                       const sColor = t.success ? 'text-emerald-500' : 'text-red-500 font-black bg-red-900/30 px-1';
                       
                       return (
                           <div key={idx} className="flex flex-col sm:flex-row sm:items-start border-b border-slate-800/50 hover:bg-slate-800 p-1.5 transition whitespace-pre-wrap">
                               <div className="flex gap-3 min-w-[220px] shrink-0">
                                   <span className="text-slate-500">[{new Date(t.timestamp).toLocaleTimeString()}]</span>
                                   <span className={sColor}>{t.success ? '200 OK' : 'ERR/500'}</span>
                                   <span className={lColor}>{t.latency}ms</span>
                                   <span className="text-blue-300 ml-auto">{formatBytes(t.bytes)}</span>
                               </div>
                               <div className="text-slate-300 flex-1 ml-0 sm:ml-4 mt-1 sm:mt-0 break-all">
                                   {t.query}
                                   {!t.success && <div className="text-red-400 mt-1 block">Razón: {t.errorMsg}</div>}
                               </div>
                           </div>
                       );
                   })
               )}
           </div>

           <div className="p-5 border-y border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-indigo-500">receipt_long</span> Historial de Eventos del Servidor (Bitácora 300)</h4>
           </div>
           <div className="overflow-y-auto flex-1 p-2">
              {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400"><span className="material-icons animate-spin text-5xl mb-4 text-indigo-500">sync</span><p className="font-bold">Interrogando bitácora del servidor...</p></div>
              ) : logs.length === 0 ? (
                  <div className="p-10 text-center font-bold text-slate-400">La bitácora está vacía. No hay eventos registrados aún.</div>
              ) : (
                  logs.map((log, idx) => {
                      let icon = 'info';
                      let colorClass = 'text-blue-600 bg-blue-50 border-blue-200';

                      if (log.estado === 'EXITO') { icon = 'check_circle'; colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200'; }
                      if (log.estado === 'ERROR') { icon = 'cancel'; colorClass = 'text-red-700 bg-red-50 border-red-200 shadow-sm'; }
                      if (log.estado === 'ALERTA') { icon = 'warning'; colorClass = 'text-amber-700 bg-amber-50 border-amber-200'; }

                      const dateStr = new Date(Number(log.timestamp)).toLocaleString();

                      return (
                         <div key={idx} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass.split(' ')[1]} ${colorClass.split(' ')[0]}`}><span className="material-icons text-[20px]">{icon}</span></div>
                            <div className="flex-1">
                               <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-md ${colorClass}`}>{log.modulo}</span>
                                  <span className="text-[10px] font-bold text-slate-400 font-mono flex items-center gap-1"><span className="material-icons text-[12px]">schedule</span> {dateStr}</span>
                               </div>
                               <p className="text-sm font-bold text-slate-700 leading-tight">{log.mensaje}</p>
                            </div>
                         </div>
                      );
                  })
              )}
           </div>
       </div>
    </div>
  );
}