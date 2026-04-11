use axum::response::Html;

pub async fn index() -> Html<&'static str> {
    Html(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tenant Manager</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
        h1 { margin-bottom: 1.5rem; font-size: 1.5rem; color: #f8fafc; }
        .container { max-width: 720px; margin: 0 auto; }

        form {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
            background: #1e293b;
            padding: 1.25rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
        }
        form h2 { grid-column: 1 / -1; font-size: 1rem; color: #94a3b8; margin-bottom: 0.25rem; }
        input {
            padding: 0.5rem 0.75rem;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 4px;
            color: #e2e8f0;
            font-size: 0.875rem;
        }
        input:focus { outline: none; border-color: #3b82f6; }
        input[name="name"] { grid-column: 1 / -1; }
        button {
            grid-column: 1 / -1;
            padding: 0.5rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 0.875rem;
            cursor: pointer;
        }
        button:hover { background: #2563eb; }

        #status {
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
            font-size: 0.875rem;
        }
        #status.error { display: block; background: #991b1b; }
        #status.success { display: block; background: #166534; }

        table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
        th { text-align: left; padding: 0.75rem; background: #334155; font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; }
        td { padding: 0.75rem; border-top: 1px solid #334155; font-size: 0.875rem; }
        .phase { padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; }
        .phase-ready { background: #166534; color: #bbf7d0; }
        .phase-pending { background: #854d0e; color: #fef08a; }
        .delete-btn {
            background: #dc2626;
            color: white;
            border: none;
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.75rem;
        }
        .delete-btn:hover { background: #b91c1c; }
        .empty { text-align: center; padding: 2rem; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Tenant Manager</h1>
        <div id="status"></div>

        <form id="create-form">
            <h2>New Tenant</h2>
            <input name="name" placeholder="Tenant name" required />
            <input name="cpu" placeholder="CPU (e.g. 2)" value="2" required />
            <input name="memory" placeholder="Memory (e.g. 4Gi)" value="4Gi" required />
            <input name="default_pod_cpu" placeholder="Pod CPU default (e.g. 500m)" />
            <input name="default_pod_memory" placeholder="Pod memory default (e.g. 256Mi)" />
            <button type="submit">Create Tenant</button>
        </form>

        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>CPU</th>
                    <th>Memory</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="tenant-list">
                <tr><td colspan="5" class="empty">Loading...</td></tr>
            </tbody>
        </table>
    </div>

    <script>
        const statusEl = document.getElementById('status');
        const listEl = document.getElementById('tenant-list');
        const form = document.getElementById('create-form');

        function showStatus(msg, type) {
            statusEl.textContent = msg;
            statusEl.className = type;
            setTimeout(() => { statusEl.className = ''; }, 3000);
        }

        async function loadTenants() {
            try {
                const res = await fetch('/tenants');
                const tenants = await res.json();
                if (tenants.length === 0) {
                    listEl.innerHTML = '<tr><td colspan="5" class="empty">No tenants</td></tr>';
                    return;
                }
                listEl.innerHTML = tenants.map(t => `
                    <tr>
                        <td>${esc(t.name)}</td>
                        <td>${esc(t.cpu)}</td>
                        <td>${esc(t.memory)}</td>
                        <td><span class="phase phase-${(t.phase || 'pending').toLowerCase()}">${esc(t.phase || 'Pending')}</span></td>
                        <td><button class="delete-btn" onclick="deleteTenant('${esc(t.name)}')">Delete</button></td>
                    </tr>
                `).join('');
            } catch (e) {
                listEl.innerHTML = '<tr><td colspan="5" class="empty">Failed to load</td></tr>';
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            // Remove empty optional fields
            if (!data.default_pod_cpu) delete data.default_pod_cpu;
            if (!data.default_pod_memory) delete data.default_pod_memory;
            try {
                const res = await fetch('/tenants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error(await res.text());
                showStatus('Tenant created', 'success');
                form.reset();
                form.querySelector('[name="cpu"]').value = '2';
                form.querySelector('[name="memory"]').value = '4Gi';
                loadTenants();
            } catch (e) {
                showStatus(e.message, 'error');
            }
        });

        async function deleteTenant(name) {
            if (!confirm(`Delete tenant "${name}"?`)) return;
            try {
                const res = await fetch(`/tenants/${name}`, { method: 'DELETE' });
                if (!res.ok) throw new Error(await res.text());
                showStatus('Tenant deleted', 'success');
                loadTenants();
            } catch (e) {
                showStatus(e.message, 'error');
            }
        }

        function esc(s) {
            const d = document.createElement('div');
            d.textContent = s || '';
            return d.innerHTML;
        }

        loadTenants();
        setInterval(loadTenants, 5000);
    </script>
</body>
</html>"#,
    )
}