import { listGallery, sendError } from './_drive.js'

// Strona dla robotów podglądu linków: tytuł, opis i zdjęcie (api/og) w znacznikach
// Open Graph. Człowiek, który tu trafi, jest od razu przenoszony do galerii.

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const titleOf = (name) => {
    const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
    return /^\d{8,14}(_\d+)?$/.test(base) ? '' : base.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function handler(req, res) {
    try {
        const host = req.headers['x-forwarded-host'] || req.headers.host
        const origin = `https://${host}`
        const galleryTitle = process.env.GALLERY_TITLE || 'Tomasz Grzyb'
        const subtitle = process.env.GALLERY_SUBTITLE || 'Rysunki'
        const id = /^[\w-]{10,100}$/.test(String(req.query.praca || '')) ? String(req.query.praca) : null

        let title = `${galleryTitle} — ${subtitle}`
        let description = `Wirtualna galeria 3D: ${subtitle.toLowerCase()}. Wejdź i przejdź się między pracami.`
        let image = `${origin}/api/og`
        let url = `${origin}/`
        if (id) {
            const rooms = await listGallery()
            const room = rooms.find((r) => r.files.some((f) => f.id === id))
            const file = room?.files.find((f) => f.id === id)
            if (file) {
                const name = titleOf(file.name)
                title = name ? `${name} — ${galleryTitle}` : `${galleryTitle} — ${subtitle}`
                description = `${room.title ? `${room.title} · ` : ''}Zobacz tę pracę w wirtualnej galerii 3D.`
                image = `${origin}/api/og?id=${id}&r=${encodeURIComponent(file.version || '')}`
                url = `${origin}/?praca=${id}`
            }
        }
        const html = `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escape(galleryTitle)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="pl_PL">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${escape(url)}">
<meta http-equiv="refresh" content="0; url=${escape(url)}">
</head><body><a href="${escape(url)}">${escape(title)}</a></body></html>`
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
        res.status(200).send(html)
    } catch (error) {
        sendError(res, error)
    }
}
