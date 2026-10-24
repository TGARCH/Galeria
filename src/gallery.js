import * as THREE from 'three'
import { galleryConfig as cfg } from './config.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadTexture, displayTitle, formatDate } from './drawings.js'

// ————————————————————————————————————————————————
// Materiały i geometrie współdzielone
// ————————————————————————————————————————————————

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const unitPlane = new THREE.PlaneGeometry(1, 1)

// Podłoga z długich desek dębowych (jasny, matowo olejowany dąb). Tekstura jest
// powtarzalna: obejmuje 2,4 × 2,4 m, deski 20 cm szerokości, przesunięte styki.
export const FLOOR_TILE = 2.4
const makeFloorTexture = () => {
    const size = 2048
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    let seed = 41
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
    const rows = 12
    const rowH = size / rows
    const plank = (x, y, w, h) => {
        const tone = rand()
        const r = 168 + tone * 24, g = 140 + tone * 20, b = 108 + tone * 16
        const base = ctx.createLinearGradient(x, y, x + w, y + h)
        base.addColorStop(0, `rgb(${r},${g},${b})`)
        base.addColorStop(0.5 + (rand() - 0.5) * 0.4, `rgb(${r + 8},${g + 7},${b + 5})`)
        base.addColorStop(1, `rgb(${r - 6},${g - 6},${b - 5})`)
        ctx.fillStyle = base
        ctx.fillRect(x, y, w, h)
        // słoje: długie, lekko falujące linie wzdłuż deski
        ctx.save()
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
        const lines = 26 + Math.floor(rand() * 14)
        for (let i = 0; i < lines; i++) {
            const ly = y + rand() * h
            const amp = 1 + rand() * 4
            const freq = 0.002 + rand() * 0.004
            const phase = rand() * 10
            ctx.strokeStyle = `rgba(${110 + rand() * 30},${78 + rand() * 20},${48},${0.1 + rand() * 0.18})`
            ctx.lineWidth = 0.6 + rand() * 2.2
            ctx.beginPath()
            for (let px = x; px <= x + w; px += 12) {
                const py = ly + Math.sin(px * freq + phase) * amp
                px === x ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
            }
            ctx.stroke()
        }
        // pojedyncze sęczki
        if (rand() > 0.7) {
            const kx = x + rand() * w, ky = y + h * (0.3 + rand() * 0.4)
            const knot = ctx.createRadialGradient(kx, ky, 0, kx, ky, 10 + rand() * 8)
            knot.addColorStop(0, 'rgba(105,72,42,0.45)')
            knot.addColorStop(1, 'rgba(105,72,42,0)')
            ctx.fillStyle = knot
            ctx.fillRect(kx - 20, ky - 20, 40, 40)
        }
        ctx.restore()
        // fugi
        ctx.fillStyle = 'rgba(92,66,40,0.55)'
        ctx.fillRect(x, y, w, 2)
        ctx.fillRect(x, y, 2, h)
    }
    for (let row = 0; row < rows; row++) {
        // deski 1,0–2,0 m; styki przesunięte w każdym rzędzie, z zawijaniem krawędzi
        let x = -rand() * size * 0.6
        const end = x + size
        while (x < end) {
            const w = Math.min(size * (0.42 + rand() * 0.42), end - x)
            for (const offset of [0, size]) plank(x + offset, row * rowH, w, rowH)
            x += w
        }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    return texture
}

const makeGlowTexture = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(128, 118, 0, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(255,246,228,1)')
    gradient.addColorStop(0.45, 'rgba(255,244,224,0.55)')
    gradient.addColorStop(1, 'rgba(255,244,224,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
}

const floorTexture = makeFloorTexture()
const glowTexture = makeGlowTexture()

const materials = {
    wall: new THREE.MeshStandardMaterial({ color: 0xcfcdc9, roughness: 0.94 }),
    baseboard: new THREE.MeshStandardMaterial({ color: 0xb3b0aa, roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xcdc6bd, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.8 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xe9e8e4, roughness: 1 }),
    lightPanel: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    frame: new THREE.MeshStandardMaterial({ color: cfg.frame.color, roughness: 0.45, metalness: 0.1 }),
    mat: new THREE.MeshStandardMaterial({ color: cfg.frame.mat, roughness: 0.95, emissive: 0xfff8ee, emissiveIntensity: 0.06 }),
    matBevel: new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9 }),
    fixture: new THREE.MeshStandardMaterial({ color: 0xf4f3f0, roughness: 0.32, metalness: 0.08 }),
    fixtureInner: new THREE.MeshStandardMaterial({ color: 0x2a2927, roughness: 0.6 }),
    lens: new THREE.MeshBasicMaterial({ color: 0xfff4e2, toneMapped: false }),
    track: new THREE.MeshStandardMaterial({ color: 0xe9e8e4, roughness: 0.4, metalness: 0.1 }),
    glow: new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
    placeholder: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 1 })
}

