import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { execSQL } from '../api';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
  Title, Tooltip, Legend
);

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#84cc16'];

export default function DashboardView() {
  const { state } = useAppContext();

  const [metricClients, setMetricClients] = useState(0);
  const [metricSegs, setMetricSegs] = useState(0);
  const [srvOrderCounts, setSrvOrderCounts] = useState({});
  const [loadingVars, setLoadingVars] = useState(true);

  // New agg states
  const [aggMeses, setAggMeses] = useState([]);
  const [aggProductos, setAggProductos] = useState([]);
  const [aggModos, setAggModos] = useState([]);

  // States for Yearly Modal
  const [showYearlyModal, setShowYearlyModal] = useState(false);
  const [selectedYears, setSelectedYears] = useState([]);

  useEffect(() => {
     let mounted = true;
     const fetchData = async () => {
         let validTargetIds = null;
         let targetCedula = null;

         if (state.user?.role !== 'administrador' && state.user?.role !== 'encargado' && !state.user?.is_super_admin) {
             targetCedula = state.user?.cedula || 'SIN_CEDULA';
         } else if (state.managerView !== 'ALL') {
             const viewId = state.managerView === 'SELF' ? state.user?.id : state.managerView;
             targetCedula = state.users?.find(u => u.id === viewId)?.cedula || 'SIN_CEDULA';
         }

         if (targetCedula) {
             const misClientes = (state.clients || []).filter(c => c.cedulaVendedor === String(targetCedula));
             validTargetIds = misClientes.length > 0 ? misClientes.map(c => `'${String(c.id).replace(/'/g, "''")}'`).join(',') : "'---'";
         }

         const wOrders = validTargetIds ? `WHERE m.cliente_id IN (${validTargetIds})` : `WHERE 1=1`;
         const wSegs = validTargetIds ? `WHERE s.cliente_id IN (${validTargetIds}) AND s.estado='activo'` : `WHERE s.estado='activo'`;

         try {
             // Clientes se cuenta localmente desde memoria
             const myClientsCount = targetCedula 
                 ? (state.clients || []).filter(c => c.cedulaVendedor === String(targetCedula)).length
                 : (state.clients || []).length;
                 
             if (Object.keys(srvOrderCounts).length === 0) setLoadingVars(true);

             const [segsRes, srvRes, mthRes, prodRes, modoRes] = await Promise.all([
                 execSQL(`SELECT COUNT(s.id) as c FROM seguimientos s ${wSegs}`),
                 execSQL(`SELECT srv.servicio as s, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as c FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id ${wOrders} GROUP BY srv.servicio`),
                 execSQL(`SELECT srv.servicio as s, YEAR(m.fecha_ingreso) as y, MONTH(m.fecha_ingreso) as m, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as c FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id ${wOrders} AND m.fecha_ingreso >= DATEADD(month, -24, GETDATE()) GROUP BY srv.servicio, YEAR(m.fecha_ingreso), MONTH(m.fecha_ingreso)`),
                 execSQL(`SELECT srv.servicio as s, ISNULL(srv.producto, 'SIN PRODUCTO') as p, CONVERT(date, m.fecha_ingreso) as d, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as c FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id ${wOrders} AND m.fecha_ingreso >= DATEADD(day, -30, GETDATE()) GROUP BY srv.servicio, ISNULL(srv.producto, 'SIN PRODUCTO'), CONVERT(date, m.fecha_ingreso)`),
                 execSQL(`SELECT srv.servicio as s, ISNULL(srv.modo, 'SIN MODO') as mo, SUM(TRY_CAST(REPLACE(CAST(srv.cantidad AS VARCHAR(MAX)), ',', '.') as FLOAT)) as c FROM ordenes_servicios srv JOIN ordenes_maestras m ON srv.orden_id=m.orden_id ${wOrders} AND m.fecha_ingreso >= DATEADD(month, -6, GETDATE()) GROUP BY srv.servicio, ISNULL(srv.modo, 'SIN MODO')`)
             ]);

             if (mounted) {
                 setMetricClients(myClientsCount);
                 setMetricSegs(segsRes[0]?.c || 0);
                 
                 const counts = {};
                 (Array.isArray(srvRes) ? srvRes : []).forEach(o => {
                     if(o.s) counts[o.s] = o.c;
                 });
                 setSrvOrderCounts(counts);

                 setAggMeses(Array.isArray(mthRes) ? mthRes : []);
                 setAggProductos(Array.isArray(prodRes) ? prodRes : []);
                 setAggModos(Array.isArray(modoRes) ? modoRes : []);

                 setLoadingVars(false);
             }
         } catch (e) {
             console.error("Dashboard SQL Error:", e);
             if (mounted) setLoadingVars(false);
         }
     };
     if (state.user) fetchData();
     return () => mounted = false;
  }, [state.user, state.managerView, state.reloadTrigger]);

  const srvKeys = Object.keys(srvOrderCounts).sort((a, b) => srvOrderCounts[b] - srvOrderCounts[a]);
  const sectorsList = Object.keys(srvOrderCounts).sort();

  // Estados Locales para Gráficos y Tablas
  const [animOrderIdx, setAnimOrderIdx] = useState(0);
  const [lineSectorIdx, setLineSectorIdx] = useState(0);
  const [lineIsPaused, setLineIsPaused] = useState(false);
  
  const [topProdSectorIdx, setTopProdSectorIdx] = useState(0);
  const [topProdTimeFilter, setTopProdTimeFilter] = useState('month');

  const [modoSectorIdx, setModoSectorIdx] = useState(0);
  const [recentSectorIdx, setRecentSectorIdx] = useState(0);
  const [yearlySectorIdx, setYearlySectorIdx] = useState(0);

  // Animación del Odómetro de Impacto
  useEffect(() => {
    if (srvKeys.length <= 1) return;
    const interval = setInterval(() => {
      setAnimOrderIdx(prev => (prev + 1) % srvKeys.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [srvKeys.length]);

  // Rotación Automática Evolución Sector
  useEffect(() => {
    if (sectorsList.length <= 1 || lineIsPaused) return;
    const interval = setInterval(() => {
      setLineSectorIdx(prev => (prev + 1) % sectorsList.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [sectorsList.length, lineIsPaused]);

  // Helpers Componentes
  const activeSectorLine = sectorsList[lineSectorIdx] || '---';
  const activeSectorTop = sectorsList[topProdSectorIdx] || '---';
  const activeSectorModo = sectorsList[modoSectorIdx] || '---';
  const activeSectorRecent = sectorsList[recentSectorIdx] || '---';
  const activeSectorYearly = sectorsList[yearlySectorIdx] || '---';

  // Datos Gráfico Evolución (Dash Line)
  const lineChartData = useMemo(() => {
    const months = [];
    const date = new Date();
    const dataPts = new Array(6).fill(0);
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      months.push(d.toLocaleString('es-x-u-ca-iso8601', { month: 'short' }).toUpperCase());
      const yr = d.getFullYear();
      const mh = d.getMonth() + 1;
      
      const found = aggMeses.filter(a => a.s === activeSectorLine && a.y === yr && a.m === mh);
      dataPts[5 - i] = found.reduce((acc, curr) => acc + curr.c, 0);
    }

    return {
      labels: months,
      datasets: [{
        label: `Producción en ${activeSectorLine}`,
        data: dataPts,
        borderColor: '#6366f1', backgroundColor: '#6366f133',
        tension: 0.4, fill: true, pointRadius: 5, pointBackgroundColor: '#6366f1'
      }]
    };
  }, [aggMeses, activeSectorLine]);

  // Datos Gráfico Servicios Más Comprados (Doughnut)
  const doughnutData = useMemo(() => {
    const topKeys = [...srvKeys].slice(0, 5);
    return {
      labels: topKeys,
      datasets: [{
        data: topKeys.map(k => srvOrderCounts[k]),
        backgroundColor: COLORS.slice(0, 5),
        borderWidth: 2, borderColor: '#ffffff'
      }]
    };
  }, [srvOrderCounts, srvKeys]);

  // Datos Gráfico Top 10 (Barras horizontales)
  const topProdData = useMemo(() => {
    const now = new Date();
    let start, end;
    if (topProdTimeFilter === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    } else if (topProdTimeFilter === 'week') {
        const day = now.getDay() || 7;
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day), 23, 59, 59, 999).getTime();
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    }

    const prodMap = {};
    aggProductos.forEach(o => {
        if (o.s === activeSectorTop) {
            let ts = 0;
            if (o.d) {
               const parsed = new Date(o.d).getTime();
               if (!isNaN(parsed)) ts = parsed;
            }
            if (ts >= start && ts <= end) {
                const prodName = String(o.p).trim().toUpperCase();
                prodMap[prodName] = (prodMap[prodName] || 0) + (o.c || 0);
            }
        }
    });

    const prodArr = Object.keys(prodMap).map(k => ({ name: k, vol: prodMap[k] })).sort((a, b) => b.vol - a.vol).slice(0, 10);
    const labels = prodArr.map(p => p.name.length > 25 ? p.name.substring(0, 22) + '...' : p.name);
    
    return {
      labels,
      datasets: [{
        data: prodArr.map(p => p.vol),
        backgroundColor: COLORS[topProdSectorIdx % COLORS.length],
        borderRadius: 4
      }]
    };
  }, [aggProductos, activeSectorTop, topProdTimeFilter, topProdSectorIdx]);

  const modoData = useMemo(() => {
    let modoVol = {};
    aggModos.forEach(o => {
        if (o.s === activeSectorModo) {
            const m = String(o.mo).trim().toUpperCase();
            modoVol[m] = (modoVol[m] || 0) + (o.c || 0);
        }
    });

    const modoArr = Object.keys(modoVol).map(k => ({ name: k, vol: modoVol[k] })).sort((a, b) => b.vol - a.vol).slice(0, 5);
    return {
      labels: modoArr.map(s => s.name),
      datasets: [{
        label: 'Volumen',
        data: modoArr.map(s => s.vol),
        backgroundColor: '#f59e0b', borderRadius: 6
      }]
    };
  }, [aggModos, activeSectorModo]);

  const availableYears = useMemo(() => {
      const years = new Set();
      const currY = new Date().getFullYear();
      years.add(currY);
      aggMeses.forEach(o => {
          if (o.s === activeSectorYearly && o.y) {
             years.add(o.y);
          }
      });
      return Array.from(years).sort((a,b)=>b-a);
  }, [aggMeses, activeSectorYearly]);

  const openYearlyModal = () => {
      setYearlySectorIdx(lineSectorIdx);
      setSelectedYears([new Date().getFullYear()]);
      setShowYearlyModal(true);
  };

  const toggleYear = (y) => {
      setSelectedYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]);
  };

  const yearlyChartData = useMemo(() => {
     const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
     const datasets = selectedYears.map((year, idx) => {
         const dataPts = new Array(12).fill(0);
         aggMeses.forEach(o => {
             if (o.s === activeSectorYearly && o.y === year && o.m >= 1 && o.m <= 12) {
                 dataPts[o.m - 1] += (o.c || 0);
             }
         });
         const color = COLORS[idx % COLORS.length];
         return {
             label: String(year),
             data: dataPts,
             borderColor: color,
             backgroundColor: color + '33',
             tension: 0.4, fill: true, pointRadius: 4
         };
     });
     return { labels: months, datasets };
  }, [aggMeses, activeSectorYearly, selectedYears]);

  const isReadOnly = state.user?.role === 'encargado' && state.managerView !== 'SELF' && state.managerView !== 'ALL';

  return (
    <div className="flex flex-col h-full gap-4 md:gap-6 animate-fade-in relative pb-10">
      
      {/* DEPURACIÓN DE ESTADO PARA DIAGNÓSTICO (Quitar luego) */}
      <div className="bg-red-500 text-white p-4 rounded-xl text-xs font-mono break-words z-50">
        <strong>DEBUG LOGIC:</strong><br/>
        state.view: {JSON.stringify(state.view)}<br/>
        user.role: {state.user?.role}<br/>
        user.is_super_admin: {String(state.user?.is_super_admin)}<br/>
        ventas_tools: {JSON.stringify(state.user?.permisos_obj?.ventas_tools)}<br/>
        cedula: {state.user?.cedula}<br/>
      </div>
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-[2rem] p-8 md:p-10 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 opacity-20"><span className="material-icons" style={{fontSize: '200px'}}>dashboard</span></div>
        <div className="relative z-10">
           <h2 className="text-3xl md:text-4xl font-black tracking-tight">Hola, {state.user?.name?.split(' ')[0]} 👋</h2>
           <p className="text-indigo-100 mt-2 font-medium text-sm md:text-base">Centro de control unificado. Llave maestra: ID de Cliente.</p>
        </div>
        <div className="relative z-10 flex gap-3">
           <button className="bg-white/20 hover:bg-white/30 text-white px-5 py-3 rounded-xl font-bold transition flex items-center gap-2 backdrop-blur-sm">
              <span className="material-icons text-[20px]">cloud_download</span> Bases
           </button>
           
        </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><span className="material-icons text-2xl">groups</span></div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Cartera (Por ID)</p>
          </div>
          <p className="text-4xl font-black text-slate-800">{loadingVars ? '...' : metricClients}</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><span className="material-icons text-2xl">local_fire_department</span></div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Hilos Activos</p>
          </div>
          <p className="text-4xl font-black text-slate-800">{loadingVars ? '...' : metricSegs}</p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center"><span className="material-icons text-2xl">receipt_long</span></div>
            <p className="text-[11px] font-black text-emerald-600 uppercase tracking-wider text-emerald-600">Impacto en Sector</p>
          </div>
          <div className="relative h-10 w-full overflow-hidden">
            {srvKeys.length === 0 ? (
              <div className="absolute inset-0 flex items-end pb-1"><p className="text-4xl font-black text-slate-800 leading-none">0</p></div>
            ) : (
              srvKeys.map((s, idx) => (
                <div key={idx} className={`absolute inset-0 transition-all duration-500 ease-in-out transform ${animOrderIdx === idx ? 'opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-4 z-0'}`}>
                  <div className="flex items-end gap-2 h-full pb-1">
                      <p className="text-4xl font-black text-slate-800 leading-none">{(Math.round(srvOrderCounts[s] || 0)).toLocaleString()}</p>
                      <p className="text-[10px] font-black text-emerald-700 mb-0.5 uppercase tracking-wider bg-emerald-100 px-2 py-1 rounded-lg truncate max-w-[110px]" title={s}>{s}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* EVOLUCION SECTOR */}
         <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <div className="flex items-center gap-2">
                 <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider">
                   <span className="material-icons text-indigo-500 text-[20px]">trending_up</span> Evolución: <span className="text-indigo-600">{activeSectorLine}</span>
                 </h4>
                 <button onClick={() => setLineSectorIdx(p => (p - 1 + sectorsList.length) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition ml-2 bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center"><span className="material-icons text-[18px]">chevron_left</span></button>
                 <button onClick={() => setLineSectorIdx(p => (p + 1) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center"><span className="material-icons text-[18px]">chevron_right</span></button>
                 <button onClick={() => setLineIsPaused(!lineIsPaused)} className={`text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition ml-1 rounded-full w-8 h-8 flex items-center justify-center ${lineIsPaused ? 'bg-amber-100 text-amber-600' : 'bg-slate-100'}`} title="Pausar/Reproducir">
                   <span className="material-icons text-[18px]">{lineIsPaused ? 'play_arrow' : 'pause'}</span>
                 </button>
               </div>
               <span onClick={openYearlyModal} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg hidden sm:block cursor-pointer hover:bg-indigo-100 transition shadow-sm border border-indigo-100">📊 Ver Histórico Anual</span>
            </div>
            <div onClick={openYearlyModal} className="relative w-full h-64 flex-1 cursor-pointer">
              <Line 
                data={lineChartData} 
                options={{ 
                  responsive: true, maintainAspectRatio: false, 
                  plugins: { legend: { display: false } }, 
                  scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { font: { weight: 'bold' } } } } 
                }} 
              />
            </div>
         </div>
         
         <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider"><span className="material-icons text-pink-500 text-[20px]">pie_chart</span> Servicios Más Comprados</h4>
            </div>
            <div className="relative w-full h-52 flex-1">
              <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} />
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* TOP PRODUCTOS */}
         <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col group">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 border-b border-slate-100 pb-3">
               <div className="flex items-center gap-2">
                 <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider">
                   <span className="material-icons text-indigo-500 text-[20px]">inventory</span> Top 10: <span className="text-indigo-600">{activeSectorTop}</span>
                 </h4>
                 <button onClick={() => setTopProdSectorIdx(p => (p - 1 + sectorsList.length) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition ml-2 bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><span className="material-icons text-[18px]">chevron_left</span></button>
                 <button onClick={() => setTopProdSectorIdx(p => (p + 1) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><span className="material-icons text-[18px]">chevron_right</span></button>
               </div>
               <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto w-full sm:w-auto flex-shrink-0">
                  <button onClick={() => setTopProdTimeFilter('day')} className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${topProdTimeFilter==='day'?'bg-white shadow-sm text-indigo-600':'text-slate-500 hover:text-slate-700'}`}>HOY</button>
                  <button onClick={() => setTopProdTimeFilter('week')} className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${topProdTimeFilter==='week'?'bg-white shadow-sm text-indigo-600':'text-slate-500 hover:text-slate-700'}`}>SEM</button>
                  <button onClick={() => setTopProdTimeFilter('month')} className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${topProdTimeFilter==='month'?'bg-white shadow-sm text-indigo-600':'text-slate-500 hover:text-slate-700'}`}>MES</button>
               </div>
            </div>
            <div className="relative w-full h-64 flex-1">
               <Bar 
                 data={topProdData} 
                 options={{ 
                   indexAxis: 'y', responsive: true, maintainAspectRatio: false, 
                   plugins: { legend: { display: false } }, 
                   scales: { x: { display: false }, y: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } } } 
                 }} 
               />
            </div>
         </div>

         {/* MODO */}
         <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
               <h4 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-wider">
                  <span className="material-icons text-amber-500 text-[20px]">leaderboard</span> MODO: <span className="text-amber-600">{activeSectorModo}</span>
               </h4>
               <div className="flex items-center">
                  <button onClick={() => setModoSectorIdx(p => (p - 1 + sectorsList.length) % sectorsList.length)} className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition ml-2 bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><span className="material-icons text-[18px]">chevron_left</span></button>
                  <button onClick={() => setModoSectorIdx(p => (p + 1) % sectorsList.length)} className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><span className="material-icons text-[18px]">chevron_right</span></button>
               </div>
            </div>
            <div className="relative w-full h-64 flex-1">
              <Bar 
                data={modoData} 
                options={{ 
                  indexAxis: 'y', responsive: true, maintainAspectRatio: false, 
                  plugins: { legend: { display: false } }, 
                  scales: { x: { beginAtZero: true, grid: { borderDash: [5, 5] } }, y: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } } } 
                }} 
              />
            </div>
         </div>
      </div>

      {showYearlyModal && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[9999] fade-in p-4 md:p-6" onClick={() => setShowYearlyModal(false)}>
            <div className="bg-slate-50 rounded-[2rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="px-8 py-6 border-b border-slate-200 bg-white flex justify-between items-center flex-shrink-0">
                    <div className="flex flex-col">
                        <h3 className="text-2xl font-black text-indigo-600 flex items-center gap-2">
                            <span className="material-icons">history</span> Histórico Anual: 
                            <div className="flex items-center gap-2 ml-2">
                                <button onClick={() => setYearlySectorIdx(p => (p - 1 + sectorsList.length) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition"><span className="material-icons text-[20px]">chevron_left</span></button>
                                <span className="text-slate-800 underline decoration-indigo-200 underline-offset-4 select-none">{activeSectorYearly}</span>
                                <button onClick={() => setYearlySectorIdx(p => (p + 1) % sectorsList.length)} className="text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition"><span className="material-icons text-[20px]">chevron_right</span></button>
                            </div>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">Comparativa de volumen de producción por año</p>
                    </div>
                    <button onClick={() => setShowYearlyModal(false)} className="w-10 h-10 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full flex items-center justify-center transition flex-shrink-0"><span className="material-icons">close</span></button>
                </div>
                <div className="px-8 py-4 bg-white border-b border-slate-100 flex gap-4 overflow-x-auto flex-shrink-0 shadow-sm">
                    {availableYears.map(y => (
                        <label key={y} className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition select-none">
                            <input type="checkbox" checked={selectedYears.includes(y)} onChange={() => toggleYear(y)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" />
                            <span className="font-black text-sm text-slate-700">{y}</span>
                        </label>
                    ))}
                </div>
                <div className="p-8 flex-1 relative bg-white">
                    {selectedYears.length > 0 ? (
                        <Line data={yearlyChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { weight: 'bold' } } } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] }, ticks: { font: { weight: 'bold' } } }, x: { grid: { display: false }, ticks: { font: { weight: 'bold' } } } } }} />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center font-bold text-slate-300">Selecciona al menos un año para comparar</div>
                    )}
                </div>
            </div>
         </div>
      )}
    </div>
  );
}
