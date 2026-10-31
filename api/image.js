import sharp from 'sharp'
import { fileMeta, listGallery, mediaUrl, sendError } from './_drive.js'
import { addCredit, creditText } from './_credit.js'

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

// Proporcje bieżącej wersji pliku według Dysku (po obrocie). Miniatury Google po edycji
// pliku (np. przycięciu) bywają jeszcze przez jakiś czas stare — mają wtedy inne proporcje.
const expectedRatio = (file) => {
    const w = file.imageMediaMetadata?.width, h = file.imageMediaMetadata?.height
    if (!w || !h) return null
    return (file.imageMediaMetadata?.rotation || 0) % 2 === 1 ? h / w : w / h
}
const ratioMatches = (ratio, expected) =>
    Math.min(Math.abs(ratio / expected - 1), Math.abs(ratio * expected - 1)) < 0.02

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
        // 1) miniatura z metadanych pliku (adres zawiera bieżącą wersję pliku — po edycji
        //    na Dysku od razu nowy obraz), 2) bezpośrednia miniatura Google, 3) oryginał
        const attempt = async (url) => {
            const response = await fetch(url)
            return response.ok && response.headers.get('content-type')?.startsWith('image/') ? response : null
        }
        let image = null
        try {
            const meta = await fileMeta(id)
            if (meta.thumbnailLink) image = await attempt(meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${width}`))
        } catch (error) {
            console.warn('Brak miniatury z metadanych', id, error.message)
        }
        if (!image) image = await attempt(`https://lh3.googleusercontent.com/d/${id}=w${width}`)
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
        // nieaktualna miniatura (inne proporcje niż bieżący plik) → oryginał z Dysku, zmniejszony tutaj;
        // inaczej podgląd pokazywałby np. pracę sprzed przycięcia, a potem podmieniał ją na oczach
        try {
            const expected = expectedRatio(file)
            const served = await sharp(buffer, { failOn: 'none' }).metadata()
            if (expected && served.width && served.height && !ratioMatches(served.width / served.height, expected)) {
                const original = await attempt(mediaUrl(id))
                if (original) {
                    let source = Buffer.from(await original.arrayBuffer())
                    const rotated = await orient(source, file)
                    if (rotated) source = rotated
                    buffer = await sharp(source, { failOn: 'none' }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
                    type = 'image/jpeg'
                    console.warn('Nieaktualna miniatura Google — użyto oryginału', id)
                }
            }
        } catch (error) {
            console.warn('Nie udało się sprawdzić aktualności miniatury', id, error.message)
        }
        // powiększenie (?c=1): stopka z prawami autorskimi + informacja w metadanych pliku
        if (req.query.c === '1') {
            const host = req.headers['x-forwarded-host'] || req.headers.host
            const year = (file.createdTime || new Date().toISOString()).slice(0, 4)
            buffer = await addCredit(sharp, buffer, creditText({ year, host }))
            type = 'image/jpeg'
        }
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
        res.status(200).send(buffer)
    } catch (error) {
        sendError(res, error)
    }
}