// ————————————————————————————————————————————————
// Reflektor szynowy (low-poly, rysowany instancjami: kilka wywołań na całą galerię)
// ————————————————————————————————————————————————
// Uchwyt (adapter na szynie + trzpień) obraca się tylko w poziomie,
// głowica dodatkowo pochyla się w stronę obrazu. Oś głowicy = +Z.

const SPOT_DROP = 0.17   // odległość przegubu od sufitu [m]

const spotMountGeometry = (() => {
    const adapter = new THREE.BoxGeometry(0.09, 0.03, 0.04, 1, 1, 1).translate(0, -0.03, 0)
    const stem = new THREE.CylinderGeometry(0.007, 0.007, SPOT_DROP - 0.045, 6, 1, true).translate(0, -0.045 - (SPOT_DROP - 0.045) / 2, 0)
    return mergeGeometries([adapter, stem])
})()

const spotHeadGeometry = (() => {
    const joint = new THREE.SphereGeometry(0.016, 8, 6)
    const yoke = new THREE.BoxGeometry(0.012, 0.012, 0.05).translate(0, 0, 0.012)
    const body = new THREE.CylinderGeometry(0.046, 0.04, 0.15, 16, 1, false).rotateX(Math.PI / 2).translate(0, 0, 0.09)
    const rear = new THREE.CylinderGeometry(0.03, 0.03, 0.035, 10, 1, false).rotateX(Math.PI / 2).translate(0, 0, -0.0)
    return mergeGeometries([joint, yoke, body, rear])
})()

// ciemne wnętrze przy wylocie (cienki pierścień) i świecąca soczewka nieco głębiej
const spotInnerGeometry = new THREE.RingGeometry(0.033, 0.0455, 16, 1).translate(0, 0, 0.1655)
const spotLensGeometry = new THREE.CircleGeometry(0.033, 16).translate(0, 0, 0.158)

// ————————————————————————————————————————————————
// Układ sal
// ————————————————————————————————————————————————

const { width: W, depth: D, height: H, wall: T, doorway } = cfg.room
const P = cfg.partition

// Układ sali. Wszystkie sale leżą na wspólnej osi (z = 0) i są wobec niej symetryczne,
// więc przejścia między salami wypadają zawsze na środku ścian, a oś pozostaje wolna.
// Mała sala: same ściany. Większa: ścianki wolnostojące w pasach po obu stronach osi
// (na przemian północ / południe); przy 3 i więcej ściankach — na przemian wzdłuż i w poprzek.
const HALL_HALF = D / 2          // połowa głębokości sali bez ścianek
const BAND = 7                   // głębokość pasa na jedną ściankę
const PART_Z_LENGTH = 4.4        // ścianka ustawiona w poprzek (wzdłuż osi Z) jest krótsza
const SLOT_STEP = 2.0

// równomiernie rozmieszczone miejsca na odcinku ściany
const slotsAlong = (length) => length < 2 ? 0 : Math.max(1, Math.floor((length - 0.6) / SLOT_STEP))

