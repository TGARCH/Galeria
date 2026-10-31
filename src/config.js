// Ustawienia galerii — zmieniaj tutaj, bez grzebania w reszcie kodu.
export const galleryConfig = {
    title: 'Tomasz Grzyb',
    subtitle: 'Rysunki',

    // Wymiary jednej sali [m]. Sale dobudowują się w miarę przybywania rysunków.
    room: { width: 12, depth: 10, height: 4.2, wall: 0.3, doorway: 3.2 },
    // Ścianka działowa na środku każdej sali (jak w prawdziwej galerii).
    partition: { length: 5, height: 3.3, thickness: 0.3 },   // 5 m: ok. 3,3 m przejścia do ścian bocznych

    // Rama i passe-partout
    frame: {
        color: 0x1c1b1a,      // cienka czarna rama
        profile: 0.032,       // szerokość listwy [m]
        depth: 0.045,
        mat: 0xf6f4ef,        // biały passe-partout
        matRatio: 0.11,       // margines passe-partout względem krótszego boku
        maxWidth: 1.5,
        maxHeight: 1.45,
        centerHeight: 1.6     // wysokość środka obrazu [m]
    },

    // Jak często sprawdzać, czy na Dysku pojawiły się nowe pliki [s]
    refreshInterval: 90
}

// Test cieni (tylko z parametrem w adresie, produkcja bez zmian):
//   ?cienie        — oba rodzaje
//   ?cienie=ao     — tylko cienie kontaktowe w narożnikach i u podstaw ścian (ambient occlusion)
//   ?cienie=plamy  — tylko miękkie cienie ram od reflektorów i ścianek na podłodze
const shadowParam = new URLSearchParams(window.location.search).get('cienie')
export const shadowTest = {
    ao: shadowParam !== null && shadowParam !== 'plamy',
    decals: shadowParam !== null && shadowParam !== 'ao'
}
