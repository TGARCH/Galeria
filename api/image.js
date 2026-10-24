import sharp from 'sharp'
import { fileMeta, listGallery, mediaUrl, sendError } from './_drive.js'

// Lista ID z folderu galerii i jego podfolderów, trzymana w pamięci instancji przez minutę.
// (Przy anonimowym kluczu API Drive nie zwraca pola "parents", więc przynależność
// do folderu sprawdzamy względem listy.)
let folderFiles = { files: new Map(), at: 0 }
const fileInFolder = async (id) => {
    if (Date.now() - folderFiles.at > 60000 || !folderFiles.files.has(id)) {
        const files = (await listGallery()).flatMap((room) => room.files)
        folderFiles = { files: new Map(files.map((file) => [file.id, file])), at: Date.now() }
    }
    return folderFiles.files.get(id) || null
}

// Miniatury Google bywają podawane w surowej orientacji pikseli, bez obrotu zapisanego
// w pliku (EXIF / pole rotation na Dysku). Wtedy obracamy obraz tutaj, żeby galeria
// i powiększenie zawsze dostawały go we właściwej orientacji.
const orient = async (buffer, file) => {
    const image = sharp(buffer, { failOn: 'none' })
    const meta = await image.metadata()
    if (meta.orientation && meta.orientation > 1) return image.rotate().jpeg({ quality: 88 }).toBuffer()
    const rotation = file.imageMediaMetadata?.rotation || 0
    const rawW = file.imageMediaMetadata?.width
    const rawH = file.imageMediaMetadata?.height
    if (rotation % 2 === 1 && rawW && rawH && rawW !== rawH && meta.width !== meta.height) {
        const servedLandscape = meta.width > meta.height
        const rawLandscape = rawW > rawH
        if (servedLandscape === rawLandscape) return image.rotate(rotation * 90).jpeg({ quality: 88 }).toBuffer()
    }
    return null
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
        const file = await fileInFolder(id)
        if (!file) {
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

        let buffer = Buffer.from(await image.arrayBuffer())
        let type = image.headers.get('content-type')
        try {
            const rotated = await orient(buffer, file)
            if (rotated) { buffer = rotated; type = 'image/jpeg' }
        } catch (error) {
            console.warn('Nie udało się sprawdzić orientacji', id, error.message)
        }
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
        res.status(200).send(buffer)
    } catch (error) {
        sendError(res, error)
    }
}