const planRoom = (room, count) => {
    const westSlots = room > 0
    const x0 = room * W
    const build = (partitionCount) => {
        const bands = Math.ceil(partitionCount / 2)
        const half = HALL_HALF + bands * BAND
        const slots = []
        const add = (x, z, rotY, span) => slots.push({ x, z, rotY, span, room })
        const line = (from, to, n, place) => {
            if (!n) return
            const step = (to - from) / n
            for (let k = 0; k < n; k++) place(from + (k + 0.5) * step, Math.abs(step))
        }
        const inner = half - T / 2
        const doorEdge = doorway / 2
        const sideLen = inner - doorEdge
        const sideN = slotsAlong(sideLen)
        const wallN = 5
        // zachód, odcinek północny (od drzwi ku ścianie) → ściana północna → wschód, odcinek północny
        if (westSlots) line(-doorEdge - 0.2, -inner + 0.3, sideN, (z, span) => add(x0 + T / 2, z, Math.PI / 2, span))
        line(x0 + 1.1, x0 + W - 1.1, wallN, (x, span) => add(x, -inner, 0, span))
        line(-inner + 0.3, -doorEdge - 0.2, sideN, (z, span) => add(x0 + W - T / 2, z, -Math.PI / 2, span))
        // ścianki wolnostojące
        const partitions = []
        for (let i = 0; i < partitionCount; i++) {
            const north = i % 2 === 0
            const band = Math.floor(i / 2)
            const zc = (north ? -1 : 1) * (HALL_HALF + band * BAND + BAND / 2)
            const across = partitionCount >= 3 && i % 2 === 1
            const cx = x0 + W / 2
            if (!across) {
                const len = P.length
                partitions.push({ x: cx, z: zc, sx: len, sz: P.thickness })
                line(cx - len / 2 + 0.3, cx + len / 2 - 0.3, 3, (x, span) => add(x, zc - P.thickness / 2, Math.PI, span))
                line(cx + len / 2 - 0.3, cx - len / 2 + 0.3, 3, (x, span) => add(x, zc + P.thickness / 2, 0, span))
            } else {
                const len = PART_Z_LENGTH
                partitions.push({ x: cx, z: zc, sx: P.thickness, sz: len })
                line(zc - len / 2 + 0.2, zc + len / 2 - 0.2, 2, (z, span) => add(cx - P.thickness / 2, z, -Math.PI / 2, span))
                line(zc + len / 2 - 0.2, zc - len / 2 + 0.2, 2, (z, span) => add(cx + P.thickness / 2, z, Math.PI / 2, span))
            }
        }
        // wschód, odcinek południowy → ściana południowa → zachód, odcinek południowy
        line(doorEdge + 0.2, inner - 0.3, sideN, (z, span) => add(x0 + W - T / 2, z, -Math.PI / 2, span))
        line(x0 + W - 1.1, x0 + 1.1, wallN, (x, span) => add(x, inner, Math.PI, span))
        if (westSlots) line(inner - 0.3, doorEdge + 0.2, sideN, (z, span) => add(x0 + T / 2, z, Math.PI / 2, span))
        return { x0, half, partitions, slots }
    }
    let partitionCount = 0
    let plan = build(0)
    while (plan.slots.length < count) plan = build(++partitionCount)
    return plan
}

// Rozmiar oprawionego rysunku dopasowany do miejsca na ścianie
const frameSize = (drawing, span) => {
    const aspect = drawing.width && drawing.height ? drawing.width / drawing.height : 0.75
    const f = cfg.frame
    const maxOuterW = Math.min(f.maxWidth, span - 0.55)
    const maxOuterH = f.maxHeight
    const measure = (imgH) => {
        const imgW = imgH * aspect
        const mat = f.matRatio * Math.min(imgW, imgH) + 0.035
        return { imgW, imgH, mat, outerW: imgW + 2 * (mat + f.profile), outerH: imgH + 2 * (mat + f.profile) }
    }
    let size = measure(1)
    const scale = Math.min(maxOuterW / size.outerW, maxOuterH / size.outerH, 1.12)
    size = measure(scale)
    // druga iteracja koryguje wpływ stałej części passe-partout
    const fix = Math.min(maxOuterW / size.outerW, maxOuterH / size.outerH, 1)
    return fix < 1 ? measure(scale * fix) : size
}

const labelCanvas = (drawing, number) => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fbfaf7'
    ctx.fillRect(0, 0, 512, 256)
    ctx.fillStyle = '#9a948a'
    ctx.font = '500 30px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.fillText(String(number).padStart(2, '0'), 36, 66)
    ctx.fillStyle = '#1f1d1a'
    ctx.font = '500 44px "Cormorant Garamond", Georgia, serif'
    // zawijanie tytułu do dwóch linii
    if (!drawing.title) ctx.font = 'italic 500 44px "Cormorant Garamond", Georgia, serif'
    const words = displayTitle(drawing).split(' ')
    const lines = ['']
    for (const word of words) {
        const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word
        if (ctx.measureText(test).width > 440 && lines[lines.length - 1]) {
            if (lines.length === 2) { lines[1] += '…'; break }
            lines.push(word)
        } else lines[lines.length - 1] = test
    }
    lines.forEach((line, i) => ctx.fillText(line, 36, 124 + i * 50))
    ctx.fillStyle = '#9a948a'
    ctx.font = '400 26px "Inter", "Helvetica Neue", Arial, sans-serif'
    const date = formatDate(drawing.date)
    ctx.fillText(date ? `${cfg.title}, ${date}` : cfg.title, 36, 226)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

