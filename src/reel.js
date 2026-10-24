import * as THREE from 'three'
import { Grid } from './tour.js'
import { formatDate } from './drawings.js'
import { galleryConfig as cfg } from './config.js'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

// ————————————————————————————————————————————————
// Rolki do mediów społecznościowych — nagrywane w przeglądarce
// ————————————————————————————————————————————————
// Kamera odgrywa zaplanowany scenariusz, obraz 3D jest składany z napisami na
// osobnym płótnie 2D w docelowej rozdzielczości i nagrywany (MediaRecorder).

export const FORMATS = {
    '9:16': { size: [1080, 1920], fov: 64, label: 'Pionowy 9:16 — Reels, Shorts, TikTok' },
    '4:5': { size: [1080, 1350], fov: 58, label: 'Post 4:5 — Instagram, Facebook' },
    '16:9': { size: [1920, 1080], fov: 52, label: 'Poziomy 16:9 — YouTube' }
}

export const SCENARIOS = {
    newWork: 'Nowa praca (ok. 10 s)',
    room: 'Przegląd sali (ok. 20–25 s)',
    invitation: 'Zaproszenie do galerii (ok. 25–30 s)'
}

const EYE = 1.6
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t) => Math.min(Math.max(t, 0), 1)
const fade = (u, a, b, c, d) => u < a ? 0 : u < b ? (u - a) / (b - a) : u < c ? 1 : u < d ? 1 - (u - c) / (d - c) : 0

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
        this.lookSmoothed = new THREE.Vector3()
    }

    // ——— geometria ujęć ———

    side(art) { return new THREE.Vector3(art.normal.z, 0, -art.normal.x) }

    viewpoint(art, distance, lateral = 0) {
        for (let d = distance; d >= 1.1; d -= 0.15) {
            const p = art.world.clone().addScaledVector(art.normal, d).addScaledVector(this.side(art), lateral)
            if (!this.grid || this.grid.freeAt(p.x, p.z)) return new THREE.Vector3(p.x, EYE, p.z)
        }
        return art.world.clone().addScaledVector(art.normal, 1.2).setY(EYE)
    }

    travelCurve(from, to) {
        const points = this.grid?.path(from.x, from.z, to.x, to.z) || [[from.x, from.z], [to.x, to.z]]
        const vectors = points.map(([x, z]) => new THREE.Vector3(x, EYE, z))
        if (vectors.length === 2) vectors.splice(1, 0, vectors[0].clone().lerp(vectors[1], 0.5))
        const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5)
        return { curve, length: Math.max(curve.getLength(), 0.01) }
    }

    // ujęcie: dojazd po prostej (dolly) z patrzeniem na pracę
    dolly(art, from, to, duration, overlay) {
        return { duration, overlay, art, camera: (u) => ({ pos: from.clone().lerp(to, ease(u)), look: art.world }) }
    }

    // ujęcie: przejście do pracy (omijając ściany), pod koniec wzrok na pracę
    travel(from, art, to, speed, overlay) {
        const { curve, length } = this.travelCurve(from, to)
        const duration = Math.max(1.4, length / speed + 0.6)
        return {
            duration, overlay, art,
            camera: (u) => {
                const e = ease(u)
                const pos = curve.getPointAt(e)
                const ahead = curve.getPointAt(Math.min(e + 0.1, 1)).setY(EYE - 0.05)
                const look = ahead.distanceTo(pos) > 0.05 ? ahead.lerp(art.world, THREE.MathUtils.smoothstep(u, 0.45, 0.9)) : art.world.clone()
                return { pos, look }
            }
        }
    }

    hold(art, at, duration, overlay, push = 0.25) {
        const to = at.clone().addScaledVector(art.normal, -push)
        return { duration, overlay, art, camera: (u) => ({ pos: at.clone().lerp(to, easeOut(u)), look: art.world }) }
    }

    // ——— scenariusze ———

    build(scenario, options) {
        this.grid = this.gallery.bounds ? new Grid(this.gallery.bounds, this.gallery.colliders) : null
        const arts = this.gallery.artworks
        const shots = []
        const caption = (art) => (ctx, u, W, H) => this.drawCaption(ctx, art, fade(u, 0.15, 0.35, 0.85, 1), W, H)

        if (scenario === 'newWork') {
            const art = arts.find((a) => a.drawing.id === options.artId) || arts[arts.length - 1]
            const a = this.viewpoint(art, 4.6, 0.9)
            const b = this.viewpoint(art, 2.8, 0.3)
            const c = this.viewpoint(art, 1.5, -0.15)
            shots.push(this.dolly(art, a, b, 3.8, (ctx, u, W, H) => this.drawNewWork(ctx, art, fade(u, 0.25, 0.55, 2, 3), W, H)))
            shots.push(this.dolly(art, b, c, 3.8, (ctx, u, W, H) => this.drawNewWork(ctx, art, fade(u, -1, 0, 0.7, 1), W, H)))
            shots.push(this.hold(art, c, 2.8, null, 0.2))
        }

        if (scenario === 'room') {
            const room = Number(options.room) || 0
            const inRoom = arts.filter((a) => a.room === room)
            const count = Math.min(6, inRoom.length)
            const chosen = Array.from({ length: count }, (_, i) => inRoom[Math.floor((i + 0.5) * inRoom.length / count)])
            const x0 = room * cfg.room.width
            const doorZ = room > 0 ? this.gallery.doorZ[room] : 0
            let pos = new THREE.Vector3(x0 + 1.4, EYE, doorZ)
            const centerLook = new THREE.Vector3(x0 + cfg.room.width * 0.75, EYE, 0)
            const intro = pos.clone().add(new THREE.Vector3(1.6, 0, 0))
            shots.push({
                duration: 2.6, art: null,
                camera: (u) => ({ pos: pos.clone().lerp(intro, ease(u)), look: centerLook }),
                overlay: (ctx, u, W, H) => this.drawRoomTitle(ctx, room, fade(u, 0.05, 0.3, 0.8, 1), W, H)
            })
            pos = intro
            for (const art of chosen) {
                const at = this.viewpoint(art, 2.5, 0.2)
                shots.push(this.travel(pos, art, at, 2.8, null))
                shots.push(this.hold(art, at, 1.5, caption(art)))
                pos = at.clone().addScaledVector(art.normal, -0.25)
            }
        }

        if (scenario === 'invitation') {
            const spawn = this.gallery.spawn
            const titleLook = new THREE.Vector3(0, 2.1, 0)
            const start = new THREE.Vector3(7.5, EYE, 0.4)
            const near = new THREE.Vector3(4.2, EYE, 0)
            shots.push({ duration: 3.2, art: null, camera: (u) => ({ pos: start.clone().lerp(near, ease(u)), look: titleLook }) })
            let pos = near
            const rooms = this.gallery.rooms
            const pickRooms = Array.from({ length: Math.min(4, rooms) }, (_, i) => Math.floor((i + 0.5) * rooms / Math.min(4, rooms)))
            for (const room of pickRooms) {
                const inRoom = arts.filter((a) => a.room === room)
                if (!inRoom.length) continue
                const art = inRoom[Math.floor(inRoom.length / 2)]
                const at = this.viewpoint(art, 2.6, 0.25)
                shots.push(this.travel(pos, art, at, 3.4, null))
                shots.push(this.hold(art, at, 1.7, (ctx, u, W, H) => {
                    this.drawRoomLabel(ctx, room, fade(u, 0.1, 0.3, 0.85, 1), W, H)
                }))
                pos = at.clone().addScaledVector(art.normal, -0.25)
            }
            void spawn
        }

        // plansza końcowa
        const last = shots[shots.length - 1]
        const endFrom = last.camera(1)
        shots.push({
            duration: 3.0, art: last.art,
            camera: (u) => ({ pos: endFrom.pos.clone().addScaledVector(new THREE.Vector3().subVectors(endFrom.look, endFrom.pos).setY(0).normalize(), 0.3 * easeOut(u)), look: endFrom.look }),
            overlay: (ctx, u, W, H) => this.drawEndCard(ctx, clamp01(u / 0.35), W, H)
        })

        let t = 0
        for (const shot of shots) { shot.start = t; t += shot.duration }
        this.shots = shots
        this.total = t
        return shots.map((shot) => shot.art).filter(Boolean)
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

    drawNewWork(ctx, art, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const { title, date } = this.workTitle(art)
        const y = this.lowerY(H, W)
        const w = Math.min(W * 0.84, 820 * s)
        this.panel(ctx, (W - w) / 2, y - 110 * s, w, 160 * s, alpha)
        this.text(ctx, 'NOWA PRACA', W / 2, y - 62 * s, `500 ${22 * s}px "Inter", Arial, sans-serif`, '#8c867c', alpha, 'center', 8 * s)
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

    drawRoomLabel(ctx, room, alpha, W, H) {
        if (alpha <= 0) return
        const s = this.scale(W)
        const y = this.lowerY(H, W)
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

    async play({ scenario, format, record, options, onProgress, renderFrame }) {
        const spec = FORMATS[format] || FORMATS['9:16']
        const scale = Number(new URLSearchParams(window.location.search).get('reelscale')) || 1   // tylko do testów
        const W = Math.round(spec.size[0] * scale / 2) * 2
        const H = Math.round(spec.size[1] * scale / 2) * 2
        const needed = this.build(scenario, options)
        await Promise.race([this.gallery.preload(needed), new Promise((resolve) => setTimeout(resolve, 20000))])

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
        const first = this.shots[0].camera(0)
        this.camera.position.copy(first.pos)
        this.lookSmoothed.copy(first.look)
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
        const FPS = 30
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
        const frames = Math.ceil((this.total + 0.2) * FPS)
        for (let i = 0; i < frames; i++) {
            if (this.cancelled || failure) break
            this.time = i / FPS
            this.applyCamera(1 / FPS)
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
        this.applyCamera(dt)
        if (this.time >= this.total + 0.15) this.stop(true)
    }

    applyCamera(dt) {
        const t = Math.min(this.time, this.total)
        const shot = this.shots.find((s) => t >= s.start && t < s.start + s.duration) || this.shots[this.shots.length - 1]
        const u = clamp01((t - shot.start) / shot.duration)
        const { pos, look } = shot.camera(u)
        this.camera.position.copy(pos)
        this.lookSmoothed.lerp(look, 1 - Math.exp(-Math.min(dt, 0.05) * 5))
        this.camera.lookAt(this.lookSmoothed)
        this.currentShot = shot
        this.currentU = u
        if (!this.offline) this.onProgress?.(t, this.total)
    }

    // składanie klatki: obraz 3D + napisy
    composite(webglCanvas) {
        if (!this.active) return
        const ctx = this.ctx
        ctx.drawImage(webglCanvas, 0, 0, this.W, this.H)
        this.currentShot?.overlay?.(ctx, this.currentU, this.W, this.H)
    }
}
