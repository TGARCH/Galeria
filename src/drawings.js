import * as THREE from 'three'
import { galleryConfig } from './config.js'

// Źródło rysunków: /api/drawings (folder na Dysku Google).
// Tryb ?demo generuje szkice w przeglądarce — do podglądu bez połączenia z Dyskiem.
export const isDemo = new URLSearchParams(window.location.search).has('demo')

// Zwraca sale: [{ id, title, drawings: [...] }]. Sala z plikami luzem ma title = null.
export const fetchRooms = async () => {
    if (isDemo) return demoRooms()
    const response = await fetch('/api/drawings', { cache: 'no-store' })
    let body = null
    try { body = await response.json() } catch { /* brak JSON */ }
    if (!response.ok) throw new Error(body?.error || `Błąd ${response.status}`)
    if (body.gallery?.title) galleryConfig.title = body.gallery.title
    if (body.gallery?.subtitle) galleryConfig.subtitle = body.gallery.subtitle
    return body.rooms
}

// credit: true — wersja do powiększenia, ze stopką o prawach autorskich (dodaje serwer)
export const imageUrl = (drawing, width, { credit = false } = {}) => drawing.demo
    ? demoCanvas(drawing).toDataURL('image/jpeg', 0.9)
    : `/api/image?id=${encodeURIComponent(drawing.id)}&w=${width}&v=3&r=${encodeURIComponent(drawing.rev || '')}${credit ? '&c=1' : ''}`

const textureLoader = new THREE.TextureLoader()

export const loadTexture = async (drawing, width) => {
    if (drawing.demo) return new THREE.CanvasTexture(demoCanvas(drawing))
    return textureLoader.loadAsync(imageUrl(drawing, width))
}

// ——— Tryb demonstracyjny ———

const random = (seed) => () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
}

const demoTitles = ['Studium dłoni', 'Portret w półprofilu', 'Akt siedzący', 'Martwa natura z dzbanem',
    'Szkic głowy', 'Postać w ruchu', 'Kontrapost', 'Portret kobiety', 'Draperia', 'Studium światła',
    'Pejzaż z drzewem', 'Głowa starca', 'Akt leżący', 'Dłonie splecione', 'Profil', 'Szkic z natury']

const demoDrawings = (count) => {
    return Array.from({ length: count }, (_, index) => {
        const rand = random(index + 7)
        const portrait = rand() > 0.3
        const ratio = portrait ? 0.68 + rand() * 0.12 : 1.3 + rand() * 0.15
        return {
            id: `demo-${index}`,
            demo: true,
            seed: index + 11,
            title: index % 4 === 3 ? '' : `${demoTitles[index % demoTitles.length]}${index >= demoTitles.length ? ` ${Math.floor(index / demoTitles.length) + 1}` : ''}`,
            date: `2026-${String(1 + (index % 10)).padStart(2, '0')}-${String(3 + index).padStart(2, '0')}`,
            width: Math.round(1000 * ratio),
            height: 1000
        }
    })
}

const demoCache = new Map()
const demoCanvas = (drawing) => {
    if (demoCache.has(drawing.id)) return demoCache.get(drawing.id)
    const canvas = document.createElement('canvas')
    canvas.width = drawing.width
    canvas.height = drawing.height
    const ctx = canvas.getContext('2d')
    const rand = random(drawing.seed)
    ctx.fillStyle = '#efe9dd'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // ziarno papieru
    for (let i = 0; i < 9000; i++) {
        ctx.fillStyle = `rgba(90,80,60,${rand() * 0.05})`
        ctx.fillRect(rand() * canvas.width, rand() * canvas.height, 1.5, 1.5)
    }
    // szkic węglem: kilka form zbudowanych z kresek
    const cx = canvas.width / 2, cy = canvas.height / 2
    const forms = 3 + Math.floor(rand() * 4)
    for (let f = 0; f < forms; f++) {
        const fx = cx + (rand() - 0.5) * canvas.width * 0.5
        const fy = cy + (rand() - 0.5) * canvas.height * 0.5
        const rx = 60 + rand() * canvas.width * 0.22
        const ry = 60 + rand() * canvas.height * 0.22
        for (let s = 0; s < 70; s++) {
            const a = rand() * Math.PI * 2
            const b = a + 0.4 + rand() * 1.2
            ctx.strokeStyle = `rgba(30,26,22,${0.08 + rand() * 0.35})`
            ctx.lineWidth = 0.8 + rand() * 2.6
            ctx.beginPath()
            ctx.ellipse(fx + (rand() - 0.5) * 14, fy + (rand() - 0.5) * 14, rx * (0.85 + rand() * 0.3), ry * (0.85 + rand() * 0.3), rand() * 0.3, a, b)
            ctx.stroke()
        }
        // kreskowanie cienia
        ctx.strokeStyle = 'rgba(30,26,22,0.18)'
        ctx.lineWidth = 1
        for (let h = 0; h < 40; h++) {
            const hx = fx + rx * 0.2 + rand() * rx * 0.6
            const hy = fy + (rand() - 0.2) * ry
            ctx.beginPath()
            ctx.moveTo(hx, hy)
            ctx.lineTo(hx + 26, hy - 34)
            ctx.stroke()
        }
    }
    ctx.fillStyle = 'rgba(30,26,22,0.55)'
    ctx.font = 'italic 26px Georgia, serif'
    ctx.fillText('T.G.', canvas.width - 90, canvas.height - 40)
    demoCache.set(drawing.id, canvas)
    return canvas
}

const demoRooms = () => {
    const count = Number(new URLSearchParams(window.location.search).get('demo')) || 40
    const all = demoDrawings(count)
    const sizes = [6, 20, Math.max(0, count - 26)]
    const titles = ['Grupa wtorkowa', 'Grupa środowa', 'Archiwalne prace']
    let start = 0
    return sizes.map((size, i) => {
        const room = { id: `demo-room-${i}`, title: titles[i], drawings: all.slice(start, start + size) }
        start += size
        return room
    }).filter((room) => room.drawings.length)
}

// ——— Opisy ———
const months = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
export const formatDate = (iso) => {
    const match = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return match ? `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}` : ''
}
export const displayTitle = (drawing) => drawing.title || 'Bez tytułu'
