import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { inject } from '@vercel/analytics'
import { galleryConfig as cfg, moodTest } from './config.js'

import { Gallery } from './gallery.js'
import { Grid, Tour } from './tour.js'
import { Reel } from './reel.js'
import { initStudio } from './studio.js'
import { fetchRooms, imageUrl, isDemo, displayTitle, formatDate } from './drawings.js'

inject()

const $ = (selector) => document.querySelector(selector)
const canvas = $('canvas.webgl')
// Wydajność (rozdzielczość, wielkość tekstur) dobieramy raz, według urządzenia.
const isTouchDevice = window.matchMedia('(pointer: coarse) and (hover: none)').matches
// Sposób sterowania podąża za tym, czego zwiedzający właśnie użył. Na laptopach
// hybrydowych (ekran dotykowy + touchpad) można w każdej chwili przejść z palca
// na touchpad i z powrotem, bez odświeżania strony. Klawiatura działa zawsze.
let touchMode = isTouchDevice
window.addEventListener('pointerdown', (event) => { touchMode = event.pointerType !== 'mouse' }, true)

const applyTitles = () => {
    document.querySelector('[data-title]').textContent = cfg.title
    document.querySelector('[data-subtitle]').textContent = cfg.subtitle
    document.title = `${cfg.title} — ${cfg.subtitle}`
}
applyTitles()

// ————————————————————————————————————————————————
// Scena
// ————————————————————————————————————————————————

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf1efea)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.0

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
// kameralny nastrój (?nastrój): światło 70%, cieplejsze; dalsze partie sali lekko przygaszone
const light = moodTest ? 0.7 : 1
scene.environmentIntensity = 0.35 * light
scene.add(new THREE.HemisphereLight(moodTest ? 0xffe9d0 : 0xffffff, moodTest ? 0xc9bfb2 : 0xd9d4ca, 2.1 * light))
if (moodTest) {
    scene.background.set(0x4a4540)
    scene.fog = new THREE.Fog(0x4a4540, 20, 120)
    // winieta: delikatne przyciemnienie brzegów ekranu (tylko podgląd, nie w filmach ze studia)
    const vignette = document.createElement('div')
    vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(20,14,8,0.38) 100%)'
    document.body.appendChild(vignette)
}

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 80)
const eyeHeight = 1.62
const visitorRadius = 0.25
const walkSpeed = moodTest ? 3.0 : 3.8
const fastWalkSpeed = moodTest ? 5.5 : 7.0
scene.add(camera)

window.addEventListener('resize', () => {
    if (reel?.active) return
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})


const gallery = new Gallery(scene, renderer)
let drawings = []        // wszystkie rysunki po kolei (sala po sali) — dla powiększenia
let roomOf = []          // indeks sali dla każdego rysunku
let signature = ''

// ————————————————————————————————————————————————
// Kolekcja z Dysku
// ————————————————————————————————————————————————

const startButton = $('.start-button')
const countLabel = $('[data-count]')
const notice = $('[data-notice]')

const pluralWorks = (n) => n === 1 ? '1 rysunek'
    : `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'rysunki' : 'rysunków'}`

// Link do pracy: ?praca=ID — odwiedzający zaczyna przed tym rysunkiem
const sharedWork = new URLSearchParams(window.location.search).get('praca')

const placeVisitor = () => {
    const spawn = gallery.spawn
    camera.position.set(spawn.x, eyeHeight, spawn.z)
    yaw = spawn.yaw
    pitch = 0
    const art = sharedWork && gallery.artworks.find((a) => a.drawing.id === sharedWork)
    if (!art) return
    const d = THREE.MathUtils.clamp(art.outerH * 1.6, 1.9, 2.8)
    const grid = gallery.bounds ? new Grid(gallery.bounds, gallery.colliders) : null
    let spot = null
    for (let k = d; k >= 1.2 && !spot; k -= 0.2) {
        const x = art.world.x + art.normal.x * k
        const z = art.world.z + art.normal.z * k
        if (!grid || grid.freeAt(x, z)) spot = { x, z }
    }
    spot ||= { x: art.world.x + art.normal.x * 1.4, z: art.world.z + art.normal.z * 1.4 }
    camera.position.set(spot.x, eyeHeight, spot.z)
    yaw = Math.atan2(-(art.world.x - spot.x), -(art.world.z - spot.z))
    pitch = 0
    countLabel.textContent = `Zaproszenie do pracy: ${displayTitle(art.drawing)}`
}

