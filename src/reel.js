import * as THREE from 'three'
import { Grid } from './tour.js'
import { formatDate } from './drawings.js'
import { galleryConfig as cfg } from './config.js'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

// ————————————————————————————————————————————————
// Rolki do mediów społecznościowych — nagrywane w przeglądarce
// ————————————————————————————————————————————————
// Kamera odgrywa zaplanowany scenariusz, obraz 3D jest składany z napisami na
// osobnym płótnie 2D w docelowej rozdzielczości; nagranie klatka po klatce do MP4.

export const FORMATS = {
    '9:16': { size: [1080, 1920], fov: 64, label: 'Pionowy 9:16 — Reels, Shorts, TikTok' },
    '4:5': { size: [1080, 1350], fov: 58, label: 'Post 4:5 — Instagram, Facebook' },
    '16:9': { size: [1920, 1080], fov: 52, label: 'Poziomy 16:9 — YouTube' }
}

export const PHOTO_FORMATS = {
    '4:5': { size: [1080, 1350], label: 'Instagram, Facebook — post pionowy' },
    '1:1': { size: [1080, 1080], label: 'Instagram, Facebook — kwadrat' },
    '1.91:1': { size: [1200, 628], label: 'Facebook — post poziomy, link' }
}
const PHOTO_FOV = 50
const PHOTO_VIEWS = [
    { key: 'bliska', fill: 0.86, lateral: 0, height: 0 },              // z bliska, na wprost
    { key: 'dystans', fill: 0.46, lateral: 0.6, height: 0 },           // z lekkiego dystansu, trochę z boku
    { key: '5m', distance: 5, lateral: 1.2, height: 0 }                // widok z 5 m — rysunek na ścianie sali
]

export const SCENARIOS = {
    newWork: { label: 'Nowe prace', hint: 'wybrane prace z napisem „Nowa praca”' },
    room: { label: 'Prezentacja sali', hint: 'kilka prac z wybranej sali, na początku nazwa sali' },
    walk: { label: 'Spacer po galerii', hint: 'dłuższa prezentacja — kilka prac w każdej wybranej sali' }
}

// Ruch kamery jak w spacerze automatycznym: zwiedzający idzie od pracy do pracy,
// omija ścianki, spokojnie obraca głowę, zatrzymuje się i przygląda.
export const FPS = 30
const EYE = 1.6
const WALK_SPEED = 1.1     // m/s
const DWELL = 3.6          // s przy jednej pracy
const MAX_TURN = 0.8       // rad/s — najszybszy obrót głowy
const MAX_PITCH = 0.08     // ok. 4,5° — kamera nie patrzy w podłogę ani w sufit
const INTRO = 2.6          // s spokojnego ujęcia na początku (tytuł)
const OUTRO = 3.2          // s planszy końcowej
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const clamp01 = (t) => Math.min(Math.max(t, 0), 1)
const fade = (u, a, b, c, d) => u < a ? 0 : u < b ? (u - a) / (b - a) : u < c ? 1 : u < d ? 1 - (u - c) / (d - c) : 0

// szacowany czas filmu (do podglądu w panelu)
export const estimateDuration = (count) => INTRO + OUTRO + count * (DWELL + 4.2)

const pickMime = () => {
    const options = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    return options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || ''
}

export class Reel {
    constructor({ renderer, camera, gallery }) {
        this.renderer = renderer
        this.camera = camera
        this.gallery = gallery
        this.active = false
        this.canvas = document.createElement('canvas')
        this.canvas.className = 'reel-canvas'
        this.canvas.hidden = true
        document.body.appendChild(this.canvas)
        this.ctx = this.canvas.getContext('2d')
    }

