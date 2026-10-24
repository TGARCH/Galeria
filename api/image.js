import { fileMeta, listFolder, mediaUrl, sendError } from './_drive.js'

// Lista ID z folderu, trzymana w pamięci instancji przez minutę.
// (Przy anonimowym kluczu API Drive nie zwraca pola "parents", więc przynależność
// do folderu sprawdzamy względem listy.)
let folderIds = { ids: new Set(), at: 0 }
const inFolder = async (id) => {
    if (Date.now() - folderIds.at > 60000 || !folderIds.ids.has(id)) {
        folderIds = { ids: new Set((await listFolder()).map((file) => file.id)), at: Date.now() }
    }
    return folderIds.ids.has(id)
}

// Serwuje obraz z Dysku pod adresem tej samej domeny (wymagane przez WebGL — CORS),
// w zadanej szerokości. Podaje wyłącznie pliki z folderu galerii.
export default async function handler(req, res) {
    try {
        const id = String(req.query.id || '')
        if (!/^[\w-]{10,100}$/.test(id)) {
            res.status(400).json({ error: 'Nieprawidłowe id' })
            return
        }
        const width = Math.min(Math.max(parseInt(req.query.w, 10) || 1024, 128), 2560)
        if (!(await inFolder(id))) {
            res.status(404).json({ error: 'Nie znaleziono' })
            return
        }
        const meta = await fileMeta(id)
        if (!meta.mimeType?.startsWith('image/')) {
            res.status(404).json({ error: 'Nie znaleziono' })
            return
        }

        let image = null
        if (meta.thumbnailLink) {
            const sized = meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${width}`)
            const response = await fetch(sized)
            if (response.ok) image = response
        }
        if (!image) {
            const response = await fetch(mediaUrl(id))
            if (!response.ok) throw Object.assign(new Error(`Pobranie pliku: ${response.status}`), { status: 502 })
            image = response
        }

        const buffer = Buffer.from(await image.arrayBuffer())
        res.setHeader('Content-Type', image.headers.get('content-type') || meta.mimeType)
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
        res.status(200).send(buffer)
    } catch (error) {
        sendError(res, error)
    }
}
