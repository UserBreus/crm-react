import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { execSQL, asignarVendedorExterno } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#84cc16'];

function formatDateReal(tsOrStr) {
    if (!tsOrStr || tsOrStr === '-') return '-';
    try {
        let d;
        if (!isNaN(Number(tsOrStr)) && typeof tsOrStr !== 'string') d = new Date(Number(tsOrStr));
        else if (!isNaN(Number(tsOrStr))) d = new Date(Number(tsOrStr));
        else d = new Date(tsOrStr.toString().replace('Z', '').replace(' ', 'T'));
        if (isNaN(d.getTime())) return tsOrStr;
        const pad = n => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch(e) { return tsOrStr; }
}

function getContrastYIQ(hexcolor) {
    if (!hexcolor) return 'black';
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#1e293b' : 'white';
}

export default function ClientesView() {
  const { state, updateState, showToast } = useAppContext();
  
  const isReadOnly = state.user?.role === 'encargado' && state.managerView !== 'SELF' && state.managerView !== 'ALL';

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const serviceList = useMemo(() => state.datosConfig?.map(c => c.servicio) || [], [state.datosConfig]);
  const [activeRankSrv, setActiveRankSrv] = useState(serviceList[0] || '');

  const [modalClient, setModalClient] = useState(null);
  const [modalService, setModalService] = useState('TOTAL');
  const [transferTarget, setTransferTarget] = useState('');

  const [uClients, setUClients] = useState([]);
  const [rankingData, setRankingData] = useState({ labels: [], data: [], total: 0 });
  const [clientStatsCache, setClientStatsCache] = useState({});
  const [modalClientOrders, setModalClientOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load clients
  useEffect(() => {
    let mounted = true;
    const fetchClients = () => {
      setLoading(true);
      
      const externals = state.clients || [];

      if (mounted) {
        // 2. FILTRAR SEGÚN ROL Y VISTA ACTUAL (ManagerView)
        // Necesitamos saber qué cédula estamos observando.
        let targetCedula = null;
        if (state.user?.role !== 'administrador' && state.user?.role !== 'encargado') {
            targetCedula = state.user?.cedula;
        } else if (state.managerView !== 'ALL') {
            // Busca la cedula del usuario que el manager está mirando
            const viewId = state.managerView === 'SELF' ? state.user?.id : state.managerView;
            const targetUser = state.users.find(u => u.id === viewId);
            targetCedula = targetUser?.cedula;
        }

        let filtered = externals;
        if (targetCedula) {
            // cedulaVendedor viene como string de char
            filtered = externals.filter(c => c.cedulaVendedor === String(targetCedula));
        }

        setUClients(filtered);
        setLoading(false);
      }
    };
    if (state.user && state.users.length > 0) fetchClients();
    return () => mounted = false;
  }, [state.user, state.users, state.clients, state.managerView, state.reloadTrigger]);



  const validClientIds = useMemo(() => uClients.map(c => String(c.id).trim().toLowerCase()), [uClients]);

  const searchedClients = useMemo(() => {
    const term = (state.searchTerm || '').toLowerCase();
    return uClients.filter(c => 
      String(c.id).toLowerCase().includes(term) || String(c.name).toLowerCase().includes(term)
    );
  }, [uClients, state.searchTerm]);

  const totalPages = Math.ceil(searchedClients.length / itemsPerPage) || 1;
  const [paginatedClients, setPaginatedClients] = useState([]);

  useEffect(() => {
      const pagArr = searchedClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
      setPaginatedClients(pagArr);
      
      // Fetch stats for this page
      if (pagArr.length === 0) return;
      const ids = pagArr.map(c => typeof c.id === 'string' ? `'${c.id.replace(/'/g, "''")}'` : c.id).join(',');
      
      execSQL(`SELECT m.cliente_id, srv.servicio, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as vol, COUNT(srv.servicio) as ord FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id = m.orden_id WHERE m.cliente_id IN (${ids}) GROUP BY m.cliente_id, srv.servicio`).then(res => {
          if (!Array.isArray(res)) return;
          setClientStatsCache(prev => {
              const next = { ...prev };
              res.forEach(r => {
                  if (!next[r.cliente_id]) next[r.cliente_id] = {};
                  next[r.cliente_id][r.servicio] = { vol: parseFloat(r.vol) || 0, ord: parseInt(r.ord) || 0 };
              });
              return next;
          });
      }).catch(()=>{});
  }, [searchedClients, currentPage]);

  useEffect(() => {
     if (!activeRankSrv) return;
     let mounted = true;
     let targetCedula = null;
     if (state.user?.role !== 'administrador' && state.user?.role !== 'encargado') {
         targetCedula = state.user?.cedula;
     } else if (state.managerView !== 'ALL') {
         const viewId = state.managerView === 'SELF' ? state.user?.id : state.managerView;
         targetCedula = state.users.find(u => u.id === viewId)?.cedula;
     }

     let validTargetIds = null;
     if (targetCedula) {
         const misClientes = (state.clients || []).filter(c => c.cedulaVendedor === String(targetCedula));
         validTargetIds = misClientes.length > 0 ? misClientes.map(c => `'${String(c.id).replace(/'/g, "''")}'`).join(',') : "''";
     }

     const filterStr = validTargetIds ? `AND m.cliente_id IN (${validTargetIds})` : ``;

     execSQL(`SELECT TOP 10 m.cliente_id, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as vol FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id WHERE srv.servicio='${activeRankSrv}' ${filterStr} GROUP BY m.cliente_id ORDER BY vol DESC`).then(res => {
         if (mounted && Array.isArray(res)) {
             setRankingData({
                 labels: res.map(r => String(r.cliente_id)),
                 data: res.map(r => parseFloat(r.vol) || 0),
                 total: res.reduce((acc, curr) => acc + (parseFloat(curr.vol) || 0), 0)
             });
         }
     }).catch(()=>{});
     return () => mounted = false;
  }, [activeRankSrv, state.managerView, state.user]);

  const getClientStats = (client) => {
    const stats = {};
    serviceList.forEach(s => stats[s] = { ord: 0, vol: 0 });
    const cached = clientStatsCache[client.id] || {};
    Object.keys(cached).forEach(s => {
        if (stats[s]) stats[s] = cached[s];
    });
    return stats;
  };
  // -- Modal Logic --
  const openModal = (client) => {
    setModalClient(client);
    setModalService('TOTAL');
    setTransferTarget('');
  };

  const executeTransfer = async (targetId) => {
    const finalTargetUserId = targetId || transferTarget;
    if (!finalTargetUserId || !modalClient) return;

    // Tenemos el ID de usuario interno ("Matias"). Hay que traducirlo a Cédula ("5009...")
    const targetUser = state.users.find(u => u.id === finalTargetUserId);
    if (!targetUser || !targetUser.cedula) {
        alert("Ese vendedor no tiene cédula configurada en el sistema para asignaciones externas.");
        return;
    }
    
    showToast('Transfiriendo en base remota...', 3000);
    
    // Llamada PATCH hacia la API Externa preferentemente por el entero interno
    const targetExternalId = modalClient.internalId || modalClient.id; 
    const res = await asignarVendedorExterno(targetExternalId, targetUser.cedula);
    
    if (res?.error) {
      alert("Error telefónico con API Matriz: " + res.error);
      return;
    }
    
    showToast('Transferencia/Asignación completada.', 4000);
    setModalClient(null);
    updateState({ reloadTrigger: Date.now() }); // Reload entire view
  };

  useEffect(() => {
     if (!modalClient) return;
     let mounted = true;
     execSQL(`SELECT m.orden_id as orden, srv.servicio, srv.cantidad, srv.producto, srv.modo, srv.estado, srv.trabajo, m.fecha_ingreso as fecha FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id WHERE m.cliente_id='${modalClient.id}' ORDER BY m.fecha_ingreso DESC`).then(res => {
         if (mounted && Array.isArray(res)) setModalClientOrders(res);
     }).catch(()=>{});
     return () => mounted = false;
  }, [modalClient]);

  // Modal Computed Data
  const modalData = useMemo(() => {
    if (!modalClient) return null;
    
    const filteredOrders = modalService === 'TOTAL' 
      ? modalClientOrders 
      : modalClientOrders.filter(o => o.servicio === modalService);

    // Trend (6 months)
    const months = []; const dataQty = []; const date = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(date.getFullYear(), date.getMonth() - i, 1); 
        months.push(d.toLocaleString('es-x-u-ca-iso8601', { month: 'short' }).toUpperCase());
        const start = d.getTime(); 
        const end = new Date(date.getFullYear(), date.getMonth() - i + 1, 0, 23, 59, 59).getTime();
        
        const sum = filteredOrders.filter(o => {
            let t = 0;
            if (o.fecha && typeof o.fecha === 'string') {
                const parsed = new Date(o.fecha.replace('Z', '').replace(' ', 'T')).getTime();
                if (!isNaN(parsed)) t = parsed;
            }
            return t >= start && t <= end;
        }).reduce((a, o) => a + (parseFloat(String(o.cantidad).replace(',', '.')) || 0), 0);
        dataQty.push(sum);
    }

    // Top 5 Products
    let prodAgg = {}; 
    filteredOrders.forEach(o => {
      const val = o.producto ? String(o.producto).trim() : 'Sin Datos';
      const finalVal = val === '' ? 'Sin Datos' : val;
      if (!prodAgg[finalVal]) prodAgg[finalVal] = 0;
      prodAgg[finalVal] += (parseFloat(String(o.cantidad).replace(',', '.')) || 0);
    });
    const pArr = Object.keys(prodAgg).map(k => ({ label: k, vol: prodAgg[k] })).sort((a, b) => b.vol - a.vol);
    const topP = pArr.slice(0, 4);
    const othersP = pArr.slice(4).reduce((acc, curr) => acc + curr.vol, 0);
    if (othersP > 0) topP.push({ label: 'Otros', vol: othersP });

    return { filteredOrders, trend: { labels: months, data: dataQty }, products: topP };
  }, [modalClient, modalClientOrders, modalService]);


  return (
    <div className="fade-in h-full flex flex-col gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0 gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
            Analítica de Cartera 
            {isReadOnly && <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-xl text-[10px] font-bold border border-slate-200 flex items-center gap-1 shadow-inner ml-2"><span className="material-icons text-[14px]">visibility</span> MODO AUDITORÍA</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-1">Órdenes consolidadas desde múltiples servicios.</p>
        </div>
        <button onClick={() => window.location.reload()} className="px-5 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center gap-2 transition w-full sm:w-auto justify-center">
          <span className="material-icons" style={{fontSize:'20px'}}>bolt</span> Actualizar Vista Local
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start min-h-0 relative">
        {/* TOP 10 CLIENTES CHART */}
        <div className="lg:col-span-5 bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full lg:h-auto sticky top-4">
          <div className="flex flex-col mb-4 gap-1">
            <h4 className="font-bold text-sm flex items-center gap-2 text-indigo-700 uppercase tracking-wide"><span className="material-icons" style={{fontSize:'18px'}}>emoji_events</span> Top 10 Clientes (Por ID)</h4>
            <div className="flex gap-2 overflow-x-auto pb-2 mt-2 scroll-smooth">
              {serviceList.length === 0 ? <span className="text-xs text-slate-400">Sin servicios conf.</span> : serviceList.map(s => (
                <button key={s} onClick={() => setActiveRankSrv(s)} className={`px-4 py-2 border rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeRankSrv === s ? 'bg-indigo-100 text-indigo-700 shadow-sm border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full h-56">
            {rankingData.labels.length > 0 ? (
              <Bar 
                data={{ labels: rankingData.labels, datasets: [{ data: rankingData.data, backgroundColor: '#6366f1', borderRadius: 4 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5,5] } }, x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } } } }}
              />
            ) : (
                <div className="absolute inset-0 flex justify-center items-center font-bold text-slate-300">Sin datos</div>
            )}
          </div>
          <div className="mt-5 bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volumen Total Global:</span>
            <span className="text-lg font-black text-slate-800">{rankingData.total.toLocaleString('es-UY', {minimumFractionDigits: 2, maximumFractionDigits: 2})} Und.</span>
          </div>
        </div>

        {/* DIRECTORIO DE CLIENTES */}
        <div className="lg:col-span-7 h-[calc(100vh-200px)] lg:h-auto min-h-[500px]">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
               <h4 className="font-bold text-slate-700 flex items-center gap-2"><span className="material-icons text-indigo-500">folder_shared</span> Directorio</h4>
            </div>
            <div className="overflow-y-auto relative flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">ID Cliente</th>
                    <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Órdenes</th>
                    <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-right">Volumen</th>
                    <th className="px-4 py-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider text-center">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">Buscando base de datos...</td></tr>
                  ) : paginatedClients.length === 0 ? (
                    <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No se encontraron clientes.</td></tr>
                  ) : (
                    paginatedClients.map(c => {
                      const stats = getClientStats(c);
                      const initialSrv = activeRankSrv || serviceList[0] || '---';
                      return (
                        <tr key={c.id} onClick={() => openModal(c)} className="border-b border-slate-100 hover:bg-indigo-50 cursor-pointer transition group">
                          <td className="px-4 py-3">
                             <p className="font-black text-sm font-mono text-indigo-600 group-hover:text-indigo-800 tracking-wider truncate max-w-[180px]">{c.id}</p>
                             <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider truncate max-w-[180px]">{c.name || 'Sin Nombre'}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block bg-slate-100 text-slate-600 font-bold text-[11px] px-2 py-1 rounded-md transition-all">
                              {stats[initialSrv]?.ord || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-black text-indigo-600 text-sm inline-block transition-all">
                              {(stats[initialSrv]?.vol || 0).toLocaleString('es-UY', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span> <span className="text-[9px] text-slate-400">UND</span>
                          </td>
                          <td className="px-4 py-3 text-center"><span className="material-icons text-slate-300 group-hover:text-indigo-500 transition" style={{fontSize: '18px'}}>chevron_right</span></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            {/* PAGINADOR */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
               <p className="text-xs font-bold text-slate-500">
                  Mostrando <span className="text-slate-800">{paginatedClients.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> al <span className="text-slate-800">{Math.min(currentPage * itemsPerPage, searchedClients.length)}</span> de <span className="text-indigo-600">{searchedClients.length}</span> Clientes
               </p>
               <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                     <span className="material-icons">chevron_left</span>
                  </button>
                  <div className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-700 shadow-sm">
                     Pág. {currentPage} de {totalPages}
                  </div>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
                     <span className="material-icons">chevron_right</span>
                  </button>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DETALLE CLIENTE */}
      {modalClient && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4 md:p-6" onClick={() => setModalClient(null)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
             <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
                <div>
                   <h3 className="text-3xl font-black font-mono tracking-wider text-indigo-600">{modalClient.id}</h3>
                   <p className="text-xs text-slate-500 mt-1 uppercase font-bold flex items-center gap-1">{modalClient.name || 'Sin Nombre'}</p>
                   <p className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1"><span className="material-icons text-[12px]">account_circle</span> Cartera de: <b className="text-slate-600">{state.users.find(u => String(u.id) === String(modalClient.sellerId))?.name || 'Desconocido'}</b></p>
                   <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 max-w-full scroll-smooth">
                     {['TOTAL', ...serviceList].map(s => (
                       <button key={s} onClick={() => setModalService(s)} className={`px-3 py-1.5 border rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${modalService === s ? 'bg-indigo-100 text-indigo-700 shadow-sm border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                         {s}
                       </button>
                     ))}
                   </div>
                </div>
                <button onClick={() => setModalClient(null)} className="w-12 h-12 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center transition"><span className="material-icons">close</span></button>
             </div>
             
             <div className="p-6 overflow-y-auto flex-1 bg-slate-50 flex flex-col lg:flex-row gap-6">
                <div className="lg:w-1/3 flex flex-col gap-4 max-h-full overflow-y-auto pr-2" style={{scrollbarWidth: 'thin'}}>
                  <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0">
                    <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-emerald-500 text-[18px]">timeline</span> TENDENCIA GLOBAL</h4>
                    <div className="relative h-40 w-full">
                      <Line data={{ labels: modalData.trend.labels, datasets: [{ data: modalData.trend.data, borderColor: '#10b981', backgroundColor: '#d1fae5', fill: true, tension: 0.4 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} />
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0">
                    <h4 className="font-black text-[11px] text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-pink-500 text-[18px]">pie_chart</span> PRODUCTO: Top 5</h4>
                    <div className="relative h-40 w-full">
                      <Doughnut data={{ labels: modalData.products.map(p => p.label), datasets: [{ data: modalData.products.map(p => p.vol), backgroundColor: COLORS, borderWidth: 0 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 9 } } } }, cutout: '60%' }} />
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex-shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Contacto</p>
                    <p className="text-sm font-semibold text-slate-800 mb-4">{modalClient.phone || 'No registrado'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Órdenes Únicas Totales</p>
                    <p className="text-2xl font-black text-indigo-600">{modalData.filteredOrders.length}</p>
                  </div>
                  
                  {/* TRANSFER PANEL */}
                  {(state.user?.role === 'administrador' || state.user?.role === 'encargado' || state.user?.role === 'vendedor') && (() => {
                     const isFreeClient = !modalClient.sellerId || String(modalClient.sellerId).trim() === '' || String(modalClient.sellerId).toLowerCase() === 'null' || !state.users.some(u => String(u.id) === String(modalClient.sellerId));
                     const isManager = state.user?.role === 'administrador' || state.user?.role === 'encargado';
                     const canAccess = isManager || (state.user?.role === 'vendedor' && isFreeClient);
                     
                     return (
                        <div className="mt-6 p-5 bg-amber-50 rounded-2xl border border-amber-200 flex-shrink-0 relative overflow-hidden group">
                           {!canAccess && (
                               <div className="absolute inset-0 bg-slate-100/60 backdrop-blur-[1px] flex items-center justify-center z-10" title="No tienes permisos"><div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2"><span className="material-icons text-slate-400 text-sm">lock</span><span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Este cliente ya tiene dueño</span></div></div>
                           )}
                           
                           <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-1"><span className="material-icons text-[14px]">{isManager ? 'swap_horiz' : 'pan_tool'}</span> {isManager ? 'Herramienta: Reasignar Cliente' : 'Auto-Asignación'}</h4>
                           
                           {isManager ? (
                               <div className="flex flex-col sm:flex-row gap-3">
                                   <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)} className="flex-1 p-3 rounded-xl border border-amber-300 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 bg-white">
                                       <option value="">-- Seleccionar --</option>
                                       {state.users.filter(u => u.role === 'vendedor' || u.role === 'encargado').map(u => (
                                           <option key={u.id} value={u.id} disabled={String(u.id) === String(modalClient.sellerId)}>{u.id === modalClient.sellerId ? '(Actual) ' : ''}{u.name}</option>
                                       ))}
                                   </select>
                                   <button onClick={() => executeTransfer()} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-black shadow-md hover:bg-amber-700 transition w-full sm:w-auto flex items-center justify-center gap-2">Transferir</button>
                               </div>
                           ) : (
                               <button onClick={() => executeTransfer(state.user.id)} className="w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-black shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2">¡Asignarme este Cliente Libre!</button>
                           )}
                        </div>
                     );
                  })()}
                </div>

                {/* HISTORIAL UNIFICADO */}
                <div className="lg:w-2/3 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                   <div className="p-4 bg-slate-50 border-b border-slate-100 font-black text-[11px] text-slate-700 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-indigo-500 text-[18px]">account_tree</span> Historial Unificado de Servicios</div>
                   <div className="overflow-x-auto overflow-y-auto flex-1 relative min-h-[300px]">
                     <table className="w-full text-left border-collapse">
                        <thead className="bg-white sticky top-0 shadow-sm z-10 border-b border-slate-200">
                           <tr>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">N° Orden</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trabajo</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Producto</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status Global</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ruta de Servicios</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registro</th>
                           </tr>
                        </thead>
                        <tbody>
                          {modalData.filteredOrders.length === 0 ? (
                            <tr><td colSpan="6" className="p-10 text-center text-slate-400 font-medium">No hay órdenes para mostrar.</td></tr>
                          ) : (
                            modalData.filteredOrders.map((o, idx) => (
                              <tr key={`${o.orden}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                <td className="px-4 py-3 text-xs font-black text-slate-800 whitespace-nowrap">{o.orden || '-'}</td>
                                <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate" title={o.trabajo}>{o.trabajo || '-'}</td>
                                <td className="px-4 py-3 text-xs text-slate-600">{o.producto || '-'}</td>
                                <td className="px-4 py-3 text-[10px]">
                                    {(() => {
                                        const getContrastYIQ = (hexcolor) => {
                                            hexcolor = hexcolor.replace("#", "");
                                            const r = parseInt(hexcolor.substr(0, 2), 16);
                                            const g = parseInt(hexcolor.substr(2, 2), 16);
                                            const b = parseInt(hexcolor.substr(4, 2), 16);
                                            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                                            return (yiq >= 128) ? 'black' : 'white';
                                        };
                                        const estadoVal = (o.estado || '').trim().toLowerCase();
                                        const customHexColor = state.coloresEstados ? state.coloresEstados[estadoVal] : null;
                                        let customStyle = {};
                                        let estadoColorClass = 'text-indigo-700 bg-indigo-50 border-indigo-100';
                                        
                                        if (customHexColor && customHexColor.startsWith('#')) {
                                            customStyle = { backgroundColor: customHexColor, color: getContrastYIQ(customHexColor), borderColor: customHexColor };
                                            estadoColorClass = 'shadow-sm';
                                        }
                                        
                                        return <span className={`px-2 py-1 rounded-md font-bold uppercase whitespace-nowrap border ${estadoColorClass}`} style={customStyle}>{o.estado || 'REGISTRADO'}</span>;
                                    })()}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="font-black text-indigo-600 text-[10px] tracking-wider">{o.servicio}</span>
                                    <span className="text-[11px] font-bold text-slate-800 border-l border-slate-300 pl-1">{(parseFloat(String(o.cantidad).replace(',', '.'))||0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} und.</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-500 whitespace-nowrap">{o.fecha ? formatDateReal(o.fecha) : '-'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                     </table>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