    // odległość, z której cała rama mieści się w kadrze (zależna od formatu filmu)
    viewpoint(art) {
        const tanV = Math.tan(THREE.MathUtils.degToRad(this.vfov || 60) / 2)
        const tanH = tanV * (this.aspect || 1)
        const FILL = 0.7
        const fit = Math.max(art.outerW / FILL / 2 / tanH, art.outerH / FILL / 2 / tanV)
        const d0 = THREE.MathUtils.clamp(fit + 0.15, 1.8, 4.6)
        for (let d = d0; d >= 1.2; d -= 0.15) {
            const x = art.world.x + art.normal.x * d
            const z = art.world.z + art.normal.z * d
            if (!this.grid || this.grid.freeAt(x, z)) return new THREE.Vector3(x, EYE, z)
        }
        return new THREE.Vector3(art.world.x + art.normal.x * 1.4, EYE, art.world.z + art.normal.z * 1.4)
    }

    // kolejność zwiedzania: sala po sali, w sali zawsze najbliższa następna praca
    order(arts) {
        const rest = [...arts]
        const out = []
        let pos = null
        while (rest.length) {
            const room = Math.min(...rest.map((a) => a.room))
            const pool = rest.filter((a) => a.room === room)
            let best = pool[0]
            if (pos) {
                let bestD = Infinity
                for (const a of pool) {
                    const d = this.viewpoint(a).distanceTo(pos)
                    if (d < bestD) { bestD = d; best = a }
                }
            } else {
                // start od pracy najbliżej wejścia do sali
                const entry = new THREE.Vector3(room * cfg.room.width, EYE, room > 0 ? this.gallery.doorZ[room] : 0)
                best = pool.reduce((m, a) => this.viewpoint(a).distanceTo(entry) < this.viewpoint(m).distanceTo(entry) ? a : m, pool[0])
            }
            out.push(best)
            rest.splice(rest.indexOf(best), 1)
            pos = this.viewpoint(best)
        }
        return out
    }