const applyRooms = (rooms, firstLoad = false) => {
    const next = JSON.stringify(rooms.map((room) => [room.title, room.drawings.map((d) => [d.id, d.title, d.rev, d.width, d.height])]))
    if (next === signature && !firstLoad) return
    signature = next
    drawings = rooms.flatMap((room) => room.drawings)
    roomOf = rooms.flatMap((room, r) => room.drawings.map(() => r))
    gallery.build(rooms)
    tour?.onRebuild()
    countLabel.textContent = drawings.length ? pluralWorks(drawings.length) : 'Kolekcja jest pusta'
    if (firstLoad) placeVisitor()
}

const loadCollection = async (firstLoad = false) => {
    try {
        const rooms = await fetchRooms()
        applyTitles()
        applyRooms(rooms, firstLoad)
        const list = drawings
        notice.hidden = !isDemo
        if (isDemo) notice.textContent = 'Tryb podglądu: szkice demonstracyjne zamiast rysunków z Dysku.'
        else if (!list.length) {
            notice.hidden = false
            notice.textContent = 'W folderze na Dysku nie ma jeszcze plików graficznych.'
        }
    } catch (error) {
        console.error(error)
        if (firstLoad) {
            applyRooms([], true)
            countLabel.textContent = 'Nie udało się wczytać kolekcji'
            notice.hidden = false
            notice.textContent = error.message
        }
    } finally {
        startButton.disabled = false
        tourButton.disabled = !drawings.length
        if (autoTour && !tour.active && drawings.length) startTour()
    }
}

// Napisy na płótnie (tabliczki, nazwy sal, rolki) nie wymuszają same doczytania czcionek —
// trzeba je wczytać jawnie, RAZEM z polskimi znakami (osobny zestaw latin-ext),
// inaczej ą ę ł ś ż… wypadają z czcionki zastępczej.
const FONT_SAMPLE = 'AaZz09 ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ ↑·—'
const fontsReady = document.fonts?.load ? Promise.all([
    '400 40px "Cormorant Garamond"', '500 40px "Cormorant Garamond"',
    'italic 400 40px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"',
    '300 20px "Inter"', '400 20px "Inter"', '500 20px "Inter"'
].map((font) => document.fonts.load(font, FONT_SAMPLE))).catch(() => {}) : Promise.resolve()
fontsReady.then(() => loadCollection(true))
window.setInterval(() => { if (!document.hidden) loadCollection() }, cfg.refreshInterval * 1000)

// ————————————————————————————————————————————————
// Spacer
// ————————————————————————————————————————————————

let yaw = 0
let pitch = 0
const pressedKeys = new Set()
const movement = new THREE.Vector3()
const forward = new THREE.Vector3()
const right = new THREE.Vector3()

const startPanel = $('.start-panel')
const mobileControls = $('.mobile-controls')
const joystick = $('.mobile-joystick')
const joystickKnob = $('.mobile-joystick__knob')
const mobileRunButton = $('.mobile-run-button')
const mobilePauseButton = $('.mobile-pause-button')

let hasEntered = false
let mobileActive = false
let mobileForward = 0
let mobileSide = 0
let mobileRunning = false
let joystickPointerId = null
let lookPointerId = null
let lookStart = null
let lastLookX = 0
let lastLookY = 0

const pointerLocked = () => document.pointerLockElement === canvas
const navigationActive = () => mobileActive || pointerLocked()

const showStartPanel = (show) => {
    startPanel.classList.toggle('hidden', !show)
    startButton.textContent = hasEntered ? 'Wróć do galerii' : 'Wejdź do galerii'
    document.body.classList.toggle('walking', !show && !mobileActive)
}

const resetMobileInput = () => {
    mobileForward = mobileSide = 0
    mobileRunning = false
    mobileRunButton.classList.remove('pressed')
    joystickKnob.style.transform = 'translate(0, 0)'
}

const setMobileNavigation = (active) => {
    mobileActive = active
    mobileControls.classList.toggle('active', active)
    showStartPanel(!active)
    if (!active) resetMobileInput()
}

