import * as THREE from 'three'

// ————————————————————————————————————————————————
// Spacer automatyczny — kamera chodzi od pracy do pracy jak zwiedzający
// ————————————————————————————————————————————————
// Trasa: sala po sali, w sali zawsze najbliższa nieobejrzana praca. Droga między
// punktami wyznaczana jest na siatce przeszkód (A*), wygładzana i prowadzona po
// krzywej, więc kamera omija ścianki i przechodzi przez drzwi. Przed pracą
// zatrzymuje się i delikatnie „przygląda” (lekki ruch, oddech).

const CELL = 0.25          // rozdzielczość siatki [m]
const CLEARANCE = 0.55     // minimalna odległość od ścian [m]
const WALK_SPEED = 1.15    // tempo spaceru [m/s]
const DWELL = 7.5          // czas oglądania jednej pracy [s]

const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

class Grid {
    constructor(bounds, colliders) {
        this.minX = bounds.minX
        this.minZ = bounds.minZ
        this.w = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 1
        this.h = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 1
        this.blocked = new Uint8Array(this.w * this.h)
        for (const c of colliders) {
            const x0 = this.ix(c.x - c.halfX - CLEARANCE), x1 = this.ix(c.x + c.halfX + CLEARANCE)
            const z0 = this.iz(c.z - c.halfZ - CLEARANCE), z1 = this.iz(c.z + c.halfZ + CLEARANCE)
            for (let z = Math.max(0, z0); z <= Math.min(this.h - 1, z1); z++) {
                for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.blocked[z * this.w + x] = 1
            }
        }
    }
    ix(x) { return Math.round((x - this.minX) / CELL) }
    iz(z) { return Math.round((z - this.minZ) / CELL) }
    wx(i) { return this.minX + i * CELL }
    wz(j) { return this.minZ + j * CELL }
    free(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i] }
    freeAt(x, z) { return this.free(this.ix(x), this.iz(z)) }

    // najbliższa wolna komórka (gdy punkt startu/celu wypada przy ścianie)
    nearestFree(i, j) {
        if (this.free(i, j)) return [i, j]
        for (let r = 1; r < 12; r++) {
            for (let dj = -r; dj <= r; dj++) {
                for (let di = -r; di <= r; di++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.free(i + di, j + dj)) return [i + di, j + dj]
                }
            }
        }
        return null
    }

    lineOfSight(ax, az, bx, bz) {
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5))
        for (let s = 0; s <= steps; s++) {
            const t = s / steps
            if (!this.freeAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false
        }
        return true
    }

    // A* na siatce 8-kierunkowej; zwraca listę punktów [x, z] (wygładzoną)
    path(ax, az, bx, bz) {
        const start = this.nearestFree(this.ix(ax), this.iz(az))
        const goal = this.nearestFree(this.ix(bx), this.iz(bz))
        if (!start || !goal) return null
        const W = this.w
        const key = (i, j) => j * W + i
        const g = new Float32Array(this.w * this.h).fill(Infinity)
        const came = new Int32Array(this.w * this.h).fill(-1)
        const closed = new Uint8Array(this.w * this.h)
        const heap = []
        const push = (k, f) => {
            heap.push([f, k])
            let n = heap.length - 1
            while (n > 0) {
                const p = (n - 1) >> 1
                if (heap[p][0] <= heap[n][0]) break
                ;[heap[p], heap[n]] = [heap[n], heap[p]]
                n = p
            }
        }
        const pop = () => {
            const top = heap[0]
            const last = heap.pop()
            if (heap.length) {
                heap[0] = last
                let n = 0
                for (;;) {
                    const l = 2 * n + 1, r = l + 1
                    let m = n
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l
                    if (r < heap.length && heap[r][0] < heap[m][0]) m = r
                    if (m === n) break
                    ;[heap[m], heap[n]] = [heap[n], heap[m]]
                    n = m
                }
            }
            return top
        }
        const h = (i, j) => Math.hypot(i - goal[0], j - goal[1])
        const sk = key(start[0], start[1])
        const gk = key(goal[0], goal[1])
        g[sk] = 0
        push(sk, h(start[0], start[1]))
        const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
        while (heap.length) {
            const [, k] = pop()
            if (k === gk) break
            if (closed[k]) continue
            closed[k] = 1
            const i = k % W, j = (k / W) | 0
            for (const [di, dj, cost] of dirs) {
                const ni = i + di, nj = j + dj
                if (!this.free(ni, nj)) continue
                if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue
                const nk = key(ni, nj)
                const ng = g[k] + cost
                if (ng < g[nk]) {
                    g[nk] = ng
                    came[nk] = k
                    push(nk, ng + h(ni, nj))
                }
            }
        }
        if (came[gk] === -1 && gk !== sk) return null
        const cells = []
        for (let k = gk; k !== -1; k = came[k]) cells.push([this.wx(k % W), this.wz((k / W) | 0)])
        cells.reverse()
        // wygładzenie: pomijamy punkty, między którymi jest prosta, wolna droga
        const smooth = [[ax, az]]
        let anchor = [ax, az]
        for (let n = 1; n < cells.length; n++) {
            if (!this.lineOfSight(anchor[0], anchor[1], cells[n][0], cells[n][1])) {
                anchor = cells[n - 1]
                smooth.push(anchor)
            }
        }
        smooth.push([bx, bz])
        return smooth
    }
}

