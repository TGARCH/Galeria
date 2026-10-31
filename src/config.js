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

    // Szkło przed rysunkami: siła odbicia [%] (pod kątem rośnie, na wprost prawie niewidoczne); 0 = bez szkła
    glass: 10,
    // Miękkie cienie ram od reflektorów i rozproszone plamy cienia wokół ścianek na podłodze
    softShadows: true,

    // Jak często sprawdzać, czy na Dysku pojawiły się nowe pliki [s]
    refreshInterval: 90
}

// Test kameralnego nastroju (?nastrój lub ?nastroj): światło 70%, ciepłe reflektory
// (ok. 2800 K), mocniejsze plamy światła na pracach, nieco ciemniejsze ściany, podłoga
// w kolorze orzecha, lekkie przyciemnienie w głębi i na brzegach ekranu, wolniejszy krok
const moodParams = new URLSearchParams(window.location.search)
export const moodTest = moodParams.has('nastrój') || moodParams.has('nastroj')
