// ============================================
//   FOLIAR.COM.AR — Configuración Firebase
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyC00Au72aWLCrv7gE12DQZpTUBXw6BGf_0",
    authDomain: "foliar-com-ar.firebaseapp.com",
    databaseURL: "https://foliar-com-ar-default-rtdb.firebaseio.com",
    projectId: "foliar-com-ar",
    storageBucket: "foliar-com-ar.firebasestorage.app",
    messagingSenderId: "327804089331",
    appId: "1:327804089331:web:50e274811c2226048e1886"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencias globales
const auth = firebase.auth();
const db   = firebase.database();

// ── Helpers de base de datos por cliente ──────────────────────────────────────

/**
 * Devuelve la referencia al nodo raíz del cliente logueado.
 * Uso: clientRef()           → /clientes/{uid}
 *      clientRef('juridica') → /clientes/{uid}/datos/juridica
 */
function clientRef(subpath = '') {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('No hay usuario autenticado.');
    const base = `clientes/${uid}`;
    return db.ref(subpath ? `${base}/${subpath}` : base);
}

/**
 * Devuelve la referencia al perfil del cliente.
 * /clientes/{uid}/perfil
 */
function perfilRef() {
    return clientRef('perfil');
}

/**
 * Devuelve la referencia a los datos de una planilla específica.
 * /clientes/{uid}/datos/{planilla}
 * Ejemplo: planillaRef('juridica'), planillaRef('siniestros')
 */
function planillaRef(nombre) {
    return clientRef(`datos/${nombre}`);
}

/**
 * Devuelve la referencia a las credenciales judiciales del cliente.
 * /clientes/{uid}/credenciales
 * Solo el cliente puede leer/escribir este nodo (ver Reglas de seguridad).
 */
function credencialesRef() {
    return clientRef('credenciales');
}
