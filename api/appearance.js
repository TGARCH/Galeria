import { head, put } from '@vercel/blob'
import { hasAccess } from './_auth.js'

// Wygląd galerii (światło, materiały, napisy, efekty) ustawiany w panelu „Wygląd”.
// GET  — zapisane ustawienia dla wszystkich odwiedzających ({} gdy jeszcze nie zapisano)
// PUT  — zapis (tylko właściciel z dostępem do Studia)
// Każda galeria (projekt Vercel) ma własny magazyn Blob, więc i własne ustawienia.

const FILE = 'appearance.json'
const MAX_BYTES = 20000

const readBody = async (req) => {
    if (req.body && typeof req.body === 'object') return req.body
    if (typeof req.body === 'string') return JSON.parse(req.body)
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        if (req.method === 'GET') res.status(200).json({})
        else res.status(503).json({ error: 'Brak magazynu ustawień (BLOB_READ_WRITE_TOKEN)' })
        return
    }

    if (req.method === 'GET') {
        try {
            const meta = await head(FILE)
            // adres z datą zapisu omija pamięć podręczną CDN — nowe ustawienia widać od razu
            const response = await fetch(`${meta.url}?v=${new Date(meta.uploadedAt).getTime()}`, { cache: 'no-store' })
            res.status(200).json(response.ok ? await response.json() : {})
        } catch {
            res.status(200).json({})      // jeszcze nic nie zapisano
        }
        return
    }

    if (req.method === 'PUT') {
        if (!hasAccess(req)) { res.status(401).json({ error: 'Brak dostępu' }); return }
        let data
        try { data = await readBody(req) } catch { res.status(400).json({ error: 'Nieprawidłowe dane' }); return }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { res.status(400).json({ error: 'Nieprawidłowe dane' }); return }
        const text = JSON.stringify(data)
        if (text.length > MAX_BYTES) { res.status(413).json({ error: 'Za dużo danych' }); return }
        await put(FILE, text, { access: 'public', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 })
        res.status(200).json({ saved: true })
        return
    }

    res.setHeader('Allow', 'GET, PUT')
    res.status(405).json({ error: 'Metoda niedozwolona' })
}
