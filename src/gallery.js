import * as THREE from 'three'
import { galleryConfig as cfg } from './config.js'
import { loadTexture, displayTitle, formatDate } from './drawings.js'

// ————————————————————————————————————————————————
// Materiały i geometrie współdzielone
// ————————————————————————————————————————————————

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const unitPlane = new THREE.PlaneGeometry(1, 1)

const makeFloorTexture = () => {
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const tiles = 2
    const tile = size / tiles
    for (let y = 0; y < tiles; y++) {
        for (let x = 0; x < tiles; x++) {
            const shade = 232 + Math.floor(Math.random() * 6)
            ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`
            ctx.fillRect(x * tile, y * tile, tile, tile)
            // delikatne żyłki kamienia
            for (let v = 0; v < 26; v++) {
                ctx.strokeStyle = `rgba(160,150,135,${Math.random() * 0.05})`
                ctx.lineWidth = 1 + Math.random() * 2
                ctx.beginPath()
                const sx = x * tile + Math.random() * tile
                const sy = y * tile + Math.random() * tile
                ctx.moveTo(sx, sy)
                ctx.bezierCurveTo(sx + 60, sy + 20, sx + 90, sy - 30, sx + 160, sy + 10)
                ctx.stroke()
            }
        }
    }
    ctx.strokeStyle = 'rgba(150,142,130,0.55)'
    ctx.lineWidth = 3
    for (let i = 0; i <= tiles; i++) {
        ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(size, i * tile); ctx.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
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
    wall: new THREE.MeshStandardMaterial({ color: 0xf4f2ed, roughness: 0.94 }),
    baseboard: new THREE.MeshStandardMaterial({ color: 0xd6d1c8, roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.2, metalness: 0.0, envMapIntensity: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xe9e8e4, roughness: 1 }),
    lightPanel: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    frame: new THREE.MeshStandardMaterial({ color: cfg.frame.color, roughness: 0.45, metalness: 0.1 }),
    mat: new THREE.MeshStandardMaterial({ color: cfg.frame.mat, roughness: 0.95, emissive: 0xfff8ee, emissiveIntensity: 0.06 }),
    matBevel: new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.9 }),
    fixture: new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.4, metalness: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
    placeholder: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 1 })
}

// ————————————————————————————————————————————————
// Układ sal
// ————————————————————————————————————————————————

const { width: W, depth: D, height: H, wall: T, doorway } = cfg.room
const P = cfg.partition
const SLOTS_PER_ROOM = 16

export const roomCountFor = (count) => Math.max(1, Math.ceil(count / SLOTS_PER_ROOM))

// Kolejność miejsc w sali: ściana północna (→), ścianka działowa od północy (←),
// ścianka od południa (→), ściana południowa (←). Kolejne rysunki zajmują kolejne
// miejsca, więc nowe pliki z Dysku dochodzą na końcu, a starsze nie zmieniają miejsc.
const roomSlots = (room) => {
    const x0 = room * W
    const slots = []
    const wallSpan = W - 2.2
    const wallStep = wallSpan / 5
    const partStep = (P.length - 0.6) / 3
    const north = -D / 2 + T / 2
    const south = D / 2 - T / 2
    for (let k = 0; k < 5; k++) slots.push({ x: x0 + 1.1 + (k + 0.5) * wallStep, z: north, rotY: 0, span: wallStep })
    for (let k = 2; k >= 0; k--) slots.push({ x: x0 + W / 2 - P.length / 2 + 0.3 + (k + 0.5) * partStep, z: -P.thickness / 2, rotY: Math.PI, span: partStep })
    for (let k = 0; k < 3; k++) slots.push({ x: x0 + W / 2 - P.length / 2 + 0.3 + (k + 0.5) * partStep, z: P.thickness / 2, rotY: 0, span: partStep })
    for (let k = 4; k >= 0; k--) slots.push({ x: x0 + 1.1 + (k + 0.5) * wallStep, z: south, rotY: Math.PI, span: wallStep })
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

    build(drawings) {
        const previous = new Map(this.artworks.map((art) => [art.drawing.id, art]))
        const reused = new Set()
        if (this.group) this.scene.remove(this.group)
        const group = new THREE.Group()
        this.group = group
        this.colliders = []
        this.occluders = []
        this.rooms = roomCountFor(drawings.length)
        const length = this.rooms * W

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

        addWall(length / 2, -D / 2, length + T, T)          // północ
        addWall(length / 2, D / 2, length + T, T)           // południe
        addWall(0, 0, T, D)                                 // wejście (zachód)
        addWall(length, 0, T, D)                            // koniec (wschód)
        const doorHeight = 3.1
        for (let r = 1; r < this.rooms; r++) {
            const x = r * W
            const segment = (D - doorway) / 2
            addWall(x, -D / 2 + segment / 2, T, segment)
            addWall(x, D / 2 - segment / 2, T, segment)
            addWall(x, 0, T, doorway, H - doorHeight, doorHeight)
        }
        for (let r = 0; r < this.rooms; r++) {
            addWall(r * W + W / 2, 0, P.length, P.thickness, P.height)
            // górna krawędź ścianki działowej
            addBox(r * W + W / 2, P.height + 0.004, 0, P.length + 0.002, 0.008, P.thickness + 0.002, materials.baseboard, false)
        }

        const floor = new THREE.Mesh(unitPlane, materials.floor)
        floor.rotation.x = -Math.PI / 2
        floor.scale.set(length, D, 1)
        floor.position.set(length / 2, 0, 0)
        floorTexture.repeat.set(length / 1.2, D / 1.2)
        group.add(floor)

        const ceiling = new THREE.Mesh(unitPlane, materials.ceiling)
        ceiling.rotation.x = Math.PI / 2
        ceiling.scale.set(length, D, 1)
        ceiling.position.set(length / 2, H, 0)
        group.add(ceiling)

        // świetliki w suficie
        for (let r = 0; r < this.rooms; r++) {
            for (const px of [-3.4, 0, 3.4]) {
                for (const pz of [-2.6, 2.6]) {
                    const panel = new THREE.Mesh(unitPlane, materials.lightPanel)
                    panel.rotation.x = Math.PI / 2
                    panel.scale.set(2.6, 1.5, 1)
                    panel.position.set(r * W + W / 2 + px, H - 0.005, pz)
                    group.add(panel)
                }
            }
        }

        // napis przy wejściu
        const entrance = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: entranceCanvas(drawings.length), transparent: true }))
        entrance.scale.set(4.6, 4.6 * 720 / 2048, 1)
        entrance.position.set(T / 2 + 0.005, 2.05, 0)
        entrance.rotation.y = Math.PI / 2
        group.add(entrance)

        // ——— rysunki ———
        const slots = []
        for (let r = 0; r < this.rooms; r++) slots.push(...roomSlots(r))
        const fixtureMatrices = []
        const helper = new THREE.Object3D()

        this.artworks = drawings.map((drawing, index) => {
            const slot = slots[index]
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
            helper.position.set(slot.x, H - 0.16, slot.z + (slot.rotY === 0 ? 1.15 : -1.15))
            helper.lookAt(slot.x, cfg.frame.centerHeight, slot.z)
            helper.updateMatrix()
            fixtureMatrices.push(helper.matrix.clone())

            holder.updateMatrixWorld(true)
            const world = new THREE.Vector3()
            art.getWorldPosition(world)
            const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotY)

            art.userData.index = index
            return {
                drawing, index, mesh: art, material: artMaterial, label, holder, world, normal,
                state: old?.state === 'loaded' ? 'loaded' : 'none',
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

        if (fixtureMatrices.length) {
            const fixtureGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.2, 18)
            fixtureGeometry.rotateX(Math.PI / 2)
            const fixtures = new THREE.InstancedMesh(fixtureGeometry, materials.fixture, fixtureMatrices.length)
            fixtureMatrices.forEach((matrix, i) => fixtures.setMatrixAt(i, matrix))
            group.add(fixtures)
        }

        this.scene.add(group)
        this.lastStreamCheck = -1
    }

    // Wczytuje rysunki w pobliżu zwiedzającego, zwalnia pamięć po dalekich.
    stream(cameraPosition, elapsed) {
        if (elapsed - this.lastStreamCheck < 0.35) return
        this.lastStreamCheck = elapsed
        const near = []
        for (const art of this.artworks) {
            const distance = art.world.distanceTo(cameraPosition)
            if (distance < 16) near.push([distance, art])
            if (distance < 7 && !art.labelReady) this.makeLabel(art)
            if (distance > 32 && art.state === 'loaded') this.unload(art)
        }
        near.sort((a, b) => a[0] - b[0])
        for (const [, art] of near) {
            if (this.loading >= 4) break
            if (art.state === 'none') this.load(art)
        }
    }

    async load(art) {
        art.state = 'loading'
        this.loading++
        try {
            const texture = await loadTexture(art.drawing, this.textureWidth)
            texture.colorSpace = THREE.SRGBColorSpace
            texture.anisotropy = Math.min(8, this.maxAnisotropy)
            if (art.state !== 'loading' || !this.artworks.includes(art)) {
                texture.dispose()
                return
            }
            art.material.map = texture
            art.material.color.set(0xffffff)
            art.material.needsUpdate = true
            art.state = 'loaded'
        } catch (error) {
            console.warn('Nie udało się wczytać rysunku', art.drawing.title, error)
            art.state = 'error'
        } finally {
            this.loading--
        }
    }

    unload(art) {
        art.material.map?.dispose()
        art.material.map = null
        art.material.color.set(0xe8e4dc)
        art.material.needsUpdate = true
        art.state = 'none'
    }

    makeLabel(art) {
        art.labelReady = true
        art.label.material = new THREE.MeshBasicMaterial({ map: labelCanvas(art.drawing, art.index + 1) })
        art.label.visible = true
    }

    roomAt(x) {
        return THREE.MathUtils.clamp(Math.floor(x / W), 0, this.rooms - 1)
    }

    get spawn() {
        return { x: 1.7, z: 3.4, yaw: -Math.PI / 2 + 0.42 }
    }
}
