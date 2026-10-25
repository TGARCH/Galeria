import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

// Stopka z informacją o prawach autorskich — doklejana pod rysunkiem w powiększeniu
// (i w pliku zapisanym z powiększenia). Obrazy na ścianach galerii jej nie mają.
// Czcionka jest dołączona do funkcji, bo serwer nie ma własnych czcionek.

const FONT_DIR = path.dirname(fileURLToPath(new URL('./_fonts/Inter.ttf', import.meta.url)))
const FONT_FILE = path.join(FONT_DIR, 'Inter.ttf')
process.env.FONTCONFIG_PATH ||= FONT_DIR
try { mkdirSync('/tmp/fontconfig-cache', { recursive: true }) } catch { /* bez cache też działa */ }

const PAPER = '#f6f4ef'
const INK = '#3a3631'
const MUTED = '#8c867c'

const escapeMarkup = (text) => String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const ascii = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\x20-\x7e]/g, '')

export const creditText = ({ year, host }) => {
    const holder = process.env.COPYRIGHT_HOLDER || process.env.GALLERY_TITLE || 'Tomasz Grzyb'
    return {
        line1: `© ${year} ${holder}. Wszelkie prawa zastrzeżone.`,
        line2: `Kopiowanie, publikowanie i wykorzystywanie bez pisemnej zgody autora zabronione · ${host}`,
        exifCopyright: ascii(`(c) ${year} ${holder}. All rights reserved.`),
        exifArtist: ascii(holder)
    }
}

const renderLine = async (sharp, text, px, color, maxWidth) => {
    const { data, info } = await sharp({
        text: { text: `<span foreground="${color}">${escapeMarkup(text)}</span>`, font: `Inter ${px}`, fontfile: FONT_FILE, dpi: 72, rgba: true }
    }).png().toBuffer({ resolveWithObject: true })
    if (info.width <= maxWidth) return { data, width: info.width, height: info.height }
    const scaled = await sharp(data).resize({ width: Math.floor(maxWidth) }).png().toBuffer({ resolveWithObject: true })
    return { data: scaled.data, width: scaled.info.width, height: scaled.info.height }
}

export const addCredit = async (sharp, buffer, credit) => {
    // obraz po ewentualnym obrocie z EXIF — wymiary takie, jak go widać
    const upright = await sharp(buffer).rotate().jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true })
    const { width: W, height: H } = upright.info
    buffer = upright.data
    const big = Math.max(14, Math.round(W * 0.0155))
    const small = Math.max(10, Math.round(W * 0.0105))
    const pad = Math.round(W * 0.03)
    const l1 = await renderLine(sharp, credit.line1, big, INK, W - 2 * pad)
    const l2 = await renderLine(sharp, credit.line2, small, MUTED, W - 2 * pad)
    const gap = Math.round(big * 0.45)
    const band = Math.round(pad * 0.9) * 2 + l1.height + gap + l2.height
    const top = Math.round(pad * 0.9)
    return sharp(buffer)
        .extend({ bottom: band, background: PAPER })
        .composite([
            { input: { create: { width: W, height: Math.max(1, Math.round(W / 1600)), channels: 3, background: '#dcd6cc' } }, left: 0, top: H },
            { input: l1.data, left: Math.round((W - l1.width) / 2), top: H + top },
            { input: l2.data, left: Math.round((W - l2.width) / 2), top: H + top + l1.height + gap }
        ])
        .withExifMerge({ IFD0: { Copyright: credit.exifCopyright, Artist: credit.exifArtist } })
        .jpeg({ quality: 90 })
        .toBuffer()
}
