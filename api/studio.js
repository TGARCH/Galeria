import { COOKIE, DAYS, enabled, sign, safeEqual, hasAccess } from './_auth.js'

// Tryb „Studio” (nagrywanie rolek, panel wyglądu) — tylko dla właściciela galerii.
// Wejście: adres z ?studio=KLUCZ (KLUCZ = zmienna STUDIO_KEY w Vercel). Serwer wydaje
// podpisane ciasteczko na 90 dni; zmiana STUDIO_KEY unieważnia wszystkie dostępy.

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'DELETE') {
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`)
        res.status(200).json({ studio: false })
        return
    }
    const key = req.query.key
    if (key !== undefined) {
        if (!enabled() || !safeEqual(key, process.env.STUDIO_KEY)) {
            await new Promise((resolve) => setTimeout(resolve, 600))
            res.status(401).json({ studio: false })
            return
        }
        const exp = Date.now() + DAYS * 864e5
        res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`)
        res.status(200).json({ studio: true })
        return
    }
    res.status(200).json({ studio: hasAccess(req) })
}
