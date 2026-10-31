import * as THREE from 'three'
import { galleryConfig as cfg, shadowTest } from './config.js'
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

// Miękki cień: ciemny prostokąt zajmujący środkowe 80% tekstury, rozmyty ku krawędziom
// (test cieni, ?cienie). Rozciągany na wymiar rzucającego cień elementu.
const SHADOW_CORE = 0.8
const makeSoftShadowTexture = () => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const pad = size * (1 - SHADOW_CORE) / 2
    // rozmycie przez cień kształtu narysowanego poza płótnem — działa w każdej przeglądarce
    ctx.shadowColor = 'rgba(0,0,0,1)'
    ctx.shadowBlur = pad * 0.9
    ctx.shadowOffsetX = size * 2
    ctx.fillStyle = '#000'
    ctx.fillRect(pad - size * 2, pad, size - 2 * pad, size - 2 * pad)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

// Cień kontaktowy: gradient od ciemnego (górna krawędź tekstury) do przezroczystego,
// z łagodnym, wykładniczym zanikiem (test cieni, ?cienie)
const makeContactTexture = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    for (let k = 0; k <= 10; k++) gradient.addColorStop(k / 10, `rgba(0,0,0,${Math.exp(-k / 10 * 3.2).toFixed(3)})`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 4, 256)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

