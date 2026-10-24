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

// Każda sala ma 12 m szerokości. Gdy ma więcej niż 16 rysunków, rozrasta się w głąb
// o kolejne moduły 12 × 10 m (każdy z własną ścianką działową i miejscami na ścianach
// bocznych). Przejścia między salami są w pierwszym module, przy ścianie północnej.
const SLOTS_FIRST_MODULE = 16
const SLOTS_NEXT_MODULE = 12
const DOOR_Z = -D / 2 + 2.5
export const modulesFor = (count) => 1 + Math.ceil(Math.max(0, count - SLOTS_FIRST_MODULE) / SLOTS_NEXT_MODULE)

// Kolejność miejsc: ściana północna (→), w każdym module ścianka działowa (← od północy,
// → od południa) i w modułach dalszych ściany boczne (zachodnia ↓, wschodnia ↑),
// na końcu ściana południowa (←). Nowe pliki trafiają na kolejne wolne miejsca.
const roomSlots = (room, modules) => {
    const x0 = room * W
    const z0 = -D / 2
    const slots = []
    const add = (x, z, rotY, span) => slots.push({ x, z, rotY, span, room })
    const wallStep = (W - 2.2) / 5
    const partStep = (P.length - 0.6) / 3
    const sideStep = (D - 1.6) / 3
    for (let k = 0; k < 5; k++) add(x0 + 1.1 + (k + 0.5) * wallStep, z0 + T / 2, 0, wallStep)
    for (let m = 0; m < modules; m++) {
        const zc = z0 + m * D + D / 2
        const px = x0 + W / 2 - P.length / 2 + 0.3
        for (let k = 2; k >= 0; k--) add(px + (k + 0.5) * partStep, zc - P.thickness / 2, Math.PI, partStep)
        for (let k = 0; k < 3; k++) add(px + (k + 0.5) * partStep, zc + P.thickness / 2, 0, partStep)
        if (m > 0) {
            const top = z0 + m * D + 0.8
            for (let k = 0; k < 3; k++) add(x0 + T / 2, top + (k + 0.5) * sideStep, Math.PI / 2, sideStep)
            for (let k = 2; k >= 0; k--) add(x0 + W - T / 2, top + (k + 0.5) * sideStep, -Math.PI / 2, sideStep)
        }
    }
    const south = z0 + modules * D - T / 2
    for (let k = 4; k >= 0; k--) add(x0 + 1.1 + (k + 0.5) * wallStep, south, Math.PI, wallStep)
    return slots
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

const roomTitleCanvas = (title) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 384
    const ctx = canvas.getContext('2d')
    ctx.textAlign = 'center'
    ctx.fillStyle = '#2a2723'
    ctx.font = '400 170px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(title, 1024, 240, 1960)
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
        const modules = rooms.map((room) => modulesFor(room.drawings.length))
        const depthOf = (r) => modules[r] * D
        const length = this.rooms * W
        const maxDepth = Math.max(...modules) * D
        const z0 = -D / 2

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

        addWall(length / 2, z0, length + T, T)                         // północ — wspólna dla wszystkich sal
        const doorHeight = 3.1
        for (let r = 0; r <= this.rooms; r++) {
            const x = r * W
            const zEnd = z0 + Math.max(r > 0 ? depthOf(r - 1) : 0, r < this.rooms ? depthOf(r) : 0)
            if (r === 0 || r === this.rooms) {
                wallAlongZ(x, z0, zEnd)
            } else {
                wallAlongZ(x, z0, DOOR_Z - doorway / 2)
                wallAlongZ(x, DOOR_Z + doorway / 2, zEnd)
                wallAlongZ(x, DOOR_Z - doorway / 2, DOOR_Z + doorway / 2, H - doorHeight, doorHeight)
            }
        }
        for (let r = 0; r < this.rooms; r++) {
            const x0 = r * W
            addWall(x0 + W / 2, z0 + depthOf(r), W + T, T)                // południe tej sali
            for (let m = 0; m < modules[r]; m++) {
                const zc = z0 + m * D + D / 2
                addWall(x0 + W / 2, zc, P.length, P.thickness, P.height)
                addBox(x0 + W / 2, P.height + 0.004, zc, P.length + 0.002, 0.008, P.thickness + 0.002, materials.baseboard, false)
                // świetliki
                for (const px of [-3.4, 0, 3.4]) {
                    for (const pz of [-2.6, 2.6]) {
                        const panel = new THREE.Mesh(unitPlane, materials.lightPanel)
                        panel.rotation.x = Math.PI / 2
                        panel.scale.set(2.6, 1.5, 1)
                        panel.position.set(x0 + W / 2 + px, H - 0.005, zc + pz)
                        group.add(panel)
                    }
                }
            }
            // nazwa sali nad wejściem, czytelna z poprzedniej sali
            if (r > 0) {
                const material = new THREE.MeshBasicMaterial({ map: roomTitleCanvas(this.roomTitles[r]), transparent: true })
                this.titledMaterials.push(material)
                const sign = new THREE.Mesh(unitPlane, material)
                sign.scale.set(3.4, 3.4 * 384 / 2048, 1)
                sign.position.set(x0 - T / 2 - 0.006, (doorHeight + H) / 2, DOOR_Z)
                sign.rotation.y = -Math.PI / 2
                group.add(sign)
            }
        }

        // podłoga i sufit: jeden prostokąt obejmujący wszystkie sale
        const floor = new THREE.Mesh(unitPlane, materials.floor)
        floor.rotation.x = -Math.PI / 2
        floor.scale.set(length, maxDepth, 1)
        floor.position.set(length / 2, 0, z0 + maxDepth / 2)
        floorTexture.repeat.set(length / FLOOR_TILE, maxDepth / FLOOR_TILE)
        group.add(floor)

        const ceiling = new THREE.Mesh(unitPlane, materials.ceiling)
        ceiling.rotation.x = Math.PI / 2
        ceiling.scale.set(length, maxDepth, 1)
        ceiling.position.set(length / 2, H, z0 + maxDepth / 2)
        group.add(ceiling)

        // napis przy wejściu
        const total = rooms.reduce((sum, room) => sum + room.drawings.length, 0)
        const entranceMaterial = new THREE.MeshBasicMaterial({ map: entranceCanvas(total), transparent: true })
        this.titledMaterials.push(entranceMaterial)
        const entrance = new THREE.Mesh(unitPlane, entranceMaterial)
        entrance.scale.set(4.6, 4.6 * 720 / 2048, 1)
        entrance.position.set(T / 2 + 0.005, 2.05, 0)
        entrance.rotation.y = Math.PI / 2
        group.add(entrance)

        // ——— rysunki ———
        const placed = rooms.flatMap((room, r) => {
            const slots = roomSlots(r, modules[r])
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
        return { x: 1.4, z: DOOR_Z + 0.6, yaw: -Math.PI / 2 + 0.3 }
    }
}