const entranceCanvas = (count) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 2048, 720)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1f1d1a'
    ctx.font = '400 230px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(cfg.title, 1024, 300)
    ctx.fillStyle = '#6f6a62'
    ctx.font = '400 64px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '22px'
    ctx.fillText(cfg.subtitle.toUpperCase(), 1024, 460)
    ctx.letterSpacing = '6px'
    ctx.font = '400 44px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.fillStyle = '#9a948a'
    ctx.fillText(count === 1 ? '1 praca' : `${count} ${count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'prace' : 'prac'}`, 1024, 600)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
}

// Tabliczka informacyjna przy wejściu do sali
const plaqueCanvas = (title, count) => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 432
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fbfaf7'
    ctx.fillRect(0, 0, 768, 432)
    ctx.fillStyle = '#9a948a'
    ctx.font = '500 30px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '8px'
    ctx.fillText('SALA', 56, 92)
    ctx.letterSpacing = '0px'
    ctx.fillStyle = '#1f1d1a'
    ctx.font = '500 76px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(title, 56, 210, 660)
    ctx.fillStyle = '#d8d3ca'
    ctx.fillRect(56, 262, 120, 3)
    ctx.fillStyle = '#6f6a62'
    ctx.font = '400 32px "Inter", "Helvetica Neue", Arial, sans-serif'
    const works = count === 1 ? '1 rysunek' : `${count} ${count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'rysunki' : 'rysunków'}`
    ctx.fillText(works, 56, 336)
    ctx.fillStyle = '#9a948a'
    ctx.font = '400 28px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.fillText(cfg.title, 56, 384)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
}

// ————————————————————————————————————————————————
// Galeria
// ————————————————————————————————————————————————

export class Gallery {
    constructor(scene, renderer) {
        this.scene = scene
        this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy()
        this.group = null
        this.artworks = []
        this.colliders = []
        this.occluders = []
        this.rooms = 0
        this.loading = 0
        this.isTouch = window.matchMedia('(pointer: coarse) and (hover: none)').matches
        this.textureWidth = this.isTouch ? 1024 : 1600
        this.lastStreamCheck = -1
    }