const floorTexture = makeFloorTexture()
const glowTexture = makeGlowTexture()
const softShadowTexture = shadowTest.decals ? makeSoftShadowTexture() : null
const contactTexture = shadowTest.ao ? makeContactTexture() : null
const CONTACT_FLOOR = 1.1   // zasięg cienia kontaktowego na podłodze [m]
const CONTACT_WALL = 0.8    // i na ścianie [m]

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
    placeholder: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 1 }),
    // test cieni (?cienie)
    frameShadow: new THREE.MeshBasicMaterial({ map: softShadowTexture, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }),
    floorShadow: new THREE.MeshBasicMaterial({ map: softShadowTexture, color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    contactFloor: new THREE.MeshBasicMaterial({ map: contactTexture, color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    contactWall: new THREE.MeshBasicMaterial({ map: contactTexture, color: 0x000000, transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
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
// (zawsze parami: północ + południe); przy 4 i więcej — na przemian wzdłuż i w poprzek.
const HALL_HALF = D / 2          // połowa głębokości sali bez ścianek
// W sali ze ściankami wolny pas wokół osi jest węższy (±2 m zamiast ±5 m), żeby
// środek nie był pustym placem. Pierwsze ścianki stoją równolegle do osi, pośrodku
// sali, z dala od ścian z przejściami — droga między przejściami pozostaje wolna.
const CORE_HALF = 2
// dodatkowy odstęp skrajnych ścianek od ściany szczytowej sali
const END_EXTRA = 1
const BAND = 7                   // głębokość pasa na jedną ściankę
const PART_Z_LENGTH = 4.4        // ścianka ustawiona w poprzek (wzdłuż osi Z) jest krótsza
const SLOT_STEP = 2.0

// równomiernie rozmieszczone miejsca na odcinku ściany
const slotsAlong = (length) => length < 2 ? 0 : Math.max(1, Math.floor((length - 0.6) / SLOT_STEP))

// doors: { west, east } — położenie przejścia (z) na ścianie zachodniej / wschodniej,
// null = ściana bez przejścia. Zachodnia ściana pierwszej sali jest zarezerwowana na tytuł galerii.
const NEXT_SIGN_GAP = 1.5        // miejsce na napis „Następna…” obok przejścia
const TITLE_GAP = 3.0            // miejsce na nazwę sali (zamiast jednej pracy)
const planRoom = (room, count, doors) => {
    const westSlots = room > 0
    const x0 = room * W
    const build = (partitionCount) => {
        const bands = Math.ceil(partitionCount / 2)
        const bandsHalf = CORE_HALF + bands * BAND
        const half = bands ? bandsHalf + END_EXTRA : HALL_HALF
        const slots = []
        const add = (x, z, rotY, span) => slots.push({ x, z, rotY, span, room })
        const line = (from, to, n, place) => {
            if (!n) return
            const step = (to - from) / n
            for (let k = 0; k < n; k++) place(from + (k + 0.5) * step, Math.abs(step))
        }
        const inner = half - T / 2
        const dw = doorway / 2
        // odcinki ściany bocznej: [północny, południowy] (dla ściany bez przejścia — jeden, w polu "north")
        // ściana zachodnia: tylko przejście; ściana wschodnia: przejście, obok napis
        // „Następna sala” i nazwa bieżącej sali — po stronie przejścia bliższej środka ściany
        const segments = (doorZ, signSide, withTitle) => {
            if (doorZ === null) {
                if (!withTitle) return { north: [-inner + 0.3, inner - 0.3], south: null }
                return { north: [-inner + 0.3, -TITLE_GAP / 2], south: [TITLE_GAP / 2, inner - 0.3] }
            }
            const reserved = NEXT_SIGN_GAP + (withTitle ? TITLE_GAP : 0)
            const gapN = signSide === 'north' ? reserved : 0.2
            const gapS = signSide === 'south' ? reserved : 0.2
            return { north: [-inner + 0.3, doorZ - dw - gapN], south: [doorZ + dw + gapS, inner - 0.3] }
        }
        const signSide = doors.east === null ? null : doors.east > 0 ? 'north' : 'south'
        const west = segments(doors.west, null, false)
        const east = segments(doors.east, signSide, true)
        const sideLine = (seg, x, rotY, reverse) => {
            if (!seg) return
            const [za, zb] = seg
            const n = slotsAlong(zb - za)
            reverse ? line(zb, za, n, (z, span) => add(x, z, rotY, span)) : line(za, zb, n, (z, span) => add(x, z, rotY, span))
        }
        const wallStep = (W - 2.2) / 5
        const northX = [0, 1, 2, 3, 4].map((k) => x0 + 1.1 + (k + 0.5) * wallStep)

        if (westSlots) sideLine(west.north, x0 + T / 2, Math.PI / 2, true)
        northX.forEach((x) => add(x, -inner, 0, wallStep))
        sideLine(east.north, x0 + W - T / 2, -Math.PI / 2, false)
        // ścianki wolnostojące — zawsze parami (po jednej w każdej połowie sali, symetrycznie).
        // Najpierw relacja do przejścia: w pierwszym paśmie od osi ścianki stoją równolegle
        // do osi (wzdłuż drogi między przejściami). Dalej względem siebie: każde kolejne
        // pasmo obrócone o 90° względem poprzedniego.
        const partitions = []
        const positions = []
        for (let b = bands - 1; b >= 0; b--) positions.push({ b, zc: -(CORE_HALF + b * BAND + BAND / 2) })
        for (let b = 0; b < bands; b++) positions.push({ b, zc: CORE_HALF + b * BAND + BAND / 2 })
        const cx = x0 + W / 2
        positions.forEach(({ b, zc: zc0 }) => {
            let zc = zc0
            const across = b % 2 === 1
            if (!across) {
                const len = P.length
                partitions.push({ x: cx, z: zc, sx: len, sz: P.thickness })
                line(cx - len / 2 + 0.3, cx + len / 2 - 0.3, 3, (x, span) => add(x, zc - P.thickness / 2, Math.PI, span))
                line(cx + len / 2 - 0.3, cx - len / 2 + 0.3, 3, (x, span) => add(x, zc + P.thickness / 2, 0, span))
            } else {
                const len = PART_Z_LENGTH
                // ścianka w poprzek w skrajnym paśmie: przesunięta ku środkowi, żeby przejście
                // do ściany szczytowej i do sąsiedniej ścianki było podobne (~3 m)
                if (b === bands - 1) {
                    const outer = bandsHalf - T / 2 - (Math.abs(zc) + len / 2)
                    const inner = (Math.abs(zc) - len / 2) - (Math.abs(zc) - BAND + P.thickness / 2)
                    zc -= Math.sign(zc) * Math.max(0, (inner - outer) / 2)
                }
                partitions.push({ x: cx, z: zc, sx: P.thickness, sz: len })
                line(zc - len / 2 + 0.2, zc + len / 2 - 0.2, 2, (z, span) => add(cx - P.thickness / 2, z, -Math.PI / 2, span))
                line(zc + len / 2 - 0.2, zc - len / 2 + 0.2, 2, (z, span) => add(cx + P.thickness / 2, z, Math.PI / 2, span))
            }
        })
        sideLine(east.south, x0 + W - T / 2, -Math.PI / 2, false)
        line(x0 + W - 1.1, x0 + 1.1, 5, (x, span) => add(x, inner, Math.PI, span))
        if (westSlots) sideLine(west.south, x0 + T / 2, Math.PI / 2, true)

        const dir = signSide === 'north' ? -1 : 1
        const title = {
            x: x0 + W - T / 2, rotY: -Math.PI / 2,
            z: doors.east === null ? 0 : doors.east + dir * (dw + NEXT_SIGN_GAP + TITLE_GAP / 2)
        }
        const nextSign = signSide && {
            x: x0 + W - T / 2, rotY: -Math.PI / 2,
            z: doors.east + dir * (dw + NEXT_SIGN_GAP / 2)
        }
        return { x0, half, partitions, slots, title, nextSign }
    }
    let partitionCount = 0
    let plan = build(0)
    while (plan.slots.length < count) plan = build(partitionCount += 2)
    return plan
}

// Rysunki rozkładają się równomiernie po wszystkich miejscach sali, więc wolne miejsca
// (gdy prac jest mniej niż miejsc) są rozproszone, a nie zebrane w jednym końcu sali.
const spreadSlots = (slots, count) => Array.from({ length: count }, (_, i) =>
    slots[Math.min(slots.length - 1, Math.floor((i + 0.5) * slots.length / count))])

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
    if (date) ctx.fillText(date, 36, 226)
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

const plural = (n) => n === 1 ? '1 rysunek'
    : `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'rysunki' : 'rysunków'}`

// Nazwa sali — napis na ścianie w miejscu jednej pracy (mniejszy niż tytuł galerii)
const roomNameCanvas = (title, count) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 560
    const ctx = canvas.getContext('2d')
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1f1d1a'
    ctx.font = '400 190px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(title, 1024, 250, 1980)
    ctx.fillStyle = '#8c867c'
    ctx.font = '400 54px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '14px'
    ctx.fillText(plural(count).toUpperCase(), 1024, 420)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
}

// Mały napis przy przejściu do kolejnej sali
const nextRoomCanvas = (title) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#8c867c'
    ctx.font = '500 46px "Inter", "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '10px'
    ctx.fillText('NASTĘPNA SALA', 24, 86)
    ctx.letterSpacing = '0px'
    ctx.fillStyle = '#1f1d1a'
    ctx.font = '500 104px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(`${title} ↑`, 24, 222, 980)
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
        this.pinned = new Set()     // prace potrzebne w nagraniu Studia — nie są zwalniane z pamięci
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
        // przejścia: blisko środka ściany (do ±3 m), na przemian w jedną i drugą stronę,
        // żeby kolejne przejścia nie wypadały naprzeciw siebie
        const doorFor = (r, halves) => {
            const minHalf = Math.min(halves[r - 1], halves[r])
            const limit = Math.min(3, minHalf - 1 - doorway / 2)
            return (r % 2 === 1 ? 1 : -1) * limit
        }
        const planAll = (halves) => {
            const doorZ = rooms.map((_, r) => (r > 0 ? doorFor(r, halves) : null))
            return rooms.map((room, r) => planRoom(r, room.drawings.length, {
                west: r > 0 ? doorZ[r] : null,
                east: r < rooms.length - 1 ? doorFor(r + 1, halves) : null
            }))
        }
        let plans = planAll(rooms.map(() => HALL_HALF))
        plans = planAll(plans.map((plan) => plan.half))
        this.doorZ = rooms.map((_, r) => (r > 0 ? doorFor(r, plans.map((plan) => plan.half)) : null))
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
            // listwa: 11 cm, wystaje 2 cm i obejmuje końce ściany — żadna jej ściana nie leży
            // w płaszczyźnie ściany ani podłogi (inaczej z daleka migocze). Listwy ścian
            // wzdłuż X i Z wystają o różną grubość, żeby nie nakładały się płasko w narożnikach.
            if (y0 === 0) {
                const out = sx > sz ? 0.018 : 0.022
                addBox(x, 0.057, z, sx + 2 * out, 0.11, sz + 2 * out, materials.baseboard, false)
                if (shadowTest.ao) addContactShadows(x, z, sx, sz)
            }
        }
        // cienie kontaktowe po obu dłuższych stronach ściany: pas na podłodze (ciemny przy
        // ścianie) i pas nisko na licu ściany (ciemny przy podłodze). Geometryczne, więc
        // trafiają dokładnie w styk; narożniki ciemnieją same, bo pasy się nakładają.
        const addContactShadows = (x, z, sx, sz) => {
            const alongX = sx >= sz
            const length = alongX ? sx : sz
            const half = (alongX ? sz : sx) / 2
            for (const side of [1, -1]) {
                const nx = alongX ? 0 : side, nz = alongX ? side : 0
                const floor = new THREE.Mesh(unitPlane, materials.contactFloor)
                // obrót w płaszczyźnie tak, by ciemna krawędź tekstury leżała przy ścianie
                const spin = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2)
                floor.rotation.set(-Math.PI / 2, 0, spin)
                floor.scale.set(length, CONTACT_FLOOR, 1)
                floor.position.set(x + nx * (half + CONTACT_FLOOR / 2), 0.003, z + nz * (half + CONTACT_FLOOR / 2))
                group.add(floor)
                const wall = new THREE.Mesh(unitPlane, materials.contactWall)
                wall.rotation.set(0, Math.atan2(nx, nz), Math.PI)
                wall.scale.set(length, CONTACT_WALL, 1)
                wall.position.set(x + nx * (half + 0.003), CONTACT_WALL / 2, z + nz * (half + 0.003))
                group.add(wall)
            }
        }
        // ściana wzdłuż osi Z od za do zb
        const wallAlongZ = (x, za, zb, height, y0) => addWall(x, (za + zb) / 2, T, zb - za, height, y0)
        const addText = (texture, x, y, z, rotY, width, aspect) => {
            const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
            this.titledMaterials.push(material)
            const text = new THREE.Mesh(unitPlane, material)
            text.scale.set(width, width * aspect, 1)
            text.position.set(x, y, z)
            text.rotation.y = rotY
            group.add(text)
        }

        // ściany poprzeczne: wejście, przejścia na środku ścian, koniec
        const doorHeight = 3.1
        for (let r = 0; r <= this.rooms; r++) {
            const x = r * W
            const reach = Math.max(r > 0 ? halfOf(r - 1) : 0, r < this.rooms ? halfOf(r) : 0)
            if (r === 0 || r === this.rooms) {
                wallAlongZ(x, -reach, reach)
            } else {
                const dz = this.doorZ[r]
                wallAlongZ(x, -reach, dz - doorway / 2)
                wallAlongZ(x, dz + doorway / 2, reach)
                wallAlongZ(x, dz - doorway / 2, dz + doorway / 2, H - doorHeight, doorHeight)
            }
        }
        for (let r = 0; r < this.rooms; r++) {
            const { x0, half, partitions } = plans[r]
            addWall(x0 + W / 2, -half, W + T, T)                          // północ
            addWall(x0 + W / 2, half, W + T, T)                           // południe
            for (const part of partitions) {
                addWall(part.x, part.z, part.sx, part.sz, P.height)
                if (shadowTest.decals) {
                    // rozproszony cień ścianki na podłodze — światło ze świetlików w suficie
                    const shade = new THREE.Mesh(unitPlane, materials.floorShadow)
                    shade.rotation.x = -Math.PI / 2
                    shade.scale.set((part.sx + 1.1) / SHADOW_CORE, (part.sz + 1.1) / SHADOW_CORE, 1)
                    shade.position.set(part.x, 0.004, part.z)
                    group.add(shade)
                }
                addBox(part.x, P.height + 0.01, part.z, part.sx + 0.03, 0.02, part.sz + 0.03, materials.baseboard, false)   // nakrywa ścianki
            }
            // świetliki: rzędy co ok. 5 m
            const rows = Math.max(2, Math.round((2 * half - 5) / 5) + 1)
            for (let i = 0; i < rows; i++) {
                const pz = -half + 2.5 + i * (2 * half - 5) / (rows - 1)
                for (const px of [-3.4, 0, 3.4]) {
                    const panel = new THREE.Mesh(unitPlane, materials.lightPanel)
                    panel.rotation.x = Math.PI / 2
                    panel.scale.set(2.6, 0.55, 1)
                    panel.position.set(x0 + W / 2 + px, H - 0.005, pz)
                    group.add(panel)
                }
            }
            // nazwa sali w miejscu jednej pracy i napis przy przejściu do następnej
            const { title, nextSign } = plans[r]
            addText(roomNameCanvas(this.roomTitles[r], rooms[r].drawings.length), title.x - 0.006, cfg.frame.centerHeight + 0.15, title.z, title.rotY, 2.6, 560 / 2048)
            if (nextSign) addText(nextRoomCanvas(this.roomTitles[r + 1]), nextSign.x - 0.006, 1.55, nextSign.z, nextSign.rotY, 1.15, 300 / 1024)
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
            const slots = spreadSlots(plans[r].slots, room.drawings.length)
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
            if (shadowTest.decals) {
                // cień ramy od reflektora nad i przed obrazem: pada na ścianę nieco niżej
                const shade = new THREE.Mesh(unitPlane, materials.frameShadow)
                shade.scale.set((size.outerW + 0.03) / SHADOW_CORE, (size.outerH + 0.03) / SHADOW_CORE, 1)
                shade.position.set(0, -0.075, 0.0015)
                holder.add(shade)
            }
            const glow = new THREE.Mesh(unitPlane, materials.glow)
            glow.scale.set(size.outerW * 1.9 + 0.6, size.outerH * 1.75 + 0.6, 1)
            glow.position.set(0, 0.12, 0.002)
            holder.add(glow)

            // rama z czterech listew — za passe-partout nie ma nic ciemnego, co mogłoby
            // przebijać z daleka; warstwy (passe-partout, fazka, rysunek) rozsunięte o kilka mm
            const front = f.depth + 0.004
            const bar = (w, h, x, y) => {
                const piece = new THREE.Mesh(unitBox, materials.frame)
                piece.scale.set(w, h, f.depth)
                piece.position.set(x, y, front - f.depth / 2)
                holder.add(piece)
            }
            bar(size.outerW, f.profile, 0, (size.outerH - f.profile) / 2)
            bar(size.outerW, f.profile, 0, -(size.outerH - f.profile) / 2)
            bar(f.profile, size.outerH - 2 * f.profile, -(size.outerW - f.profile) / 2, 0)
            bar(f.profile, size.outerH - 2 * f.profile, (size.outerW - f.profile) / 2, 0)

            const matZ = front - 0.018          // passe-partout lekko cofnięte w głąb ramy
            const mat = new THREE.Mesh(unitPlane, materials.mat)
            mat.scale.set(size.outerW - 2 * f.profile + 0.002, size.outerH - 2 * f.profile + 0.002, 1)
            mat.position.z = matZ
            holder.add(mat)

            const bevel = new THREE.Mesh(unitPlane, materials.matBevel)
            bevel.scale.set(size.imgW + 0.008, size.imgH + 0.008, 1)
            bevel.position.z = matZ + 0.003
            holder.add(bevel)

            const prev = previous.get(drawing.id)
            const old = prev && prev.drawing.rev === drawing.rev ? prev : null
            const artMaterial = old?.material ?? new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.92 })
            if (old) reused.add(drawing.id)
            const art = new THREE.Mesh(unitPlane, artMaterial)
            art.scale.set(size.imgW, size.imgH, 1)
            art.position.z = matZ + 0.006
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
                drawing, index, number, room: slot.room, outerW: size.outerW, outerH: size.outerH, mesh: art, material: artMaterial, label, holder, world, normal,
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

        this.bounds = { minX: -1, maxX: length + 1, minZ: -maxHalf - 1, maxZ: maxHalf + 1 }
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
        // szyny: ciągi reflektorów na jednej linii, dzielone tam, gdzie przerwa > 4 m
        const lines = new Map()
        for (const spot of spots) {
            const line = spot.alongX ? spot.z : spot.x
            const key = `${spot.room}:${spot.alongX ? 'x' : 'z'}:${line.toFixed(2)}`
            const entry = lines.get(key) ?? { alongX: spot.alongX, line, positions: [] }
            entry.positions.push(spot.alongX ? spot.x : spot.z)
            lines.set(key, entry)
        }
        const runs = new Map()
        for (const [key, entry] of lines) {
            const sorted = entry.positions.sort((p, q) => p - q)
            let run = null
            sorted.forEach((pos, i) => {
                if (!run || pos - run.max > 4) {
                    run = { alongX: entry.alongX, line: entry.line, min: pos, max: pos }
                    runs.set(`${key}:${i}`, run)
                } else run.max = pos
            })
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
            if (art.level > 0 && distance > 40 && !this.pinned.has(art)) this.unload(art)
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

    // Wczytanie przed nagraniem rolki: bliskie prace w pełnej rozdzielczości, dalsze
    // jako podgląd; nieudane próby są ponawiane. onProgress(gotowe, wszystkie).
    async preload({ full, preview }, onProgress) {
        const jobs = [...full.map((art) => [art, 2]), ...preview.map((art) => [art, 1])]
        // przypięcie: zwykłe zwalnianie dalekich prac (ponad 40 m od kamery) ich nie ruszy,
        // dopóki trwa nagranie — inaczej wczytane prace znikały przed startem filmu
        this.pinned = new Set(jobs.map(([art]) => art))
        for (const [art] of jobs) if (full.includes(art) && !art.labelReady) this.makeLabel(art)
        let done = 0
        onProgress?.(done, jobs.length)
        const deadline = performance.now() + 120000
        const queue = jobs.slice()
        const worker = async () => {
            while (queue.length) {
                const [art, level] = queue.shift()
                for (let attempt = 0; art.level < level && attempt < 6 && performance.now() < deadline; attempt++) {
                    while (art.loadingLevel) await new Promise((resolve) => setTimeout(resolve, 80))
                    if (art.level < level) await this.load(art, level)
                    if (art.level < level) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
                }
                onProgress?.(++done, jobs.length)
            }
        }
        await Promise.all(Array.from({ length: 6 }, worker))
        // ostatnia, spokojna runda dla tych, które się nie udały (np. chwilowy limit Dysku)
        for (const [art, level] of jobs) {
            if (art.level >= level || performance.now() > deadline + 30000) continue
            while (art.loadingLevel) await new Promise((resolve) => setTimeout(resolve, 80))
            if (art.level < level) await this.load(art, level)
        }
        return jobs.filter(([art]) => art.level === 0).length     // ile prac zostało białych
    }

    unpin() { this.pinned = new Set() }

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
