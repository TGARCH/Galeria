import { listFolder, sendError } from './_drive.js'

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
        const files = await listFolder()
        const drawings = files.map((file) => {
            const meta = file.imageMediaMetadata || {}
            const rotated = meta.rotation === 1 || meta.rotation === 3
            const { title, date } = titleFromName(file.name)
            return {
                id: file.id,
                title,
                date: date || file.createdTime?.slice(0, 10) || null,
                description: file.description || '',
                created: file.createdTime,
                width: (rotated ? meta.height : meta.width) || null,
                height: (rotated ? meta.width : meta.height) || null
            }
        })
        // Krótki cache na CDN: nowe pliki z Dysku pojawiają się w galerii w ciągu ~minuty.
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
        res.status(200).json({ drawings, updated: new Date().toISOString() })
    } catch (error) {
        sendError(res, error)
    }
}
