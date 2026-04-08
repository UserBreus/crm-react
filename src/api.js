const API_BASE = '/api';

window.sqlTrafficLogs = window.sqlTrafficLogs || [];

function pushToLog(logItem) {
    window.sqlTrafficLogs.unshift(logItem);
    if (window.sqlTrafficLogs.length > 100) {
        window.sqlTrafficLogs.pop();
    }
}

export async function execSQL(query, params = []) {
    let finalQuery = query;
    if (params && params.length > 0) {
        params.forEach(p => {
            let val = (p === null || p === undefined) ? 'NULL' : (typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`);
            finalQuery = finalQuery.replace('?', val);
        });
    }

    const startTime = performance.now();
    const ts = new Date().getTime();
    try {
        const res = await fetch(`${API_BASE}/sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: finalQuery })
        });
        
        const data = await res.json();
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        let success = res.ok && data?.success !== false;
        let pBytes = new TextEncoder().encode(JSON.stringify(data)).length;
        
        const summary = query.length > 100 ? query.substring(0, 100) + '...' : query;
        
        pushToLog({
           timestamp: ts,
           latency: Math.round(latency),
           query: summary,
           bytes: pBytes,
           success,
           errorMsg: data?.error || 'OK'
        });
        
        if (data && data.success !== undefined && data.data !== undefined) {
            return data.data; // Desempaqueta automáticamente la respuesta del servidor SQL
        }
        return data; 
    } catch (err) {
        const endTime = performance.now();
        pushToLog({
           timestamp: ts,
           latency: Math.round(endTime - startTime),
           query: query.length > 100 ? query.substring(0, 100) + '...' : query,
           bytes: 0,
           success: false,
           errorMsg: err.message || "Fallo de red"
        });
        console.error("SQL Error:", err);
        return { error: err.message || "Fallo de red al conectar por API" };
    }
}

export async function ejecutarMergeBatch(query, payloadArray) {
    try {
        const res = await fetch(`${API_BASE}/sql-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, params: payloadArray })
        });
        
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("SQL Batch Error:", err);
        return { error: err.message || "Fallo de red al conectar por API Batch" };
    }
}
