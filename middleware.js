import { next, rewrite } from '@vercel/functions'

// Podgląd linku (Facebook, Messenger, WhatsApp, LinkedIn…): roboty tych serwisów nie
// uruchamiają galerii 3D, więc dostają krótką stronę z tytułem i zdjęciem (api/share).
// Zwykli odwiedzający idą prosto do galerii — bez żadnego opóźnienia.
const PREVIEW_BOTS = /facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|SkypeUriPreview|redditbot|Applebot|vkShare|Viber|Embedly|Google-InspectionTool|Googlebot|bingbot/i

export const config = { matcher: '/' }

export default function middleware(request) {
    if (!PREVIEW_BOTS.test(request.headers.get('user-agent') || '')) return next()
    const url = new URL(request.url)
    const target = new URL('/api/share', url)
    const work = url.searchParams.get('praca')
    if (work) target.searchParams.set('praca', work)
    return rewrite(target)
}
