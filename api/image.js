import { fileMeta, listGallery, mediaUrl, sendError } from './_drive.js'

// Lista ID z folderu galerii i jego podfolderów, trzymana w pamięci instancji przez minutę.
// (Przy anonimowym kluczu API Drive nie zwraca pola "parents", więc przynależność
// do folderu sprawdzamy względem listy.)
let folderIds = { ids: new Set(), at: 0 }
const inFolder = async (id) => {
    if (Date.now() - folderIds.at > 60000 || !folderIds.ids.has(id)) {
        folderIds = { ids: new Set((await listGallery()).flatMap((room) => room.files.map((file) => file.id))), at: Date.now() }
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
        // 1) bezpośrednia miniatura Google (jedno zapytanie, działa dla plików publicznych)
        // 2) miniatura z metadanych pliku  3) oryginał
        const attempt = async (url) => {
            const response = await fetch(url)
            return response.ok && response.headers.get('content-type')?.startsWith('image/') ? response : null
        }
        let image = await attempt(`https://lh3.googleusercontent.com/d/${id}=w${width}`)
        if (!image) {
            const meta = await fileMeta(id)
            if (meta.thumbnailLink) image = await attempt(meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${width}`))
        }
        if (!image) image = await attempt(mediaUrl(id))
        if (!image) throw Object.assign(new Error('Nie udało się pobrać obrazu z Dysku'), { status: 502 })

        const buffer = Buffer.from(await image.arrayBuffer())
        res.setHeader('Content-Type', image.headers.get('content-type'))
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
        res.status(200).send(buffer)
    } catch (error) {
        sendError(res, error)
    }
}