    // rooms: [{ id, title, drawings }] — jedna sala na podfolder Dysku
    build(rooms) {
        const previous = new Map(this.artworks.map((art) => [art.drawing.id, art]))
        const reused = new Set()
        if (this.group) this.scene.remove(this.group)
        const group = new THREE.Group()
        this.group = group
        this.colliders = []
        this.occluders = []
        this.titledMaterials?.forEach((material) => { material.map?.dispose(); material.dispose() })
        this.titledMaterials = []
        if (!rooms.length) rooms = [{ id: 'empty', title: null, drawings: [] }]
        this.rooms = rooms.length
        this.roomTitles = rooms.map((room) => room.title || cfg.subtitle)
        const plans = rooms.map((room, r) => planRoom(r, room.drawings.length))
        const halfOf = (r) => plans[r].half
        const length = this.rooms * W
        const maxHalf = Math.max(...plans.map((plan) => plan.half))

        // ——— architektura ———
        const addBox = (x, y, z, sx, sy, sz, material, collide = true) => {
            const mesh = new THREE.Mesh(unitBox, material)
            mesh.position.set(x, y, z)
            mesh.scale.set(sx, sy, sz)
            group.add(mesh)
            if (collide) {
                this.colliders.push({ x, z, halfX: sx / 2, halfZ: sz / 2 })
                this.occluders.push(mesh)
            }
            return mesh
        }
        const addWall = (x, z, sx, sz, height = H, y0 = 0) => {
            addBox(x, y0 + height / 2, z, sx, height, sz, materials.wall, y0 === 0)
            if (y0 === 0) addBox(x, 0.045, z, sx + (sx > sz ? 0 : 0.02), 0.09, sz + (sz > sx ? 0 : 0.02), materials.baseboard, false)
        }
        // ściana wzdłuż osi Z od za do zb
        const wallAlongZ = (x, za, zb, height, y0) => addWall(x, (za + zb) / 2, T, zb - za, height, y0)
        const addPlaque = (texture, x, z, rotY) => {
            const material = new THREE.MeshBasicMaterial({ map: texture })
            this.titledMaterials.push(material)
            const plaque = new THREE.Mesh(unitPlane, material)
            plaque.scale.set(0.56, 0.56 * 432 / 768, 1)
            plaque.position.set(x, 1.5, z)
            plaque.rotation.y = rotY
            group.add(plaque)
        }

        // ściany poprzeczne: wejście, przejścia na środku ścian, koniec
        const doorHeight = 3.1
        for (let r = 0; r <= this.rooms; r++) {
            const x = r * W
            const reach = Math.max(r > 0 ? halfOf(r - 1) : 0, r < this.rooms ? halfOf(r) : 0)
            if (r === 0 || r === this.rooms) {
                wallAlongZ(x, -reach, reach)
            } else {
                wallAlongZ(x, -reach, -doorway / 2)
                wallAlongZ(x, doorway / 2, reach)
                wallAlongZ(x, -doorway / 2, doorway / 2, H - doorHeight, doorHeight)
            }
        }
        for (let r = 0; r < this.rooms; r++) {
            const { x0, half, partitions } = plans[r]
            addWall(x0 + W / 2, -half, W + T, T)                          // północ
            addWall(x0 + W / 2, half, W + T, T)                           // południe
            for (const part of partitions) {
                addWall(part.x, part.z, part.sx, part.sz, P.height)
                addBox(part.x, P.height + 0.004, part.z, part.sx + 0.002, 0.008, part.sz + 0.002, materials.baseboard, false)
            }
            // świetliki: rzędy co ok. 5 m
            const rows = Math.max(2, Math.round((2 * half - 5) / 5) + 1)
            for (let i = 0; i < rows; i++) {
                const pz = -half + 2.5 + i * (2 * half - 5) / (rows - 1)
                for (const px of [-3.4, 0, 3.4]) {
                    const panel = new THREE.Mesh(unitPlane, materials.lightPanel)
                    panel.rotation.x = Math.PI / 2
                    panel.scale.set(2.6, 1.5, 1)
                    panel.position.set(x0 + W / 2 + px, H - 0.005, pz)
                    group.add(panel)
                }
            }
            // tabliczka z nazwą sali obok wejścia (od strony nadchodzącego)
            const plaque = plaqueCanvas(this.roomTitles[r], rooms[r].drawings.length)
            if (r > 0) addPlaque(plaque, x0 - T / 2 - 0.004, doorway / 2 + 0.6, -Math.PI / 2)
            else addPlaque(plaque, T / 2 + 0.004, 2.75, Math.PI / 2)
        }

        // podłoga i sufit: jeden prostokąt obejmujący wszystkie sale
        const floor = new THREE.Mesh(unitPlane, materials.floor)
        floor.rotation.x = -Math.PI / 2
        floor.scale.set(length, 2 * maxHalf, 1)
        floor.position.set(length / 2, 0, 0)
        floorTexture.repeat.set(length / FLOOR_TILE, 2 * maxHalf / FLOOR_TILE)
        group.add(floor)

        const ceiling = new THREE.Mesh(unitPlane, materials.ceiling)
        ceiling.rotation.x = Math.PI / 2
        ceiling.scale.set(length, 2 * maxHalf, 1)
        ceiling.position.set(length / 2, H, 0)
        group.add(ceiling)

        // napis przy wejściu
        const total = rooms.reduce((sum, room) => sum + room.drawings.length, 0)
        const entranceMaterial = new THREE.MeshBasicMaterial({ map: entranceCanvas(total), transparent: true })
        this.titledMaterials.push(entranceMaterial)
        const entrance = new THREE.Mesh(unitPlane, entranceMaterial)
        entrance.scale.set(4.0, 4.0 * 720 / 2048, 1)
        entrance.position.set(T / 2 + 0.005, 2.1, 0)
        entrance.rotation.y = Math.PI / 2
        group.add(entrance)

        // ——— rysunki ———
        const placed = rooms.flatMap((room, r) => {
            const slots = plans[r].slots
            return room.drawings.map((drawing, i) => ({ drawing, slot: slots[i], number: i + 1 }))
        })
        const spots = []

        this.artworks = placed.map(({ drawing, slot, number }, index) => {
            const size = frameSize(drawing, slot.span)
            const holder = new THREE.Group()
            holder.position.set(slot.x, cfg.frame.centerHeight, slot.z)
            holder.rotation.y = slot.rotY
            group.add(holder)

            const f = cfg.frame
            const glow = new THREE.Mesh(unitPlane, materials.glow)
            glow.scale.set(size.outerW * 1.9 + 0.6, size.outerH * 1.75 + 0.6, 1)
            glow.position.set(0, 0.12, 0.002)
            holder.add(glow)

            const frame = new THREE.Mesh(unitBox, materials.frame)
            frame.scale.set(size.outerW, size.outerH, f.depth)
            frame.position.z = f.depth / 2 + 0.004
            holder.add(frame)

            const mat = new THREE.Mesh(unitPlane, materials.mat)
            mat.scale.set(size.outerW - 2 * f.profile, size.outerH - 2 * f.profile, 1)
            mat.position.z = f.depth + 0.0045
            holder.add(mat)

            const bevel = new THREE.Mesh(unitPlane, materials.matBevel)
            bevel.scale.set(size.imgW + 0.008, size.imgH + 0.008, 1)
            bevel.position.z = f.depth + 0.0052
            holder.add(bevel)

            const old = previous.get(drawing.id)
            const artMaterial = old?.material ?? new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.92 })
            if (old) reused.add(drawing.id)
            const art = new THREE.Mesh(unitPlane, artMaterial)
            art.scale.set(size.imgW, size.imgH, 1)
            art.position.z = f.depth + 0.006
            holder.add(art)

            const label = new THREE.Mesh(unitPlane, materials.placeholder)
            label.scale.set(0.24, 0.12, 1)
            label.position.set(size.outerW / 2 + 0.24, -0.32, 0.006)
            label.visible = false
            holder.add(label)

            // oprawa reflektora na suficie
            const nx = Math.round(Math.sin(slot.rotY)), nz = Math.round(Math.cos(slot.rotY))
            spots.push({ room: slot.room, x: slot.x + nx * 1.15, z: slot.z + nz * 1.15, alongX: nz !== 0, target: new THREE.Vector3(slot.x, cfg.frame.centerHeight, slot.z) })

            holder.updateMatrixWorld(true)
            const world = new THREE.Vector3()
            art.getWorldPosition(world)
            const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotY)

