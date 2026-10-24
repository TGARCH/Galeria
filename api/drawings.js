import { listGallery, sendError } from './_drive.js'

// "Portret Ani_2026-03.jpg" → "Portret Ani 2026-03"
// Nazwy ze skanera ("20261022161541_001.jpg") nie są tytułami — z nich bierzemy tylko datę.
const scannerName = /^(\d{4})(\d{2})(\d{2})\d{0,6}(_\d+)?$/
const titleFromName = (name) => {
    const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
    const scan = base.match(scannerName)
    if (scan) return { title: '', date: `${scan[1]}-${scan[2]}-${scan[3]}` }
    return { title: base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(), date: null }
}

export default async function handler(req, res) {
    try {
        const toDrawing = (file) => {
            const meta = file.imageMediaMetadata || {}
            const rotated = meta.rotation === 1 || meta.rotation === 3
            const { title, date } = titleFromName(file.name)
            return {
                id: file.id,
                // wersja pliku: zmienia się po każdej edycji na Dysku, więc stary obraz nie zostaje w cache
                rev: file.version || file.modifiedTime || '',
                title,
                date: date || file.createdTime?.slice(0, 10) || null,
                description: file.description || '',
                created: file.createdTime,
                width: (rotated ? meta.height : meta.width) || null,
                height: (rotated ? meta.width : meta.height) || null
            }
        }
        const rooms = (await listGallery()).map((room) => ({ id: room.id, title: room.title, drawings: room.files.map(toDrawing) }))
        // Krótki cache na CDN: nowe pliki z Dysku pojawiają się w galerii w ciągu ~minuty.
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
        // Tytuł galerii ustawiany osobno w każdym projekcie Vercel (ten sam kod, różne galerie)
        const gallery = {
            title: process.env.GALLERY_TITLE || null,
            subtitle: process.env.GALLERY_SUBTITLE || null
        }
        res.status(200).json({ gallery, rooms, updated: new Date().toISOString() })
    } catch (error) {
        sendError(res, error)
    }
}