export class Tour {
    constructor({ camera, gallery, eyeHeight, onCaption, onFade }) {
        this.camera = camera
        this.gallery = gallery
        this.eyeHeight = eyeHeight
        this.onCaption = onCaption
        this.onFade = onFade
        this.active = false
        this.yaw = 0
        this.pitch = 0
        this.grid = null
        this.visited = new Set()
    }

    rebuildGrid() {
        this.grid = this.gallery.bounds ? new Grid(this.gallery.bounds, this.gallery.colliders) : null
    }

    // galeria przebudowana (nowe pliki na Dysku) — siatka od nowa, odwiedzone zostają
    onRebuild() {
        this.rebuildGrid()
        if (this.active && this.state !== 'fade') this.planNext()
    }

    start(yaw, pitch) {
        if (!this.gallery.artworks.length) return
        this.rebuildGrid()
        this.active = true
        this.yaw = yaw
        this.pitch = pitch
        this.visited.clear()
        this.planNext()
    }

    stop() {
        this.active = false
        this.onCaption(null)
    }

    // punkt, z którego ogląda się pracę: przed nią, w odległości zależnej od wielkości ramy
    viewpoint(art) {
        const d0 = THREE.MathUtils.clamp(art.outerH * 1.7, 1.9, 3.0)
        for (let d = d0; d >= 1.2; d -= 0.2) {
            const x = art.world.x + art.normal.x * d
            const z = art.world.z + art.normal.z * d
            if (!this.grid || this.grid.freeAt(x, z)) return new THREE.Vector3(x, this.eyeHeight, z)
        }
        return new THREE.Vector3(art.world.x + art.normal.x * 1.5, this.eyeHeight, art.world.z + art.normal.z * 1.5)
    }

    // następna praca: najbliższa nieobejrzana w bieżącej sali, potem kolejna sala
    chooseNext() {
        const arts = this.gallery.artworks.filter((art) => !this.visited.has(art.drawing.id))
        if (!arts.length) return null
        const pos = this.camera.position
        const room = this.current ? this.current.room : Math.min(...arts.map((art) => art.room))
        let pool = arts.filter((art) => art.room === room)
        if (!pool.length) {
            const nextRoom = Math.min(...arts.map((art) => art.room))
            pool = arts.filter((art) => art.room === nextRoom)
        }
        let best = null
        let bestDist = Infinity
        for (const art of pool) {
            const d = this.viewpoint(art).distanceTo(pos)
            if (d < bestDist) { bestDist = d; best = art }
        }
        return best
    }

