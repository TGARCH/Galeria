import { defineConfig } from 'vite'

// Tytuł i opis strony z ustawień projektu Vercel (każda galeria ma własne) —
// widoczne w karcie przeglądarki, w wyszukiwarce i jako zapasowy podgląd linku.
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export default defineConfig({
    plugins: [{
        name: 'gallery-meta',
        transformIndexHtml(html) {
            const title = process.env.GALLERY_TITLE || 'Tomasz Grzyb'
            const subtitle = process.env.GALLERY_SUBTITLE || 'Rysunki'
            const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
            const values = {
                PAGE_TITLE: `${title} — ${subtitle}`,
                SITE_NAME: title,
                DESCRIPTION: `Wirtualna galeria 3D: ${subtitle.toLowerCase()}. Wejdź i przejdź się między pracami.`,
                OG_IMAGE: host ? `https://${host}/api/og` : '/api/og',
                OG_URL: host ? `https://${host}/` : '/'
            }
            return html.replace(/%(\w+)%/g, (match, key) => key in values ? escape(values[key]) : match)
        }
    }]
})
