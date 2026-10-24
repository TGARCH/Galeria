import crypto from 'node:crypto'

// Tryb „Studio” (nagrywanie rolek) — tylko dla właściciela galerii.
// Wejście: adres z ?studio=KLUCZ (KLUCZ = zmienna STUDIO_KEY w Vercel). Serwer wydaje
// podpisane ciasteczko na 90 dni; zmiana STUDIO_KEY unieważnia wszystkie dostępy.

const COOKIE = 'gstudio'
const DAYS = 90
const enabled = () => Boolean(process.env.STUDIO_KEY)
const sign = (exp) => crypto.createHmac('sha256', `${process.env.GOOGLE_API_KEY || ''}|${process.env.STUDIO_KEY}`).update(`studio:${exp}`).digest('base64url')
const safeEqual = (a, b) => {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b))
    return x.length === y.length && crypto.timingSafeEqual(x, y)
}
const readCookie = (req) => (req.headers.cookie || '').split(';').map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
const hasAccess = (req) => {
    if (!enabled()) return false
    const [exp, sig] = (readCookie(req) || '').split('.')
    return Boolean(exp && sig && Number(exp) > Date.now() && safeEqual(sig, sign(exp)))
}

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
