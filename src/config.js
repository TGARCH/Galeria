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

// Test cieni (tylko z parametrem ?cienie w adresie, produkcja bez zmian):
// miękkie cienie ram od reflektorów i rozproszone plamy cienia wokół ścianek na podłodze
export const shadowTest = {
    decals: new URLSearchParams(window.location.search).has('cienie')
}

// Test szkła (?szklo lub ?szkło): tafla szkła w ramie, odbijająca światło coraz mocniej pod kątem
const glassParams = new URLSearchParams(window.location.search)
const glassValue = glassParams.get('szklo') ?? glassParams.get('szkło')
export const glassTest = glassValue !== null
// siła odbicia w % (100% = najmocniejsze testowane); ?szkło=30 itp., domyślnie 10%
export const glassStrength = glassTest && glassValue !== '' && !Number.isNaN(Number(glassValue)) ? Number(glassValue) : 10

// Test odbić w podłodze (?podloga lub ?podłoga): siła w % w tej samej skali co szkło,
// domyślnie 5%; ostre, mało rozproszone odbicie wnętrza galerii w deskach
const floorValue = glassParams.get('podloga') ?? glassParams.get('podłoga')
export const floorReflectTest = floorValue !== null
export const floorReflectStrength = floorReflectTest && floorValue !== '' && !Number.isNaN(Number(floorValue)) ? Number(floorValue) : 5