// blokada kursora; jeśli przeglądarka odmówi, pokaż panel pauzy
const lockPointer = () => {
    canvas.requestPointerLock()
    window.setTimeout(() => {
        if (!pointerLocked() && !mobileActive && !lightboxOpen && !tour.active && !studioBusy) showStartPanel(true)
    }, 250)
}

// palec → joystick i rozglądanie przesunięciem
const enterTouchNavigation = () => {
    setMobileNavigation(true)
    if (document.pointerLockElement) document.exitPointerLock()
}

// touchpad / mysz → blokada kursora, rozglądanie ruchem myszy
const enterPointerNavigation = () => {
    mobileActive = false
    mobileControls.classList.remove('active')
    resetMobileInput()
    lockPointer()
}

const requestControls = () => {
    if (touchMode) enterTouchNavigation()
    else enterPointerNavigation()
}

startButton.addEventListener('click', () => {
    hasEntered = true
    requestControls()
})

canvas.addEventListener('click', () => {
    if (touchMode || lightboxOpen) return
    if (pointerLocked()) {
        if (focused) openLightbox(focused.index)
        return
    }
    if (hasEntered) enterPointerNavigation()
})

document.addEventListener('pointerlockchange', () => {
    const active = pointerLocked()
    if (!active) pressedKeys.clear()
    if (!lightboxOpen && !tour.active && !studioBusy && !mobileActive) showStartPanel(!active)
})

document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas) return
    yaw -= event.movementX * 0.0021
    pitch -= event.movementY * 0.0021
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI * 0.42, Math.PI * 0.42)
})

window.addEventListener('keydown', (event) => {
    if (lightboxOpen) {
        if (event.code === 'Escape') closeLightbox()
        if (event.code === 'ArrowRight') stepLightbox(1)
        if (event.code === 'ArrowLeft') stepLightbox(-1)
        return
    }
    pressedKeys.add(event.code)
    if ((event.code === 'KeyE' || event.code === 'Enter') && focused && navigationActive()) openLightbox(focused.index)
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
})
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code))
window.addEventListener('blur', () => pressedKeys.clear())

