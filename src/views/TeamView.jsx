import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

function getRealOrderTime(o) {
    let ms = o.timestamp || 0;
    if (o.fecha && typeof o.fecha === 'string' && o.fecha.includes('-')) {
        const validIso = o.fecha.replace(' ', 'T');
        const parsed = new Date(validIso).getTime();
        if (!isNaN(parsed)) ms = parsed;
    }
    return ms;
}

function getMonthRange(monthStr) {
    const parts = monthStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 0, 23, 59, 59).getTime();
    return { start, end };
}

export default function TeamView() {
  const { state, showToast } = useAppContext();
  
  const currentMonthName = new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase();
  const startOfMonth = useMemo(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }, []);

  const serviceList = state.datosConfig?.length > 0 ? state.datosConfig.filter(c => c.servicio !== 'APPSCRIPT_BRIDGE').map(c => c.servicio) : [];
  const [currentService, setCurrentService] = useState('');
  
  useEffect(() => {
      if (serviceList.length > 0 && !currentService) {
          setCurrentService(serviceList[0]);
      }
  }, [serviceList, currentService]);

  const [monthSave, setMonthSave] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [confirmSaveModal, setConfirmSaveModal] = useState({ isOpen: false, data: null });
  const fetchedRef = useRef(false);

  useEffect(() => {
      if (!fetchedRef.current) {
          execSQL('SELECT * FROM ranking_historial').then(res => {
              if (Array.isArray(res) && !res.error) setHistoryData(res);
          }).catch(() => {});
          fetchedRef.current = true;
      }
  }, []);

  const handleSaveMonthlyRanking = async () => {
      if (!monthSave) return showToast("Por favor selecciona un mes de la casilla.", 3000, 'error');
      if (serviceList.length === 0) return showToast("No hay servicios configurados para evaluar.", 3000, 'error');

      const existing = historyData.filter(r => r.mes === monthSave);
      if (existing.length > 0) {
          setConfirmSaveModal({ isOpen: true, data: null });
          return;
      }
      calculateAndSaveRanking();
  };

  const calculateAndSaveRanking = async () => {
      setConfirmSaveModal({ isOpen: false, data: null });
      setIsSaving(true);
      showToast('Calculando métricas del mes...');
      const range = getMonthRange(monthSave);
      const payload = [];

      const sellers = state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado');

      for (const service of serviceList) {
          const stats = {};
          sellers.forEach(s => { stats[s.id] = { id: s.id, name: s.name.split(' ')[0], clientsSet: new Set(), volume: 0 }; });

          let globalTotalVol = 0;

          const toSqlDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const res = await execSQL(`SELECT srv.cantidad, m.cliente_id as c_id FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id WHERE srv.servicio='${service}' AND m.fecha_ingreso >= '${toSqlDate(new Date(range.start))} 00:00:00' AND m.fecha_ingreso <= '${toSqlDate(new Date(range.end))} 23:59:59'`);
          
          const arr = Array.isArray(res) ? res : [];
          arr.forEach(o => {
              const qty = parseFloat(String(o.cantidad).replace(',', '.')) || 0;
              if (qty > 0) {
                  globalTotalVol += qty;
                  const cId = String(o.c_id).toLowerCase().trim();
                  
                  let sellerId = null;
                  const matrixClient = state.clients?.find(c => String(c.id).toLowerCase().trim() === cId);
                  if (matrixClient && matrixClient.cedulaVendedor && matrixClient.cedulaVendedor !== 'null') {
                      const sellerUser = state.users?.find(u => String(u.cedula) === String(matrixClient.cedulaVendedor));
                      if (sellerUser) sellerId = sellerUser.id;
                  }

                  if (sellerId && stats[sellerId]) {
                      stats[sellerId].volume += qty;
                      stats[sellerId].clientsSet.add(cId);
                  }
              }
          });

          Object.values(stats).forEach(s => {
              const score = globalTotalVol > 0 ? (s.volume / globalTotalVol) * 100 : 0;
              payload.push({
                  id: `${monthSave}_${service}_${s.id}`,
                  mes: monthSave,
                  servicio: service,
                  vendedor_id: s.id,
                  vendedor_nombre: s.name,
                  puntaje: parseFloat(score.toFixed(1)),
                  volumen: s.volume,
                  clientes: s.clientsSet.size
              });
          });
      }

      showToast('Guardando registro global...');
      await execSQL('DELETE FROM ranking_historial WHERE mes = ?', [monthSave]);

      let hasError = false;
      for (const p of payload) {
           const res = await execSQL('INSERT INTO ranking_historial (id, mes, servicio, vendedor_id, vendedor_nombre, puntaje, volumen, clientes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
              [p.id, p.mes, p.servicio, p.vendedor_id, p.vendedor_nombre, p.puntaje, p.volumen, p.clientes]
           );
           if (res?.error) hasError = true;
      }
      
      if (hasError) {
          showToast("Error durante la grabación de algunos registros.", 3000, 'error');
      } else {
          showToast('Registro de todos los sectores guardado exitosamente.');
      }
      
      const freshData = await execSQL('SELECT * FROM ranking_historial');
      if (Array.isArray(freshData) && !freshData.error) setHistoryData(freshData);
      setIsSaving(false);
  };

  const lastUpdateOfSelectedMonth = useMemo(() => {
      if (!monthSave) return null;
      const records = historyData.filter(r => r.mes === monthSave && r.fecha_actualizacion);
      if (records.length === 0) return null;
      const mostRecentStr = records.map(r => r.fecha_actualizacion).sort().reverse()[0];
      try {
          // El SQL Server ya retorna la hora de Uruguay, pero el driver de node o JSON le añade la 'Z' (Zulu/UTC).
          // Para que el navegador no le reste 3 horas erróneamente, simplemente le quitamos la 'Z' si la tiene.
          let validDateStr = mostRecentStr;
          if (validDateStr.endsWith('Z')) {
               validDateStr = validDateStr.replace('Z', '');
          }
          const date = new Date(validDateStr);
          if (isNaN(date.getTime())) return "INVALID DATE";
          return date.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch(e) { return "ERROR DATE"; }
  }, [historyData, monthSave]);

  const chartData = useMemo(() => {
      const service = currentService;
      const dataForService = historyData.filter(r => r.servicio === service);

      const uniqueMonths = [...new Set(dataForService.map(r => r.mes))].sort();
      const uniqueSellers = [...new Set(dataForService.map(r => r.vendedor_nombre))];

      const datasets = uniqueSellers.map((sellerName, idx) => {
          const data = uniqueMonths.map(m => {
              const record = dataForService.find(r => r.mes === m && r.vendedor_nombre === sellerName);
              return record ? record.volumen : 0;
          });
          const color = COLORS[idx % COLORS.length];
          return {
              label: sellerName,
              data: data,
              borderColor: color,
              backgroundColor: color,
              tension: 0,
              pointRadius: 4,
              fill: false,
              borderWidth: 2
          };
      });
      return { labels: uniqueMonths, datasets };
  }, [historyData, currentService]);

  const [rankingStats, setRankingStats] = useState({ globalTotalVol: 0, unassignedVol: 0, sortedSellers: [] });

  useEffect(() => {
      let mounted = true;
      if (!currentService) return;

      const toSqlDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      execSQL(`SELECT srv.cantidad, m.cliente_id as c_id FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id WHERE srv.servicio='${currentService}' AND m.fecha_ingreso >= '${toSqlDate(new Date(startOfMonth))} 00:00:00'`).then(res => {
          if (!mounted || !Array.isArray(res)) return;

          const sellers = state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado');
          const stats = {};
          sellers.forEach(s => {
              stats[s.id] = { id: s.id, name: s.name, role: s.role, clientsSet: new Set(), volume: 0, score: 0 };
          });

          let globalTotalVol = 0;
          let unassignedVol = 0;

          res.forEach(o => {
              const qty = parseFloat(String(o.cantidad).replace(',', '.')) || 0;
              if (qty > 0) {
                  globalTotalVol += qty;
                  const cId = String(o.c_id).toLowerCase().trim();
                  
                  let sellerId = null;
                  const matrixClient = state.clients?.find(c => String(c.id).toLowerCase().trim() === cId);
                  if (matrixClient && matrixClient.cedulaVendedor && matrixClient.cedulaVendedor !== 'null') {
                      const sellerUser = state.users?.find(u => String(u.cedula) === String(matrixClient.cedulaVendedor));
                      if (sellerUser) sellerId = sellerUser.id;
                  }

                  if (sellerId && stats[sellerId]) {
                      stats[sellerId].volume += qty;
                      stats[sellerId].clientsSet.add(cId);
                  } else {
                      unassignedVol += qty;
                  }
              }
          });

          Object.values(stats).forEach(s => {
              s.score = globalTotalVol > 0 ? (s.volume / globalTotalVol) * 100 : 0;
          });

          setRankingStats({
              globalTotalVol,
              unassignedVol,
              sortedSellers: Object.values(stats).sort((a, b) => b.score - a.score)
          });
      }).catch(()=>{});

      return () => mounted = false;
  }, [currentService, startOfMonth, state.users]);

  const { globalTotalVol, unassignedVol, sortedSellers } = rankingStats;

  const top3 = sortedSellers.slice(0, 3);
  const podiumColors = [
      { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: 'emoji_events' },
      { bg: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-300', icon: 'workspace_premium' },
      { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', icon: 'military_tech' }
  ];

  return (
    <div className="fade-in h-full flex flex-col gap-6 max-w-[1600px] mx-auto w-full pb-8">
      
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-center justify-between flex-shrink-0">
         <div className="flex-1">
           <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><span className="material-icons text-amber-500">leaderboard</span> Ranking de Equipo ({currentMonthName})</h3>
           <p className="text-sm text-slate-500 mt-1">El podio destaca la participación porcentual de los comerciales sobre el volumen total de producción del mes en curso.</p>
         </div>
         <div className="flex gap-4 w-full md:w-auto">
             <div className="flex-1 md:flex-none bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex flex-col justify-center items-center shadow-sm min-w-[140px]">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1 text-center">Total Producido</p>
                <p className="text-3xl font-black text-indigo-700 font-mono tracking-tighter">{globalTotalVol.toLocaleString()}</p>
             </div>
             <div className="flex-1 md:flex-none bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-center items-center shadow-sm min-w-[140px]">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 text-center">Venta Sin Asignar</p>
                <p className="text-3xl font-black text-slate-700 font-mono tracking-tighter">{unassignedVol.toLocaleString()}</p>
             </div>
         </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
         {top3.length === 0 ? <div className="w-full text-center p-10 text-slate-400 font-bold bg-white rounded-3xl border border-slate-200">No hay suficientes vendedores para mostrar el podio.</div> : top3.map((s, index) => {
             const colors = podiumColors[index];
             if (!colors) return null;
             return (
                 <div key={s.id} className={`flex-1 bg-white rounded-3xl p-6 shadow-sm border-2 ${colors.border} flex flex-col items-center text-center transform hover:-translate-y-2 transition duration-300 relative overflow-hidden group`}>
                    <div className="absolute -right-4 -top-4 opacity-10 transform group-hover:scale-110 transition duration-300"><span className="material-icons" style={{fontSize: '100px'}}>{colors.icon}</span></div>
                    <div className={`w-16 h-16 ${colors.bg} ${colors.text} rounded-full flex items-center justify-center mb-4 z-10 shadow-inner`}>
                       <span className="material-icons text-3xl">{colors.icon}</span>
                    </div>
                    <h4 className="font-black text-lg text-slate-800 z-10">{s.name}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 z-10">{s.role}</p>
                    <div className={`${colors.bg} ${colors.text} px-4 py-3 rounded-xl w-full z-10 flex flex-col gap-1 shadow-sm`}>
                       <p className="text-[10px] uppercase font-black opacity-80">Porción de Torta</p>
                       <p className="text-3xl font-black">{s.score.toFixed(1)} <span className="text-sm font-bold opacity-60">%</span></p>
                       <p className="text-[9px] font-bold mt-1 opacity-70 border-t border-black/10 pt-1">Volumen aportado: {(s.volume || 0).toLocaleString()}</p>
                    </div>
                 </div>
             );
         })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
         <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col gap-4">
               <div className="flex items-center justify-between flex-wrap gap-4">
                   <div className="flex items-center gap-2">
                      <span className="material-icons text-indigo-500 text-[20px]">format_list_numbered</span>
                      <h4 className="font-black text-sm text-slate-700 uppercase tracking-wider">Tabla de Posiciones: {currentService}</h4>
                   </div>
               </div>
               <div className="flex bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200 overflow-x-auto w-full sm:w-auto">
                  {serviceList.map(s => (
                      <button key={s} onClick={() => setCurrentService(s)} className={`flex-1 md:flex-none px-4 py-2 text-xs font-black rounded-lg transition-all whitespace-nowrap ${currentService === s ? 'bg-white shadow-md text-indigo-700 scale-105' : 'text-slate-500 hover:text-slate-700'}`}>{s}</button>
                  ))}
               </div>
            </div>
            <div className="overflow-x-auto flex-1">
               <table className="w-full text-left border-collapse">
                  <thead className="bg-white sticky top-0 shadow-sm z-10 border-b border-slate-200">
                     <tr>
                        <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center w-16">Pos.</th>
                        <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Comercial</th>
                        <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Cuota (% Total)</th>
                        <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Clientes</th>
                        <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-right">Volumen Producción</th>
                     </tr>
                  </thead>
                  <tbody>
                     {sortedSellers.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-bold">No hay datos registrados.</td></tr> : sortedSellers.map((s, index) => (
                         <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            <td className="px-4 py-4 text-center font-black text-slate-400">#{index + 1}</td>
                            <td className="px-4 py-4">
                               <p className="font-black text-sm text-slate-800">{s.name}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.role}</p>
                            </td>
                            <td className="px-4 py-4 text-center"><span className="bg-indigo-50 text-indigo-700 font-black px-3 py-1.5 rounded-lg text-xs shadow-sm">{s.score.toFixed(1)}%</span></td>
                            <td className="px-4 py-4 text-center"><span className="text-slate-600 font-bold">{s.clientsSet.size}</span></td>
                            <td className="px-4 py-4 text-right font-black text-emerald-600 text-sm">{(s.volume || 0).toLocaleString()}</td>
                         </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         <div className="flex flex-col gap-6 h-[600px]">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
               <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-purple-500 text-[18px]">save</span> Guardar Registro</h4>
               <p className="text-[10px] text-slate-500 mb-4 font-medium">Guarda la foto de este mes (para <b>todos</b> los sectores) y constrúyete un historial a lo largo del tiempo.</p>
               <div className="flex flex-col gap-3">
                  <input type="month" value={monthSave} onChange={e=>setMonthSave(e.target.value)} className="p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-700 outline-none w-full shadow-sm cursor-pointer" />
                  {lastUpdateOfSelectedMonth && (
                      <div className="bg-emerald-50 text-emerald-700 p-2 rounded-xl border border-emerald-100 flex items-center gap-2 mt-1">
                          <span className="material-icons text-[14px]">history</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider">Actualizado: {lastUpdateOfSelectedMonth}</span>
                      </div>
                  )}
                  <button disabled={isSaving} onClick={handleSaveMonthlyRanking} className={`w-full text-white text-xs font-black py-2.5 rounded-xl shadow-md transition flex justify-center items-center gap-2 ${isSaving ? 'bg-slate-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}>
                     {isSaving ? (
                         <>
                             <span className="material-icons text-[16px] animate-spin">refresh</span> Cargando...
                         </>
                     ) : (
                         <>
                             <span className="material-icons text-[16px]">cloud_upload</span> Archivar Mes Global
                         </>
                     )}
                  </button>
               </div>
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0">
               <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-blue-500 text-[18px]">show_chart</span> Evolución Histórica</h4>
               <div className="relative flex-1 w-full h-full pb-4">
                   <Line
                       data={{
                           labels: chartData.labels,
                           datasets: chartData.datasets
                       }}
                       options={{
                           responsive: true,
                           maintainAspectRatio: false,
                           plugins: { legend: { position: 'top', labels: { font: { size: 9 }, boxWidth: 10 } }, tooltip: { mode: 'index', intersect: false } },
                           legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } }, // real
                           scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { font: { size: 9 } } }, x: { grid: { display: false }, ticks: { font: { size: 9 } } } }
                       }}
                   />
               </div>
            </div>
         </div>
      </div>
      
      {/* Modal de Confirmación de Guardado Histórico */}
      {confirmSaveModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setConfirmSaveModal({ isOpen: false, data: null })}></div>
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 relative z-10 fade-in border border-slate-100">
                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="material-icons" style={{fontSize: '28px'}}>cloud_upload</span>
                </div>
                <h3 className="text-xl font-black text-center text-slate-800 mb-2">Sobrescribir Histórico</h3>
                <p className="text-sm text-slate-500 text-center mb-6">
                    El mes <span className="font-bold text-slate-800">{monthSave}</span> ya tiene registros guardados. ¿Deseas sobrescribir los datos con la información actual calculada?
                </p>
                <div className="flex gap-3">
                    <button onClick={() => setConfirmSaveModal({ isOpen: false, data: null })} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition text-sm">
                        Cancelar
                    </button>
                    <button onClick={calculateAndSaveRanking} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm">
                        Sobrescribir
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}