    planNext() {
        const art = this.chooseNext()
        if (!art) {
            // koniec trasy — ściemnienie i spacer od początku
            this.state = 'fade'
            this.timer = 0
            this.current = null
            this.onCaption(null)
            return
        }
        this.current = art
        this.visited.add(art.drawing.id)
        const target = this.viewpoint(art)
        const from = this.camera.position
        const points = this.grid?.path(from.x, from.z, target.x, target.z) || [[from.x, from.z], [target.x, target.z]]
        const vectors = points.map(([x, z]) => new THREE.Vector3(x, this.eyeHeight, z))
        if (vectors.length === 2) vectors.splice(1, 0, vectors[0].clone().lerp(vectors[1], 0.5))
        this.curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5)
        this.length = Math.max(this.curve.getLength(), 0.01)
        this.duration = this.length / WALK_SPEED + 1.2
        this.timer = 0
        this.state = 'walk'
        this.onCaption(null)
    }

    lookTargetAngles(target) {
        const dx = target.x - this.camera.position.x
        const dy = target.y - this.camera.position.y
        const dz = target.z - this.camera.position.z
        return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
    }

    turnTowards(yaw, pitch, dt, rate) {
        const k = 1 - Math.exp(-dt * rate)
        this.yaw += wrapAngle(yaw - this.yaw) * k
        this.pitch += (pitch - this.pitch) * k
    }

    update(dt) {
        if (!this.active) return
        const step = Math.min(dt, 0.05)
        this.timer += step
        const cam = this.camera

        if (this.state === 'walk') {
            const t = Math.min(this.timer / this.duration, 1)
            const u = easeInOut(t)
            cam.position.copy(this.curve.getPointAt(u))
            // delikatne kołysanie kroku
            cam.position.y = this.eyeHeight + Math.sin(this.timer * 6.2) * 0.008 * Math.sin(Math.PI * t)
            // patrzymy przed siebie, a pod koniec drogi coraz bardziej na pracę
            const ahead = this.curve.getPointAt(Math.min(u + 0.06, 1))
            const center = this.current.world
            const walkLook = this.lookTargetAngles(ahead.distanceTo(cam.position) > 0.05 ? new THREE.Vector3(ahead.x, this.eyeHeight - 0.05, ahead.z) : center)
            const artLook = this.lookTargetAngles(center)
            const blend = THREE.MathUtils.smoothstep(t, 0.55, 0.95)
            const yaw = walkLook.yaw + wrapAngle(artLook.yaw - walkLook.yaw) * blend
            const pitch = THREE.MathUtils.lerp(walkLook.pitch * 0.3, artLook.pitch, blend)
            this.turnTowards(yaw, pitch, step, 3.2)
            if (t >= 1) {
                this.state = 'dwell'
                this.timer = 0
                this.dwellBase = cam.position.clone()
                this.onCaption(this.current)
            }
        } else if (this.state === 'dwell') {
            // przyglądanie się: powolne przesunięcie w bok i lekki ruch spojrzenia
            const s = this.timer / DWELL
            const side = new THREE.Vector3(this.current.normal.z, 0, -this.current.normal.x)
            cam.position.copy(this.dwellBase).addScaledVector(side, Math.sin(s * Math.PI * 2) * 0.12)
            cam.position.addScaledVector(this.current.normal, -Math.sin(s * Math.PI) * 0.18)
            const look = this.lookTargetAngles(this.current.world.clone().add(new THREE.Vector3(0, Math.sin(s * Math.PI * 1.5) * 0.08, 0)))
            this.turnTowards(look.yaw, look.pitch, step, 2.5)
            if (this.timer >= DWELL) this.planNext()
        } else if (this.state === 'fade') {
            // ściemnienie, powrót do wejścia, rozjaśnienie
            if (this.timer < 1.5) this.onFade(this.timer / 1.5)
            else if (!this.restarted) {
                const spawn = this.gallery.spawn
                cam.position.set(spawn.x, this.eyeHeight, spawn.z)
                this.yaw = spawn.yaw
                this.pitch = 0
                this.visited.clear()
                this.restarted = true
            } else if (this.timer < 3) this.onFade(1 - (this.timer - 1.5) / 1.5)
            else {
                this.onFade(0)
                this.restarted = false
                this.planNext()
            }
        }
        cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    }
}