// joystick
const updateJoystick = (clientX, clientY) => {
    const bounds = joystick.getBoundingClientRect()
    const maxDistance = bounds.width * 0.34
    let dx = clientX - (bounds.left + bounds.width / 2)
    let dy = clientY - (bounds.top + bounds.height / 2)
    const distance = Math.hypot(dx, dy)
    if (distance > maxDistance) { dx = dx / distance * maxDistance; dy = dy / distance * maxDistance }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`
    mobileSide = dx / maxDistance
    mobileForward = -dy / maxDistance
}
joystick.addEventListener('pointerdown', (event) => {
    if (!mobileActive) return
    joystickPointerId = event.pointerId
    joystick.setPointerCapture(event.pointerId)
    updateJoystick(event.clientX, event.clientY)
})
joystick.addEventListener('pointermove', (event) => {
    if (event.pointerId === joystickPointerId) updateJoystick(event.clientX, event.clientY)
})
const releaseJoystick = (event) => {
    if (event.pointerId !== joystickPointerId) return
    joystickPointerId = null
    mobileForward = mobileSide = 0
    joystickKnob.style.transform = 'translate(0, 0)'
}
joystick.addEventListener('pointerup', releaseJoystick)
joystick.addEventListener('pointercancel', releaseJoystick)

// rozglądanie palcem + dotknięcie rysunku
canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || lightboxOpen || tour.active || studioBusy) return
    // dotknięcie ekranu podczas spaceru touchpadem przełącza na sterowanie dotykowe
    if (!mobileActive) {
        if (!pointerLocked()) return
        enterTouchNavigation()
    }
    if (lookPointerId !== null) return
    lookPointerId = event.pointerId
    lastLookX = event.clientX
    lastLookY = event.clientY
    lookStart = { x: event.clientX, y: event.clientY, t: performance.now() }
    canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookPointerId) return
    yaw -= (event.clientX - lastLookX) * 0.0048
    pitch -= (event.clientY - lastLookY) * 0.004
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI * 0.42, Math.PI * 0.42)
    lastLookX = event.clientX
    lastLookY = event.clientY
})
const releaseLook = (event) => {
    if (event.pointerId !== lookPointerId) return
    lookPointerId = null
    const tap = lookStart && Math.hypot(event.clientX - lookStart.x, event.clientY - lookStart.y) < 14 && performance.now() - lookStart.t < 450
    if (tap && event.type === 'pointerup') {
        const pointer = new THREE.Vector2(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1)
        const art = pickArtwork(pointer, 6)
        if (art) openLightbox(art.index)
    }
}
canvas.addEventListener('pointerup', releaseLook)
canvas.addEventListener('pointercancel', releaseLook)
// Canvas obsługuje dotyk wyłącznie przez Pointer Events. Bez tego po stuknięciu
// przeglądarka wysyła jeszcze „kliknięcie”, które trafia w świeżo otwarty
// podgląd (w tło) i natychmiast go zamyka.
canvas.addEventListener('touchend', (event) => { if (event.cancelable) event.preventDefault() }, { passive: false })

mobileRunButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    mobileRunning = true
    mobileRunButton.classList.add('pressed')
})
const stopRunning = () => { mobileRunning = false; mobileRunButton.classList.remove('pressed') }
mobileRunButton.addEventListener('pointerup', stopRunning)
mobileRunButton.addEventListener('pointercancel', stopRunning)
mobilePauseButton.addEventListener('click', (event) => {
    event.stopPropagation()
    setMobileNavigation(false)
})

// Kolizje: zwiedzający jest kołem w rzucie, ściany prostokątami.
const collidesAt = (x, z) => gallery.colliders.some((wall) => {
    const dx = x - THREE.MathUtils.clamp(x, wall.x - wall.halfX, wall.x + wall.halfX)
    const dz = z - THREE.MathUtils.clamp(z, wall.z - wall.halfZ, wall.z + wall.halfZ)
    return dx * dx + dz * dz < visitorRadius * visitorRadius
})

const velocity = new THREE.Vector3()
const updateWalk = (deltaTime) => {
    camera.rotation.set(pitch, yaw, 0, 'YXZ')
    let forwardInput = 0
    let sideInput = 0
    if (navigationActive()) {
        // joystick i klawiatura działają razem — na laptopie hybrydowym obie naraz
        const keyForward = Number(pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) - Number(pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown'))
        const keySide = Number(pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) - Number(pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft'))
        forwardInput = THREE.MathUtils.clamp(mobileForward + keyForward, -1, 1)
        sideInput = THREE.MathUtils.clamp(mobileSide + keySide, -1, 1)
    }
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    movement.copy(forward).multiplyScalar(forwardInput).addScaledVector(right, sideInput)
    if (movement.lengthSq() > 1) movement.normalize()
    const fast = mobileRunning || pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')
    movement.multiplyScalar(fast ? fastWalkSpeed : walkSpeed)

    // łagodne ruszanie i zatrzymywanie — spokojny, „muzealny” krok
    const step = Math.min(deltaTime, 0.05)
    velocity.lerp(movement, 1 - Math.exp(-step * 9))
    if (velocity.lengthSq() < 1e-5) return
    const nextX = camera.position.x + velocity.x * step
    if (!collidesAt(nextX, camera.position.z)) camera.position.x = nextX
    else velocity.x = 0
    const nextZ = camera.position.z + velocity.z * step
    if (!collidesAt(camera.position.x, nextZ)) camera.position.z = nextZ
    else velocity.z = 0
    // delikatne kołysanie głowy przy chodzie
    walkPhase += velocity.length() * step * 5.2
    camera.position.y = eyeHeight + Math.sin(walkPhase) * 0.012 * Math.min(velocity.length() / walkSpeed, 1)
}
let walkPhase = 0

// ————————————————————————————————————————————————
// Rysunek w centrum uwagi
// ————————————————————————————————————————————————

const raycaster = new THREE.Raycaster()
const center = new THREE.Vector2(0, 0)
const caption = $('[data-caption]')
const captionTitle = $('.hud__title')
const roomLabel = $('[data-room]')
let focused = null

const pickArtwork = (pointer, maxDistance) => {
    raycaster.setFromCamera(pointer, camera)
    raycaster.far = maxDistance
    const targets = [...gallery.occluders, ...gallery.artworks.map((art) => art.mesh)]
    const hit = raycaster.intersectObjects(targets, false)[0]
    if (!hit || hit.object.userData.index === undefined) return null
    return gallery.artworks[hit.object.userData.index]
}

let lastFocusCheck = 0
const updateFocus = (elapsed) => {
    if (elapsed - lastFocusCheck < 0.1) return
    lastFocusCheck = elapsed
    const art = tour.active ? null : pointerLocked() ? pickArtwork(center, 4.5) : null
    if (!tour.active && art !== focused) {
        focused = art
        caption.hidden = !art
        document.body.classList.toggle('focused', !!art)
        if (art) {
            const date = formatDate(art.drawing.date)
            captionTitle.textContent = art.drawing.title ? art.drawing.title : (date || displayTitle(art.drawing))
        }
    }
    if (gallery.rooms > 1) {
        const room = gallery.roomAt(camera.position.x)
        roomLabel.textContent = `Sala ${room + 1} · ${gallery.roomTitles[room]}`
    } else roomLabel.textContent = ''
}

// ————————————————————————————————————————————————
// Powiększenie
// ————————————————————————————————————————————————

const lightbox = $('.lightbox')
const lightboxImage = $('.lightbox__image')
const lightboxNumber = $('.lightbox__number')
const lightboxTitle = $('.lightbox__title')
const lightboxDate = $('.lightbox__date')
let lightboxOpen = false
let lightboxIndex = 0

const showLightboxItem = (index) => {
    lightboxIndex = (index + drawings.length) % drawings.length
    const drawing = drawings[lightboxIndex]
    lightboxImage.src = imageUrl(drawing, isTouchDevice ? 1600 : 2400, { credit: true })
    lightboxImage.alt = displayTitle(drawing)
    lightboxNumber.textContent = `${String(lightboxIndex + 1).padStart(2, '0')} / ${String(drawings.length).padStart(2, '0')}`
    lightboxTitle.textContent = displayTitle(drawing)
    const roomTitle = gallery.rooms > 1 ? gallery.roomTitles[roomOf[lightboxIndex]] : ''
    lightboxDate.textContent = [formatDate(drawing.date), roomTitle].filter(Boolean).join(' · ')
}

const openLightbox = (index) => {
    if (!drawings.length) return
    lightboxOpen = true
    lightboxOpenedAt = performance.now()
    showLightboxItem(index)
    lightbox.hidden = false
    caption.hidden = true
    if (document.pointerLockElement) document.exitPointerLock()
    mobileControls.classList.remove('active')
}

const closeLightbox = () => {
    lightboxOpen = false
    lightbox.hidden = true
    lightboxImage.removeAttribute('src')
    // wracamy do spaceru tym sposobem, którym zamknięto podgląd
    if (touchMode) setMobileNavigation(true)
    else enterPointerNavigation()
}

const stepLightbox = (direction) => showLightboxItem(lightboxIndex + direction)

// zaraz po otwarciu podgląd nie reaguje na kliknięcia — to zwykle echo
// stuknięcia, które go otworzyło, a nie zamiar zamknięcia
let lightboxOpenedAt = 0
lightbox.addEventListener('click', (event) => {
    if (performance.now() - lightboxOpenedAt < 450) {
        event.stopImmediatePropagation()
        event.preventDefault()
    }
}, true)

$('.lightbox__close').addEventListener('click', closeLightbox)

// Udostępnianie: link otwiera galerię przed tą pracą (na Facebooku z jej zdjęciem)
const shareButton = $('.lightbox__share')
shareButton.addEventListener('click', async () => {
    const drawing = drawings[lightboxIndex]
    if (!drawing) return
    const url = `${window.location.origin}/?praca=${encodeURIComponent(drawing.id)}`
    const title = `${displayTitle(drawing)} — ${cfg.title}`
    try {
        if (touchMode && navigator.share) { await navigator.share({ title, url }); return }
        await navigator.clipboard.writeText(url)
        shareButton.textContent = 'Skopiowano link'
    } catch {
        window.prompt('Link do tej pracy:', url)
    }
    window.setTimeout(() => { shareButton.textContent = 'Udostępnij link' }, 2200)
})
$('.lightbox__prev').addEventListener('click', () => stepLightbox(-1))
$('.lightbox__next').addEventListener('click', () => stepLightbox(1))
lightbox.addEventListener('click', (event) => { if (event.target === lightbox) closeLightbox() })

// ————————————————————————————————————————————————
// Spacer automatyczny (prezentacja na targi)
// ————————————————————————————————————————————————
// Włączany przyciskiem na ekranie startowym albo adresem z ?spacer — wtedy rusza sam
// i wraca po minucie bezczynności, gdy zwiedzający przestanie sterować.

const TOUR_IDLE_RESUME = 60
const tourButton = $('.tour-button')
const tourFade = $('.tour-fade')
const autoTour = new URLSearchParams(window.location.search).has('spacer')
let lastInput = performance.now()

const tour = new Tour({
    camera, gallery, eyeHeight,
    onCaption: (art) => {
        caption.hidden = !art
        if (art) {
            const date = formatDate(art.drawing.date)
            captionTitle.textContent = art.drawing.title ? (date ? `${art.drawing.title} · ${date}` : art.drawing.title) : (date || displayTitle(art.drawing))
        }
    },
    onFade: (amount) => { tourFade.style.opacity = String(amount) }
})

function startTour() {
    if (!drawings.length) return
    if (document.pointerLockElement) document.exitPointerLock()
    showStartPanel(false)
    document.body.classList.add('touring')
    mobileActive = false
    mobileControls.classList.remove('active')
    resetMobileInput()
    velocity.set(0, 0, 0)
    tour.start(yaw, pitch)
}

const stopTour = () => {
    if (!tour.active) return
    tour.stop()
    yaw = tour.yaw
    pitch = tour.pitch
    tourFade.style.opacity = '0'
    document.body.classList.remove('touring')
    showStartPanel(true)
}

tourButton.addEventListener('click', (event) => {
    event.stopPropagation()
    hasEntered = true
    startTour()
    document.documentElement.requestFullscreen?.().catch(() => {})
})

// każde działanie zwiedzającego przerywa spacer i oddaje mu sterowanie
const userInput = () => {
    lastInput = performance.now()
    if (tour.active && performance.now() - tourStartedAt > 800) stopTour()
}
let tourStartedAt = 0
const originalStart = tour.start.bind(tour)
tour.start = (...args) => { tourStartedAt = performance.now(); originalStart(...args) }
window.addEventListener('keydown', userInput, true)
window.addEventListener('pointerdown', userInput, true)
window.addEventListener('wheel', userInput, { capture: true, passive: true })
window.addEventListener('mousemove', (event) => { if (Math.abs(event.movementX) + Math.abs(event.movementY) > 6) userInput() }, true)

// ————————————————————————————————————————————————
// Studio — nagrywanie rolek (tylko dla właściciela, adres z ?studio=KLUCZ)
// ————————————————————————————————————————————————

const reel = new Reel({ renderer, camera, gallery })
reel.renderFrame = () => renderer.render(scene, camera)
let studioBusy = false
initStudio({
    reel, gallery,
    getDrawings: () => drawings,
    beforeStart: () => {
        studioBusy = true
        if (tour.active) stopTour()
        if (document.pointerLockElement) document.exitPointerLock()
        startPanel.classList.add('hidden')
        caption.hidden = true
    },
    afterEnd: () => {
        studioBusy = false
        showStartPanel(true)
    }
})

// ————————————————————————————————————————————————
// Pętla
// ————————————————————————————————————————————————

const clock = new THREE.Clock()
const tick = () => {
    const delta = clock.getDelta()
    const elapsed = clock.elapsedTime
    if (reel.active && reel.offline) {          // nagrywanie klatka po klatce steruje się samo
        window.requestAnimationFrame(tick)
        return
    }
    if (reel.active) {
        reel.update(delta)
        gallery.stream(camera.position, elapsed)
        renderer.render(scene, camera)
        reel.composite(canvas)
        window.requestAnimationFrame(tick)
        return
    }
    if (tour.active) tour.update(delta)
    else {
        updateWalk(delta)
        if (autoTour && !lightboxOpen && !studioBusy && performance.now() - lastInput > TOUR_IDLE_RESUME * 1000) startTour()
    }
    gallery.stream(camera.position, elapsed)
    updateFocus(elapsed)
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}
placeVisitor()
tick()
if (isDemo) window.__view = (x, z, y, p = 0, h = eyeHeight) => { camera.position.set(x, h, z); yaw = y; pitch = p; camera.far = 200; camera.updateProjectionMatrix() }
