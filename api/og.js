import sharp from 'sharp'
import { listGallery, sendError } from './_drive.js'

// Obraz podglądu linku 1200×630 (Facebook, Messenger, LinkedIn…):
// jedna praca (?id=) albo trzy najnowsze prace obok siebie — na jasnym tle jak papier.

const W = 1200
const H = 630
const PAPER = { r: 246, g: 244, b: 239 }

export default async function handler(req, res) {
    try {
        const host = req.headers['x-forwarded-host'] || req.headers.host
        const origin = `https://${host}`
        const files = (await listGallery()).flatMap((room) => room.files)
        const wanted = String(req.query.id || '')
        let picks = files.filter((f) => f.id === wanted)
        if (!picks.length) picks = [...files].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime))).slice(0, 3)
        if (!picks.length) throw Object.assign(new Error('Brak prac'), { status: 404 })

        // obrazy przez nasz serwer obrazów (właściwa orientacja, cache CDN)
        const images = await Promise.all(picks.map(async (file) => {
            const response = await fetch(`${origin}/api/image?id=${file.id}&w=1200&v=2&r=${encodeURIComponent(file.version || '')}`)
            if (!response.ok) return null
            return Buffer.from(await response.arrayBuffer())
        }))
        const valid = images.filter(Boolean)
        if (!valid.length) throw Object.assign(new Error('Nie udało się pobrać obrazów'), { status: 502 })

        const margin = 48
        const gap = 36
        const n = valid.length
        const cellW = Math.floor((W - 2 * margin - gap * (n - 1)) / n)
        const cellH = H - 2 * margin
        const layers = []
        for (const [i, buffer] of valid.entries()) {
            const fitted = await sharp(buffer).resize(cellW, cellH, { fit: 'inside' }).toBuffer({ resolveWithObject: true })
            const left = margin + i * (cellW + gap) + Math.round((cellW - fitted.info.width) / 2)
            const top = margin + Math.round((cellH - fitted.info.height) / 2)
            // delikatny cień pod pracą
            const shadow = await sharp({ create: { width: fitted.info.width + 24, height: fitted.info.height + 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite([{ input: { create: { width: fitted.info.width, height: fitted.info.height, channels: 4, background: { r: 60, g: 50, b: 40, alpha: 0.22 } } }, left: 12, top: 16 }])
                .blur(9).png().toBuffer()
            layers.push({ input: shadow, left: left - 12, top: top - 12 })
            layers.push({ input: fitted.data, left, top })
        }
        const out = await sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
            .composite(layers).jpeg({ quality: 86 }).toBuffer()
        res.setHeader('Content-Type', 'image/jpeg')
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400')
        res.status(200).send(out)
    } catch (error) {
        sendError(res, error)
    }
}
