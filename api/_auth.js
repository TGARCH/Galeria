import crypto from 'node:crypto'

// Dostęp właściciela galerii (Studio, panel wyglądu): podpisane ciasteczko wydawane
// przez /api/studio po wejściu z ?studio=KLUCZ (KLUCZ = zmienna STUDIO_KEY w Vercel).

export const COOKIE = 'gstudio'
export const DAYS = 90
export const enabled = () => Boolean(process.env.STUDIO_KEY)
export const sign = (exp) => crypto.createHmac('sha256', `${process.env.GOOGLE_API_KEY || ''}|${process.env.STUDIO_KEY}`).update(`studio:${exp}`).digest('base64url')
export const safeEqual = (a, b) => {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b))
    return x.length === y.length && crypto.timingSafeEqual(x, y)
}
const readCookie = (req) => (req.headers.cookie || '').split(';').map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
export const hasAccess = (req) => {
    if (!enabled()) return false
    const [exp, sig] = (readCookie(req) || '').split('.')
    return Boolean(exp && sig && Number(exp) > Date.now() && safeEqual(sig, sign(exp)))
}
