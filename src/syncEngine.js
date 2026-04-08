import { execSQL } from './api';

const colToIndex = (col) => {
    if (!col || typeof col !== 'string') return -1;
    let letter = col.toUpperCase().trim();
    if (!/^[A-Z]+$/.test(letter)) return -1; 
    let temp, sum = 0;
    for (let i = 0; i < letter.length; i++) { temp = letter.charCodeAt(i) - 64; sum = sum * 26 + temp; }
    return sum - 1; 
};

const parseDateData = (dateStr) => {
    if (!dateStr) return null;
    let parts = String(dateStr).trim().split(' ');
    let dateP = parts[0].split(/[\/\-]/);
    if (dateP.length !== 3) return null;
    let timeP = parts[1] || '00:00:00';
    let year = dateP[2], month = dateP[1], day = dateP[0];
    if (year.length !== 4) {
       if (dateP[0].length === 4) { year = dateP[0]; day = dateP[2]; } else { year = '20' + year; }
    }
    return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')} ${timeP}`;
};

const buildMergeQuery = (baseQuery, payloadArray) => {
    if (!payloadArray || payloadArray.length === 0) return '';
    let massiveQuery = '';
    payloadArray.forEach(params => {
       let finalQuery = baseQuery;
       params.forEach(p => {
           let val = (p === null || p === undefined) ? 'NULL' : (typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`);
           finalQuery = finalQuery.replace('?', val);
       });
       massiveQuery += finalQuery + ';\n';
    });
    return massiveQuery;
};

const chunkArray = (array, size) => {
   const chunked = [];
   for (let i = 0; i < array.length; i += size) chunked.push(array.slice(i, i + size));
   return chunked;
};

export const runSmartSync = async ({ targetService, datosConfig, showToast, updateState, mode = 'órdenes', options = {} }) => {
    let bridgeUrl = 'https://script.google.com/macros/s/AKfycbxOL8hxT-7SFH3SmF0YBtPulXOJ4mzjpgFu75XEI45mxL3OkoDHnH1yoCA6Q7eZknnfuw/exec';
    const userBridge = datosConfig?.find(c => c.servicio === 'APPSCRIPT_BRIDGE');
    if (userBridge && userBridge.url && userBridge.url.includes('script.google.com')) bridgeUrl = userBridge.url;

    const ignoredConf = datosConfig?.find(c => c.servicio === 'ESTADOS_IGNORADOS');
    const ignoredStates = ignoredConf && ignoredConf.url ? ignoredConf.url.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];

    updateState({ isSmartSyncing: true, syncResult: null });

    try {
        if (mode === 'órdenes') {
            if(showToast) showToast('Descargando configuraciones y mapeos DB...', 4000);
            
            const confRes = await execSQL("SELECT * FROM configuracion_externa");
            if (confRes.error) throw new Error("Fallo al leer config: " + confRes.error);
            
            const clientsRes = await execSQL("SELECT id FROM clientes");
            if (clientsRes.error) throw new Error("Fallo al leer clientes: " + clientsRes.error);

            const existingServiciosRes = await execSQL("SELECT id_registro, cantidad, trabajo, producto, modo, estado FROM ordenes_servicios");
            if (existingServiciosRes.error) throw new Error("Fallo al leer config: " + existingServiciosRes.error);

            const existingMaestrasRes = await execSQL("SELECT orden_id FROM ordenes_maestras");
            
            const clientMap = new Map();
            if (Array.isArray(clientsRes)) clientsRes.forEach(c => clientMap.set(String(c.id).toLowerCase().trim(), c.id));
            
            const existingServicios = new Map();
            if (Array.isArray(existingServiciosRes)) {
                 existingServiciosRes.forEach(s => {
                     existingServicios.set(s.id_registro, { 
                         cantidad: Number(s.cantidad), trabajo: String(s.trabajo||'').trim(), 
                         producto: String(s.producto||'').trim(), modo: String(s.modo||'').trim(), estado: String(s.estado||'').trim() 
                     });
                 });
            }
            const existingMaestras = new Set(Array.isArray(existingMaestrasRes) ? existingMaestrasRes.map(m=>m.orden_id) : []);

            let maestrasMap = new Map();
            let serviciosMap = new Map();
            let erroresEnLeidas = [];

            for (let i = 0; i < confRes.length; i++) {
                const conf = confRes[i];
                if (conf.servicio === 'APPSCRIPT_BRIDGE' || conf.servicio === 'ESTADOS_IGNORADOS') continue;
                if (targetService !== 'ALL' && conf.servicio !== targetService) continue;
                if (!conf.url || !conf.nombre_hoja) continue;

                if(showToast) showToast(`Extrayendo ${conf.servicio}...`, 15000);
                try {
                    const res = await fetch(`${bridgeUrl}?action=extractRawMatrix&url=${encodeURIComponent(conf.url)}&sheet=${encodeURIComponent(conf.nombre_hoja)}`);
                    const result = await res.json();
                    if (!result.success) {
                        erroresEnLeidas.push(`Fallo en hoja ${conf.servicio}: ${result.error}`);
                        continue;
                    }
                    
                    const rawData = result.data;
                    if (!rawData || rawData.length <= 1) continue;

                    const idxOrd = colToIndex(conf.col_orden); const idxCli = colToIndex(conf.col_cliente); const idxCant = colToIndex(conf.col_cantidad);
                    const idxTrab = colToIndex(conf.col_trabajo); const idxModo = colToIndex(conf.col_modo); const idxProd = colToIndex(conf.col_producto);
                    const idxFec = colToIndex(conf.col_fecha); const idxEst = colToIndex(conf.col_estado);

                    if (idxOrd === -1 || idxCli === -1) continue; 

                    for (let r = 1; r < rawData.length; r++) {
                        const row = rawData[r]; 
                        if (!row || row.length === 0) continue;
                        if (row.every(cell => String(cell).trim() === '')) continue;

                        let ordenIdRaw = idxOrd > -1 ? String(row[idxOrd] || '').trim() : '';
                        let cliIdRaw = idxCli > -1 ? String(row[idxCli] || '').trim() : '';
                        if (!ordenIdRaw && !cliIdRaw) continue;
                        
                        let cantidadRaw = idxCant > -1 ? String(row[idxCant] || '0').trim() : '0';
                        cantidadRaw = cantidadRaw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]+/g,"");
                        
                        const extClientId = cliIdRaw.toLowerCase();
                        const finalClientId = clientMap.has(extClientId) ? clientMap.get(extClientId) : (extClientId || 'Desc');
                        let ordenId = ordenIdRaw || `AUT-${finalClientId}-${conf.servicio.substring(0,3).toUpperCase()}-${r}`;
                        
                        if (!existingMaestras.has(ordenId) && !maestrasMap.has(ordenId)) {
                            maestrasMap.set(ordenId, [ 
                               ordenId, finalClientId, parseDateData(idxFec > -1 ? String(row[idxFec] || '') : '') || new Date().toISOString().replace('T', ' ').split('.')[0], Date.now().toString() 
                            ]);
                        }

                        const servKey = ordenId + '_' + conf.servicio;
                        const tCant = parseFloat(cantidadRaw) || 0;
                        const tTrab = idxTrab > -1 ? String(row[idxTrab] || '').trim() : '';
                        const tProd = idxProd > -1 ? String(row[idxProd] || '').trim() : '';
                        const tModo = idxModo > -1 ? String(row[idxModo] || '').trim() : '';
                        const tEst = idxEst > -1 ? String(row[idxEst] || '').trim() : 'Sin Estado';

                        let recordChanged = true;
                        if (existingServicios.has(servKey)) {
                            const e = existingServicios.get(servKey);
                            
                            // Check if existing SQL state is marked as ignored. If so, lock the record.
                            if (ignoredStates.includes(String(e.estado).toLowerCase().trim())) continue;

                            if (e.cantidad === tCant && e.trabajo === tTrab && e.producto === tProd && e.modo === tModo && e.estado === tEst) {
                                recordChanged = false;
                            }
                        }

                        if (recordChanged) {
                            serviciosMap.set(servKey, [servKey, ordenId, conf.servicio, tCant, tTrab, tProd, tModo, tEst]);
                        }
                    }
                } catch (e) {
                    erroresEnLeidas.push(`Excepción en hoja ${conf.servicio}: ${e.message}`);
                }
            }

            if(showToast) showToast(`Inyectando Base de Datos localmente... (${maestrasMap.size} maestras nuevas, ${serviciosMap.size} mod.)`, 15000);
            
            const payloadMaestras = Array.from(maestrasMap.values());
            if (payloadMaestras.length > 0) {
               const chunks = chunkArray(payloadMaestras, 500);
               for (let c of chunks) {
                   const mergeMaestras = `MERGE ordenes_maestras AS target USING (VALUES (?, ?, ?, ?)) AS source(orden_id, cliente_id, fecha_ingreso, timestamp_mod) ON target.orden_id = source.orden_id WHEN MATCHED THEN UPDATE SET cliente_id = source.cliente_id, fecha_ingreso = source.fecha_ingreso, timestamp_mod = source.timestamp_mod WHEN NOT MATCHED THEN INSERT (orden_id, cliente_id, fecha_ingreso, timestamp_mod) VALUES (source.orden_id, source.cliente_id, source.fecha_ingreso, source.timestamp_mod)`;
                   const pushRes = await execSQL(buildMergeQuery(mergeMaestras, c));
                   if (pushRes && pushRes.error) throw new Error("Error inyectando Maestras: " + pushRes.error);
               }
            }

            const payloadServicios = Array.from(serviciosMap.values());
            if (payloadServicios.length > 0) {
               const chunks = chunkArray(payloadServicios, 500);
               for (let c of chunks) {
                   const mergeServicios = `MERGE ordenes_servicios AS target USING (VALUES (?, ?, ?, CAST(? AS FLOAT), ?, ?, ?, ?)) AS source(id_registro, orden_id, servicio, cantidad, trabajo, producto, modo, estado) ON target.id_registro = source.id_registro WHEN MATCHED THEN UPDATE SET cantidad = source.cantidad, trabajo = source.trabajo, producto = source.producto, modo = source.modo, estado = source.estado WHEN NOT MATCHED THEN INSERT (id_registro, orden_id, servicio, cantidad, trabajo, producto, modo, estado) VALUES (source.id_registro, source.orden_id, source.servicio, source.cantidad, source.trabajo, source.producto, source.modo, source.estado)`;
                   const pushRes = await execSQL(buildMergeQuery(mergeServicios, c));
                   if (pushRes && pushRes.error) throw new Error("Error inyectando Servicios: " + pushRes.error);
               }
            }

            updateState({ 
               syncResult: {
                  type: 'success', title: '¡Extracción Completada!', 
                  desc: `React cruzó transparentemente la API de Google Sheets y preparó las órdenes.`,
                  maestras: payloadMaestras.length,
                  servicios: payloadServicios.length,
                  debugInfo: erroresEnLeidas
               }
            });
            const sName = targetService === 'ALL' ? 'Todos los Sectores' : targetService;
            await execSQL("INSERT INTO logs_sistema (timestamp, modulo, estado, mensaje) VALUES (?, 'AUTOSYNC', 'EXITO', ?)", [Date.now(), "Sincronización Manual: " + sName]);


        } else if (mode === 'clientes') {
            if(showToast) showToast('Descargando Clientes vía Puente...', 10000);
            const extId = '1rgjR09Y8M9DQ0oOaGAipxwSnsrykCvkOPL2XlK-c4OY'; const sheetName = 'Respuestas de formulario 5';
            
            const res = await fetch(`${bridgeUrl}?action=extractRawMatrix&url=${encodeURIComponent('https://docs.google.com/spreadsheets/d/' + extId)}&sheet=${encodeURIComponent(sheetName)}`);
            const result = await res.json();
            if (!result.success) throw new Error("Fallo en extracción: " + result.error);

            const rawData = result.data;
            if (!rawData || rawData.length <= 1) {
                updateState({ syncResult: { type: 'success', title: '¡Clientes Extraídos!', desc: `No hay clientes nuevos para extraer.`, clientes: 0 } });
                updateState({ isSmartSyncing: false });
                return;
            }

            let lastRow = parseInt(options.syncClientRow) || 1;
            if (lastRow > 0) lastRow -= 1;
            
            const existing = await execSQL("SELECT id FROM clientes");
            const localMap = new Map(); 
            if(Array.isArray(existing)) existing.forEach(c => localMap.set(String(c.id).toLowerCase().trim(), true));

            let upsertsMap = new Map(); 
            for (let i = lastRow; i < rawData.length; i++) {
               const row = rawData[i]; 
               if (!row || row.length === 0) continue;
               const isRowEmpty = row.every(cell => String(cell).trim() === '');
               if (isRowEmpty) continue;

               const colA = String(row[0] || '').trim(); 
               const idCliente = String(row[3] || '').trim(); 
               if (!idCliente) continue; 
               
               const nameKey = idCliente.toLowerCase();
               if (localMap.has(nameKey) || upsertsMap.has(nameKey)) continue;

               upsertsMap.set(nameKey, [
                  idCliente, String(row[4] || '').trim() || 'Sin Nombre', String(row[5] || '').trim(), null, colA, 
                  String(row[6] || '').trim(), String(row[7] || '').trim(), String(row[8] || '').trim(), String(row[9] || '').trim(),
                  String(row[10] || '').trim(), String(row[11] || '').trim(), String(row[12] || '').trim()
               ]);
            }

            const payloadArray = Array.from(upsertsMap.values());
            if (payloadArray.length > 0) {
                if(showToast) showToast('Creando clientes nuevos...', 10000);
                const mergeQuery = `
                  MERGE clientes AS target
                  USING (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)) AS source(id, nombre_completo, telefono, vendedor_id, fecha_registro, mail, empresa, rut, departamento, localidad, tipo_retiro, direccion)
                  ON target.id = source.id
                  WHEN MATCHED THEN UPDATE SET nombre_completo = source.nombre_completo, telefono = source.telefono, mail = source.mail, empresa = source.empresa, rut = source.rut, departamento = source.departamento, localidad = source.localidad, tipo_retiro = source.tipo_retiro, direccion = source.direccion
                  WHEN NOT MATCHED THEN INSERT (id, nombre_completo, telefono, vendedor_id, fecha_registro, mail, empresa, rut, departamento, localidad, tipo_retiro, direccion) VALUES (source.id, source.nombre_completo, source.telefono, source.vendedor_id, source.fecha_registro, source.mail, source.empresa, source.rut, source.departamento, source.localidad, source.tipo_retiro, source.direccion)
                `;
                const pushRes = await execSQL(buildMergeQuery(mergeQuery, payloadArray));
                if (pushRes && pushRes.error) throw new Error("Error inyectando Clientes: " + pushRes.error);
            }

            updateState({ syncResult: { 
               type: 'success', title: '¡Clientes Extraídos!', 
               desc: `React cruzó exitosamente los nuevos clientes y los adaptó al AWS en vivo.`,
               clientes: payloadArray.length
            }});
            await execSQL("INSERT INTO logs_sistema (timestamp, modulo, estado, mensaje) VALUES (?, 'AUTOSYNC', 'EXITO', 'Sincronización Manual: Clientes')", [Date.now()]);
        }
    } catch (err) {
        updateState({ syncResult: { type: 'error', title: 'Fallo Crítico en Sync', desc: err.message } });
    }
    
    updateState({ isSmartSyncing: false, reloadTrigger: Date.now() });
};