    // ——— trasa: symulacja spaceru klatka po klatce (z góry, więc podgląd = nagranie) ———
    build(scenario, { artIds = [] }) {
        this.grid = this.gallery.bounds ? new Grid(this.gallery.bounds, this.gallery.colliders) : null
        const ids = new Set(artIds)
        const arts = this.order(this.gallery.artworks.filter((a) => ids.has(a.drawing.id)))
        if (!arts.length) throw new Error('Brak wybranych prac')
        const dt = 1 / FPS
        const frames = []
        const events = []
        const pos = new THREE.Vector3()
        let yaw = 0
        let pitch = 0
        const look = (target) => {
            const dx = target.x - pos.x, dz = target.z - pos.z
            return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.y - pos.y, Math.hypot(dx, dz)) }
        }
        const turn = (ty, tp, rate) => {
            const k = 1 - Math.exp(-dt * rate)
            const limit = MAX_TURN * dt
            yaw += THREE.MathUtils.clamp(wrapAngle(ty - yaw) * k, -limit, limit)
            pitch += THREE.MathUtils.clamp((THREE.MathUtils.clamp(tp, -MAX_PITCH, MAX_PITCH) - pitch) * k, -limit * 0.5, limit * 0.5)
        }
        const push = () => frames.push(pos.x, pos.y, pos.z, yaw, pitch)

        // ujęcie otwierające: kilka kroków przed pierwszą pracą, już na nią patrząc
        const first = arts[0]
        const firstView = this.viewpoint(first)
        pos.copy(firstView)
        for (let d = 2.6; d > 0; d -= 0.2) {
            const p = firstView.clone().addScaledVector(first.normal, d)
            if (!this.grid || this.grid.freeAt(p.x, p.z)) { pos.copy(p); break }
        }
        ;({ yaw } = look(first.world))
        pitch = 0
        const introStart = frames.length / 5
        for (let i = 0; i < INTRO * FPS; i++) push()
        events.push({ type: 'intro', start: introStart, end: frames.length / 5, room: first.room })

        let room = -1
        arts.forEach((art, index) => {
            const target = this.viewpoint(art)
            const points = this.grid?.path(pos.x, pos.z, target.x, target.z) || [[pos.x, pos.z], [target.x, target.z]]
            const vectors = points.map(([x, z]) => new THREE.Vector3(x, EYE, z))
            if (vectors.length === 2) vectors.splice(1, 0, vectors[0].clone().lerp(vectors[1], 0.5))
            const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5)
            const length = curve.getLength()
            const walkStart = frames.length / 5
            if (length > 0.15) {
                const duration = length / WALK_SPEED + 1.4
                for (let t = 0; t < duration; t += dt) {
                    const w = Math.min(t / duration, 1)
                    const u = easeInOut(w)
                    pos.copy(curve.getPointAt(u))
                    pos.y = EYE + Math.sin(t * 6.2) * 0.006 * Math.sin(Math.PI * w)
                    const ahead = curve.getPointAt(Math.min(u + 0.08, 1))
                    const walkLook = ahead.distanceTo(pos) > 0.05 ? look(new THREE.Vector3(ahead.x, EYE, ahead.z)) : look(art.world)
                    const artLook = look(art.world)
                    const blend = THREE.MathUtils.smoothstep(w, 0.3, 0.9)
                    turn(walkLook.yaw + wrapAngle(artLook.yaw - walkLook.yaw) * blend, artLook.pitch * blend, 1.6)
                    push()
                }
            } else {
                // dojście już jest — tylko spokojny obrót na pracę
                const artLook = look(art.world)
                for (let t = 0; t < 1.2; t += dt) { turn(artLook.yaw, artLook.pitch, 2.0); push() }
            }
            if (art.room !== room) {
                events.push({ type: 'room', start: walkStart, end: frames.length / 5 + DWELL * FPS, room: art.room, first: room === -1 })
                room = art.room
            }
            // przyglądanie się: delikatny ruch w bok i krok bliżej
            const base = pos.clone()
            const side = new THREE.Vector3(art.normal.z, 0, -art.normal.x)
            const dwellStart = frames.length / 5
            for (let t = 0; t < DWELL; t += dt) {
                const s = t / DWELL
                pos.copy(base).addScaledVector(side, Math.sin(s * Math.PI) * 0.1).addScaledVector(art.normal, -easeInOut(s) * 0.12)
                const l = look(art.world)
                turn(l.yaw, l.pitch, 2.0)
                push()
            }
            events.push({ type: 'art', start: dwellStart, end: frames.length / 5, art, index, count: arts.length })
        })

        // plansza końcowa: powolny krok wstecz
        const base = pos.clone()
        const last = arts[arts.length - 1]
        const outroStart = frames.length / 5
        for (let t = 0; t < OUTRO; t += dt) {
            pos.copy(base).addScaledVector(last.normal, easeInOut(Math.min(t / 2.5, 1)) * 0.35)
            push()
        }
        events.push({ type: 'end', start: outroStart, end: frames.length / 5 })

        this.scenario = scenario
        this.frames = new Float32Array(frames)
        this.frameCount = frames.length / 5
        this.events = events
        this.total = this.frameCount / FPS
        return this.neededArtworks()
    }

    // Prace widoczne w nagraniu: wszystko w zasięgu wzroku z trasy kamery.
    // Bliskie — pełna rozdzielczość, dalsze — podgląd. Wczytywane PRZED startem.
    neededArtworks() {
        const samples = []
        for (let i = 0; i < this.frameCount; i += 10) samples.push(new THREE.Vector3(this.frames[i * 5], EYE, this.frames[i * 5 + 2]))
        const full = []
        const preview = []
        for (const art of this.gallery.artworks) {
            let d = Infinity
            for (const p of samples) d = Math.min(d, art.world.distanceTo(p))
            if (d < 14) full.push(art)
            else if (d < 34) preview.push(art)
        }
        return { full, preview }
    }

    // ——— zdjęcia do postów: 3 widoki każdej pracy, bez napisów ———
    photoCamera(art, view, aspect) {
        const tanV = Math.tan(THREE.MathUtils.degToRad(PHOTO_FOV) / 2)
        const tanH = tanV * aspect
        const fitAt = (fill) => Math.max(art.outerW / fill / 2 / tanH, art.outerH / fill / 2 / tanV)
        const want = view.distance || fitAt(view.fill)
        const min = view.distance ? fitAt(0.62) : Math.min(want, 1.0)   // „5 m” nigdy nie staje się zbliżeniem
        const side = new THREE.Vector3(art.normal.z, 0, -art.normal.x)
        const place = (d, lateral) => art.world.clone().addScaledVector(art.normal, d).addScaledVector(side, lateral)
        // szukamy wolnego miejsca: najpierw zadana odległość i strona, potem druga strona, na wprost, coraz bliżej
        let pos = null
        for (let d = want; d >= min - 1e-6 && !pos; d -= 0.15) {
            const l = view.lateral * Math.min(1, d / 3)
            for (const lateral of [l, -l, 0, l * 0.5, -l * 0.5]) {
                const p = place(d, lateral)
                if (!this.grid || this.grid.freeAt(p.x, p.z)) { pos = p; break }
            }
        }
        if (!pos) pos = place(min, 0)
        pos.y = view.distance ? EYE : art.world.y          // z bliska — na wysokości środka pracy, bez perspektywy
        const dx = art.world.x - pos.x, dz = art.world.z - pos.z
        return { pos, yaw: Math.atan2(-dx, -dz), pitch: THREE.MathUtils.clamp(Math.atan2(art.world.y - pos.y, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH) }
    }

    async photos({ format, artIds, onLoading, onProgress, renderFrame }) {
        const spec = PHOTO_FORMATS[format] || PHOTO_FORMATS['4:5']
        const [W, H] = spec.size
        this.grid = this.gallery.bounds ? new Grid(this.gallery.bounds, this.gallery.colliders) : null
        const ids = new Set(artIds)
        const arts = this.order(this.gallery.artworks.filter((a) => ids.has(a.drawing.id)))
        const shots = []
        arts.forEach((art, i) => PHOTO_VIEWS.forEach((view) => shots.push({ art, view, n: i + 1, ...this.photoCamera(art, view, W / H) })))
        // wczytanie: wszystko widoczne z punktów zdjęć
        const full = [], preview = []
        for (const art of this.gallery.artworks) {
            const d = Math.min(...shots.map((s) => art.world.distanceTo(s.pos)))
            if (d < 16) full.push(art)
            else if (d < 36) preview.push(art)
        }
        this.missing = await this.gallery.preload({ full, preview }, onLoading)

        // render w 1,5× rozdzielczości i zmniejszenie — gładkie krawędzie ram
        const SS = 1.5
        const saved = { ratio: this.renderer.getPixelRatio(), fov: this.camera.fov, pos: this.camera.position.clone(), rot: this.camera.rotation.clone() }
        this.active = true
        this.offline = true
        this.renderer.setPixelRatio(1)
        this.renderer.setSize(Math.round(W * SS), Math.round(H * SS), false)
        this.camera.aspect = W / H
        this.camera.fov = PHOTO_FOV
        this.camera.updateProjectionMatrix()
        const out = document.createElement('canvas')
        out.width = W
        out.height = H
        const ctx = out.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        const results = []
        try {
            for (const [i, shot] of shots.entries()) {
                this.camera.position.copy(shot.pos)
                this.camera.rotation.set(shot.pitch, shot.yaw, 0, 'YXZ')
                renderFrame()
                ctx.drawImage(this.renderer.domElement, 0, 0, W, H)
                const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92))
                const title = (shot.art.drawing.title || formatDate(shot.art.drawing.date) || 'praca').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
                results.push({ name: `${shot.n}-${title}-${shot.view.key}.jpg`, blob, url: URL.createObjectURL(blob) })
                onProgress?.(i + 1, shots.length)
                await new Promise((resolve) => setTimeout(resolve, 0))
            }
        } finally {
            this.gallery.unpin()
            this.active = false
            this.offline = false
            this.renderer.setPixelRatio(saved.ratio)
            this.renderer.setSize(window.innerWidth, window.innerHeight)
            this.camera.aspect = window.innerWidth / window.innerHeight
            this.camera.fov = saved.fov
            this.camera.updateProjectionMatrix()
            this.camera.position.copy(saved.pos)
            this.camera.rotation.copy(saved.rot)
        }
        return results
    }

    // napisy dla bieżącej klatki
    drawOverlays(ctx, frame, W, H) {
        const kind = this.scenario
        for (const e of this.events) {
            if (frame < e.start - 1 || frame > e.end + 1) continue
            const u = (frame - e.start) / Math.max(e.end - e.start, 1)
            const len = (e.end - e.start) / FPS
            const fadeIn = 0.5 / len, fadeOut = 0.45 / len
            if (e.type === 'intro') {
                if (kind === 'walk') this.drawGalleryTitle(ctx, fade(u, 0, fadeIn, 1 - fadeOut, 1), W, H)
                else if (kind === 'room') this.drawRoomTitle(ctx, e.room, fade(u, 0, fadeIn, 1 - fadeOut, 1), W, H)
            } else if (e.type === 'room') {
                if (kind === 'walk' || (kind === 'room' && !e.first)) this.drawRoomLabel(ctx, e.room, fade(u, 0.05, 0.05 + fadeIn, 0.55, 0.55 + fadeOut), W, H)
            } else if (e.type === 'art') {
                const alpha = fade(u, 0.04, 0.04 + fadeIn, 1 - fadeOut, 1)
                if (kind === 'newWork') this.drawNewWork(ctx, e.art, e.count > 1 ? `NOWE PRACE · ${e.index + 1} / ${e.count}` : 'NOWA PRACA', alpha, W, H)
                else this.drawCaption(ctx, e.art, alpha, W, H)
            } else if (e.type === 'end') {
                this.drawEndCard(ctx, clamp01(u * len / 0.9), W, H)
            }
        }
    }

    // ——— napisy (rysowane w klatce wideo) ———

    scale(W) { return W / 1080 }

    text(ctx, str, x, y, font, color, alpha, align = 'center', spacing = 0) {
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.font = font
        ctx.fillStyle = color
        ctx.textAlign = align
        ctx.letterSpacing = `${spacing}px`
        ctx.fillText(str, x, y)
        ctx.restore()
    }

    panel(ctx, x, y, w, h, alpha) {
        ctx.save()
        ctx.globalAlpha = alpha * 0.86
        ctx.fillStyle = '#faf9f6'
        ctx.fillRect(x, y, w, h)
        ctx.restore()
    }

    workTitle(art) {
        const date = formatDate(art.drawing.date)
        return { title: art.drawing.title || 'Bez tytułu', date }
    }

    // dolna strefa bezpieczna (nad przyciskami aplikacji na pionowym wideo)
    lowerY(H, W) { return H > W ? H * 0.70 : H * 0.80 }

    drawCaption(ctx, art, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const { title, date } = this.workTitle(art)
        const y = this.lowerY(H, W)
        const w = Math.min(W * 0.8, 760 * s)
        this.panel(ctx, (W - w) / 2, y - 64 * s, w, 104 * s, alpha)
        this.text(ctx, title, W / 2, y, `500 ${44 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
        if (date) this.text(ctx, date, W / 2, y + 30 * s, `400 ${22 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 3 * s)
    }

    drawNewWork(ctx, art, label, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const { title, date } = this.workTitle(art)
        const y = this.lowerY(H, W)
        const w = Math.min(W * 0.84, 820 * s)
        this.panel(ctx, (W - w) / 2, y - 110 * s, w, 160 * s, alpha)
        this.text(ctx, label, W / 2, y - 62 * s, `500 ${22 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 8 * s)
        this.text(ctx, title, W / 2, y, `500 ${56 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
        if (date) this.text(ctx, date, W / 2, y + 34 * s, `italic 400 ${28 * s}px "Cormorant Garamond", Georgia, serif`, '#6f6a62', alpha)
    }

    drawRoomTitle(ctx, room, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const title = this.gallery.roomTitles[room]
        const count = this.gallery.artworks.filter((a) => a.room === room).length
        const y = H * 0.42
        const w = Math.min(W * 0.86, 900 * s)
        this.panel(ctx, (W - w) / 2, y - 120 * s, w, 190 * s, alpha)
        this.text(ctx, cfg.title.toUpperCase(), W / 2, y - 66 * s, `500 ${22 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 8 * s)
        this.text(ctx, title, W / 2, y + 6 * s, `400 ${78 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
        this.text(ctx, `${count} ${count === 1 ? 'praca' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'prace' : 'prac'}`, W / 2, y + 50 * s, `italic 400 ${30 * s}px "Cormorant Garamond", Georgia, serif`, '#6f6a62', alpha)
    }

    drawGalleryTitle(ctx, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const y = H * 0.42
        const w = Math.min(W * 0.86, 900 * s)
        this.panel(ctx, (W - w) / 2, y - 120 * s, w, 190 * s, alpha)
        this.text(ctx, cfg.subtitle.toUpperCase(), W / 2, y - 66 * s, `500 ${22 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 8 * s)
        this.text(ctx, cfg.title, W / 2, y + 6 * s, `400 ${78 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
        this.text(ctx, 'Wirtualna galeria', W / 2, y + 50 * s, `italic 400 ${30 * s}px "Cormorant Garamond", Georgia, serif`, '#6f6a62', alpha)
    }

    drawRoomLabel(ctx, room, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const y = H > W ? H * 0.16 : H * 0.14
        const w = Math.min(W * 0.8, 760 * s)
        this.panel(ctx, (W - w) / 2, y - 70 * s, w, 106 * s, alpha)
        this.text(ctx, 'SALA', W / 2, y - 34 * s, `500 ${20 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 8 * s)
        this.text(ctx, this.gallery.roomTitles[room], W / 2, y + 14 * s, `500 ${46 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
    }

    drawEndCard(ctx, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#f6f4ef'
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
        const y = H * 0.46
        this.text(ctx, cfg.subtitle.toUpperCase(), W / 2, y - 110 * s, `500 ${24 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 10 * s)
        this.text(ctx, cfg.title, W / 2, y, `400 ${110 * s}px "Cormorant Garamond", Georgia, serif`, '#1f1d1a', alpha)
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#d4cec4'
        ctx.fillRect(W / 2 - 40 * s, y + 46 * s, 80 * s, 2 * s)
        ctx.restore()
        this.text(ctx, 'Wirtualna galeria', W / 2, y + 112 * s, `italic 400 ${36 * s}px "Cormorant Garamond", Georgia, serif`, '#6f6a62', alpha)
        this.text(ctx, window.location.host, W / 2, y + 160 * s, `400 ${26 * s}px "Inter", Arial, sans-serif`, '#1f1d1a', alpha, 'center', 2 * s)
    }

    // ——— odtwarzanie i nagrywanie ———

    async play({ scenario, format, record, options, onProgress, onLoading, renderFrame }) {
        const spec = FORMATS[format] || FORMATS['9:16']
        const scale = Number(new URLSearchParams(window.location.search).get('reelscale')) || 1   // tylko do testów
        const W = Math.round(spec.size[0] * scale / 2) * 2
        const H = Math.round(spec.size[1] * scale / 2) * 2
        this.aspect = W / H
        this.vfov = spec.fov
        const needed = this.build(scenario, options)
        this.missing = await this.gallery.preload(needed, onLoading)

        this.saved = { ratio: this.renderer.getPixelRatio(), fov: this.camera.fov }
        this.renderer.setPixelRatio(1)
        this.renderer.setSize(W, H, false)
        this.camera.aspect = W / H
        this.camera.fov = spec.fov
        this.camera.updateProjectionMatrix()
        this.canvas.width = W
        this.canvas.height = H
        this.canvas.hidden = false
        this.W = W
        this.H = H
        this.time = 0
        this.onProgress = onProgress
        this.applyCamera()
        this.active = true
        this.cancelled = false
        this.recorder = null
        this.chunks = []

        // Nagranie klatka po klatce (WebCodecs → MP4): stały krok czasu, więc film jest
        // płynny niezależnie od mocy komputera. Gdy przeglądarka tego nie umie — nagranie
        // w czasie rzeczywistym (MediaRecorder).
        if (record && window.VideoEncoder) {
            this.offline = true
            const result = await this.recordOffline(renderFrame).catch((error) => {
                console.error('Nagrywanie klatka po klatce nie powiodło się', error)
                return null
            })
            this.offline = false
            this.restore()
            if (result) return result
            return { completed: false, blob: null, error: 'encoder' }
        }
        if (record) {
            const mimeType = pickMime()
            const stream = this.canvas.captureStream(30)
            this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 14_000_000 })
            this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data) }
            this.recorder.start(250)
            this.mime = this.recorder.mimeType || mimeType
        }
        return new Promise((resolve) => { this.finish = resolve })
    }

    async recordOffline(renderFrame) {
        const W = this.W, H = this.H
        let codec = null
        for (const candidate of ['avc1.640028', 'avc1.4d0028', 'avc1.640033', 'avc1.42e028']) {
            const support = await VideoEncoder.isConfigSupported({ codec: candidate, width: W, height: H, bitrate: 12_000_000, framerate: FPS })
            if (support.supported) { codec = candidate; break }
        }
        if (!codec) throw new Error('Brak kodeka H.264 dla tej rozdzielczości')
        const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' })
        let failure = null
        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (error) => { failure = error }
        })
        encoder.configure({ codec, width: W, height: H, bitrate: 12_000_000, framerate: FPS, latencyMode: 'quality' })
        const frames = this.frameCount
        for (let i = 0; i < frames; i++) {
            if (this.cancelled || failure) break
            this.time = i / FPS
            this.applyCamera()
            renderFrame()                       // render sceny 3D w bieżącym ujęciu
            this.composite(this.renderer.domElement)
            const frame = new VideoFrame(this.canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) })
            encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
            frame.close()
            this.onProgress?.(Math.min(this.time, this.total), this.total, i / frames)
            while (encoder.encodeQueueSize > 6) await new Promise((resolve) => setTimeout(resolve, 5))
            if (i % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
        if (failure) throw failure
        if (this.cancelled) { encoder.close(); return { completed: false, blob: null } }
        await encoder.flush()
        encoder.close()
        muxer.finalize()
        return { completed: true, blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), extension: 'mp4' }
    }

    restore() {
        this.gallery.unpin()
        this.active = false
        this.canvas.hidden = true
        this.renderer.setPixelRatio(this.saved.ratio)
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.fov = this.saved.fov
        this.camera.updateProjectionMatrix()
    }

    cancel() {
        if (!this.active) return
        if (this.offline) { this.cancelled = true; return }
        this.stop(false)
    }

    stop(completed) {
        this.restore()
        const done = this.finish
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.onstop = () => {
                const blob = completed ? new Blob(this.chunks, { type: this.mime }) : null
                done({ completed, blob, extension: this.mime.includes('mp4') ? 'mp4' : 'webm' })
            }
            this.recorder.stop()
        } else done({ completed, blob: null })
    }

    update(dt) {
        if (!this.active || this.offline) return
        this.time += Math.min(dt, 0.05)
        this.applyCamera()
        if (this.time >= this.total) this.stop(true)
    }

    // pozycja kamery z policzonej trasy (między klatkami — interpolacja dla podglądu)
    applyCamera() {
        const f = Math.min(this.time * FPS, this.frameCount - 1)
        const i = Math.floor(f)
        const j = Math.min(i + 1, this.frameCount - 1)
        const k = f - i
        const a = this.frames
        const lerp = (n) => a[i * 5 + n] + (a[j * 5 + n] - a[i * 5 + n]) * k
        this.camera.position.set(lerp(0), lerp(1), lerp(2))
        const yaw = a[i * 5 + 3] + wrapAngle(a[j * 5 + 3] - a[i * 5 + 3]) * k
        this.camera.rotation.set(lerp(4), yaw, 0, 'YXZ')
        this.frame = f
        if (!this.offline) this.onProgress?.(Math.min(this.time, this.total), this.total)
    }

    // składanie klatki: obraz 3D + napisy
    composite(webglCanvas) {
        if (!this.active) return
        const ctx = this.ctx
        ctx.drawImage(webglCanvas, 0, 0, this.W, this.H)
        this.drawOverlays(ctx, this.frame, this.W, this.H)
    }
}
