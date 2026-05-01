// ============================================
//   FOLIAR.COM.AR — auth.js
//   Login · Registro · Planes · Vencimientos
// ============================================

const DIAS_TRIAL = 7;

// ── Planes disponibles ────────────────────────────────────────────────────────
const PLANES = {
    trial: {
        nombre: 'Prueba gratuita',
        precio: 0,
        modulos: ['juridica', 'siniestros', 'abonos', 'graficos'],
        duracionDias: DIAS_TRIAL
    },
    juridica: {
        nombre: 'Jurídica',
        precio: 50,
        modulos: ['juridica'],
        duracionDias: 30
    },
    juridica_siniestros: {
        nombre: 'Jurídica + Siniestros',
        precio: 65,
        modulos: ['juridica', 'siniestros'],
        duracionDias: 30
    },
    juridica_siniestros_pjn_mev: {
        nombre: 'Jurídica + Siniestros + PJN + MEV',
        precio: 85,
        modulos: ['juridica', 'siniestros', 'pjn', 'mev'],
        duracionDias: 30
    },
    completo: {
        nombre: 'Plan Completo',
        precio: 100,
        modulos: ['juridica', 'siniestros', 'abonos', 'graficos', 'pjn', 'mev'],
        duracionDias: 30
    }
};

// ── Estado global de sesión ───────────────────────────────────────────────────
let currentUser = null;
let currentPerfil = null;

// ── Inicializar listener de autenticación ─────────────────────────────────────
function initAuth(callbackLogueado, callbackDeslogueado) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            currentPerfil = await cargarPerfil(user.uid);
            if (typeof callbackLogueado === 'function') callbackLogueado(user, currentPerfil);
        } else {
            currentUser = null;
            currentPerfil = null;
            if (typeof callbackDeslogueado === 'function') callbackDeslogueado();
        }
    });
}

// ── Registro de nuevo usuario ─────────────────────────────────────────────────
async function registrar(email, password, datosExtra = {}) {
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;

        // Calcular vencimiento del trial
        const ahora = new Date();
        const vencimiento = new Date(ahora);
        vencimiento.setDate(vencimiento.getDate() + DIAS_TRIAL);

        // Crear perfil inicial en Firebase
        const perfil = {
            email,
            nombre: datosExtra.nombre || '',
            estudio: datosExtra.estudio || '',
            telefono: datosExtra.telefono || '',
            plan: 'trial',
            modulos: PLANES.trial.modulos,
            fechaRegistro: ahora.toISOString(),
            vencimiento: vencimiento.toISOString(),
            activo: true,
            trial: true
        };

        await db.ref(`clientes/${uid}/perfil`).set(perfil);

        // Crear estructura base de datos vacía para cada módulo
        await db.ref(`clientes/${uid}/datos`).set({
            planilla_juridica: [],
            planilla_siniestros: [],
            planilla_abonos: [],
            mev_cola: [],
            mev_progreso: {},
            mev_sin_coincidencia: [],
            pjn_sin_coincidencia: [],
            pjn_control: {}
        });

        return { ok: true, uid, perfil };
    } catch (error) {
        return { ok: false, error: traducirError(error.code) };
    }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(email, password) {
    try {
        await auth.signInWithEmailAndPassword(email, password);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: traducirError(error.code) };
    }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
    await auth.signOut();
    window.location.href = 'index.html';
}

// ── Cargar perfil del cliente ─────────────────────────────────────────────────
async function cargarPerfil(uid) {
    const snap = await db.ref(`clientes/${uid}/perfil`).once('value');
    return snap.val();
}

// ── Verificar si el plan está activo ─────────────────────────────────────────
function planActivo(perfil) {
    if (!perfil) return false;
    if (!perfil.activo) return false;
    const ahora = new Date();
    const venc = new Date(perfil.vencimiento);
    return ahora <= venc;
}

// ── Días restantes del plan ───────────────────────────────────────────────────
function diasRestantes(perfil) {
    if (!perfil) return 0;
    const ahora = new Date();
    const venc = new Date(perfil.vencimiento);
    const diff = venc - ahora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Verificar acceso a un módulo ──────────────────────────────────────────────
function tieneAcceso(modulo) {
    if (!currentPerfil) return false;
    if (!planActivo(currentPerfil)) return false;
    return (currentPerfil.modulos || []).includes(modulo);
}

// ── Guardar credenciales judiciales del cliente ───────────────────────────────
// Solo el cliente puede escribir/leer este nodo (Firebase Rules)
async function guardarCredenciales(tipo, usuario, password) {
    if (!currentUser) return { ok: false, error: 'No autenticado' };
    try {
        // Encriptación básica con btoa (para producción usar crypto-js o similar)
        const passEnc = btoa(unescape(encodeURIComponent(password)));
        await db.ref(`clientes/${currentUser.uid}/credenciales/${tipo}`).set({
            usuario,
            password: passEnc,
            updatedAt: new Date().toISOString()
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ── Leer credenciales judiciales ──────────────────────────────────────────────
async function leerCredenciales(tipo) {
    if (!currentUser) return null;
    const snap = await db.ref(`clientes/${currentUser.uid}/credenciales/${tipo}`).once('value');
    const data = snap.val();
    if (!data) return null;
    return {
        usuario: data.usuario,
        password: decodeURIComponent(escape(atob(data.password)))
    };
}

// ── Proteger una página (redirige si no hay sesión o plan vencido) ────────────
async function protegerPagina(moduloRequerido = null) {
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            const perfil = await cargarPerfil(user.uid);
            currentUser = user;
            currentPerfil = perfil;

            if (!planActivo(perfil)) {
                window.location.href = 'index.html?vencido=1';
                return;
            }
            if (moduloRequerido && !tieneAcceso(moduloRequerido)) {
                window.location.href = 'dashboard.html?sinAcceso=1';
                return;
            }
            resolve({ user, perfil });
        });
    });
}

// ── Recuperar contraseña ──────────────────────────────────────────────────────
async function recuperarPassword(email) {
    try {
        await auth.sendPasswordResetEmail(email);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: traducirError(error.code) };
    }
}

// ── Traducir errores de Firebase al español ───────────────────────────────────
function traducirError(code) {
    const errores = {
        'auth/email-already-in-use':    'Ese email ya está registrado.',
        'auth/invalid-email':           'El email no es válido.',
        'auth/weak-password':           'La contraseña debe tener al menos 6 caracteres.',
        'auth/user-not-found':          'No existe una cuenta con ese email.',
        'auth/wrong-password':          'Contraseña incorrecta.',
        'auth/too-many-requests':       'Demasiados intentos. Esperá unos minutos.',
        'auth/network-request-failed':  'Sin conexión. Verificá tu internet.',
        'auth/user-disabled':           'Esta cuenta fue deshabilitada.'
    };
    return errores[code] || 'Error inesperado. Intentá de nuevo.';
}

// ── Helper: nombre legible del plan ──────────────────────────────────────────
function nombrePlan(planId) {
    return PLANES[planId]?.nombre || planId;
}

// ── Exportar al scope global ──────────────────────────────────────────────────
window.FoliarAuth = {
    initAuth,
    registrar,
    login,
    logout,
    cargarPerfil,
    planActivo,
    diasRestantes,
    tieneAcceso,
    guardarCredenciales,
    leerCredenciales,
    protegerPagina,
    recuperarPassword,
    nombrePlan,
    PLANES,
    getUser: () => currentUser,
    getPerfil: () => currentPerfil
};