            art.userData.index = index
            return {
                drawing, index, number, room: slot.room, mesh: art, material: artMaterial, label, holder, world, normal,
                level: old?.level ?? 0, loadingLevel: 0, failures: 0, retryAt: 0,
                labelReady: false
            }
        })

        for (const [id, art] of previous) {
            if (!reused.has(id)) {
                art.material.map?.dispose()
                art.material.dispose()
            }
            if (art.label.material !== materials.placeholder) {
                art.label.material.map?.dispose()
                art.label.material.dispose()
            }
        }

        if (spots.length) this.addSpots(group, spots)

        this.scene.add(group)
        this.lastStreamCheck = -1
    }

    addSpots(group, spots) {
        const count = spots.length
        const mounts = new THREE.InstancedMesh(spotMountGeometry, materials.fixture, count)
        const heads = new THREE.InstancedMesh(spotHeadGeometry, materials.fixture, count)
        const inners = new THREE.InstancedMesh(spotInnerGeometry, materials.fixtureInner, count)
        const lenses = new THREE.InstancedMesh(spotLensGeometry, materials.lens, count)
        const o = new THREE.Object3D()
        spots.forEach((spot, i) => {
            const facing = Math.atan2(spot.target.x - spot.x, spot.target.z - spot.z)
            o.position.set(spot.x, H, spot.z)
            o.rotation.set(0, facing, 0)
            o.updateMatrix()
            mounts.setMatrixAt(i, o.matrix)
            o.position.set(spot.x, H - SPOT_DROP, spot.z)
            o.lookAt(spot.target)
            o.updateMatrix()
            heads.setMatrixAt(i, o.matrix)
            inners.setMatrixAt(i, o.matrix)
            lenses.setMatrixAt(i, o.matrix)
        })
        group.add(mounts, heads, inners, lenses)

        // szyny: jedna na każdy ciąg reflektorów w sali
        const runs = new Map()
        for (const spot of spots) {
            const line = spot.alongX ? spot.z : spot.x
            const pos = spot.alongX ? spot.x : spot.z
            const key = `${spot.room}:${spot.alongX ? 'x' : 'z'}:${line.toFixed(2)}`
            const run = runs.get(key) ?? { alongX: spot.alongX, line, min: Infinity, max: -Infinity }
            run.min = Math.min(run.min, pos)
            run.max = Math.max(run.max, pos)
            runs.set(key, run)
        }
        const tracks = new THREE.InstancedMesh(unitBox, materials.track, runs.size)
        let t = 0
        for (const run of runs.values()) {
            const length = run.max - run.min + 0.9
            const mid = (run.min + run.max) / 2
            if (run.alongX) {
                o.position.set(mid, H - 0.012, run.line)
                o.scale.set(length, 0.024, 0.036)
            } else {
                o.position.set(run.line, H - 0.012, mid)
                o.scale.set(0.036, 0.024, length)
            }
            o.rotation.set(0, 0, 0)
            o.updateMatrix()
            tracks.setMatrixAt(t++, o.matrix)
            o.scale.set(1, 1, 1)
        }
        group.add(tracks)
    }

    // Doczytywanie w dwóch krokach: najpierw lekki podgląd (szybko widać wszystkie
    // prace w sali), potem pełna rozdzielczość dla rysunków z bliska.
    // Nieudane wczytania są ponawiane, a dalekie tekstury zwalniane.
    stream(cameraPosition, elapsed) {
        if (elapsed - this.lastStreamCheck < 0.25) return
        this.lastStreamCheck = elapsed
        const now = performance.now()
        const wanted = []
        for (const art of this.artworks) {
            const distance = art.world.distanceTo(cameraPosition)
            if (distance < 8 && !art.labelReady) this.makeLabel(art)
            const target = distance < 9 ? 2 : distance < 30 ? 1 : 0
            if (art.level > 0 && distance > 40) this.unload(art)
            if (!art.loadingLevel && art.level < target && now >= art.retryAt) wanted.push([target === 2 ? distance - 100 : distance, art, target])
        }
        wanted.sort((a, b) => a[0] - b[0])
        for (const [, art, target] of wanted) {
            if (this.loading >= 6) break
            this.load(art, art.level === 0 ? 1 : target)
        }
    }

    async load(art, level) {
        art.loadingLevel = level
        this.loading++
        try {
            const width = level === 1 ? 480 : this.textureWidth
            const texture = await loadTexture(art.drawing, width)
            texture.colorSpace = THREE.SRGBColorSpace
            texture.anisotropy = Math.min(8, this.maxAnisotropy)
            if (!this.artworks.includes(art) || art.loadingLevel !== level || level <= art.level) {
                texture.dispose()
                return
            }
            art.material.map?.dispose()
            art.material.map = texture
            art.material.color.set(0xffffff)
            art.material.needsUpdate = true
            art.level = level
            art.failures = 0
        } catch (error) {
            art.failures++
            art.retryAt = performance.now() + Math.min(30000, 2000 * 2 ** art.failures)
            console.warn('Nie udało się wczytać rysunku — ponowię', art.drawing.id, error)
        } finally {
            art.loadingLevel = 0
            this.loading--
        }
    }

    unload(art) {
        art.material.map?.dispose()
        art.material.map = null
        art.material.color.set(0xe8e4dc)
        art.material.needsUpdate = true
        art.level = 0
        art.loadingLevel = 0
    }

    makeLabel(art) {
        art.labelReady = true
        art.label.material = new THREE.MeshBasicMaterial({ map: labelCanvas(art.drawing, art.number) })
        art.label.visible = true
    }

    roomAt(x) {
        return THREE.MathUtils.clamp(Math.floor(x / W), 0, this.rooms - 1)
    }

    get spawn() {
        return { x: 1.5, z: 0, yaw: -Math.PI / 2 }
    }
}
