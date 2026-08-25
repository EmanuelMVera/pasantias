/**
 * seedDemo.js — Datos demo de desarrollo (Etapa 11).
 *
 * Llena la base con empresas, responsables, reclutadores, ofertas,
 * alumnos/egresados con perfiles completos, postulaciones coherentes,
 * notificaciones con accionURL y mensajes entre múltiples roles.
 *
 * Uso:
 * node src/utils/seedDemo.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const models = require('../models');
const {
  sequelize,
  Usuario,
  Perfil,
  Empresa,
  EmpresaUsuario,
  Oferta,
} = models;

const Postulacion = models.Postulacion || models.Postulaciones;
const Notificacion = models.Notificacion || models.Notificaciones;
const Mensaje = models.Mensaje || models.Mensajes;

const EMPRESAS = require('../data/empresas.json');
const ALUMNOS = require('../data/alumnos.json');
const CATALOGOS = require('../data/catalogos.json');

const DEFAULT_PASSWORD = 'Admin1234!';
const MODALIDADES = ['presencial', 'remoto', 'hibrido'];

// tipoPuesto: mayoría pasante/trainee, minoría junior
const TIPOS_PUESTO = ['pasante', 'pasante', 'trainee', 'pasante', 'junior'];

// Distribución de estados de oferta: ~50% activa, ~25% pausada/cerrada, ~12% rechazada
const ESTADOS_OFERTA = ['activa', 'activa', 'activa', 'activa', 'pausada', 'pausada', 'cerrada', 'rechazada'];

// Estados de postulación con distribución realista
const ESTADOS_POSTULACION = [
  'en_revision', 'en_revision',
  'preseleccionado',
  'entrevista',
  'contratado',
  'rechazado', 'rechazado',
];

// Áreas de oferta según rubro de la empresa
const RUBRO_A_AREAS = {
  'Software':                    ['Programación', 'Desarrollo Web'],
  'Analítica de Datos':          ['Programación'],
  'Infraestructura Cloud':       ['Redes y Telecomunicaciones', 'Programación'],
  'Fintech':                     ['Programación', 'Administración'],
  'Telecomunicaciones':          ['Redes y Telecomunicaciones'],
  'Ciberseguridad':              ['Ciberseguridad'],
  'Electrónica Industrial':      ['Electrónica'],
  'Automatización y Control':    ['Automatización y Control'],
  'Mecánica y Mantenimiento':    ['Mecánica'],
  'Manufactura y Automatización':['Automatización y Control', 'Mecánica'],
  'Administración Empresarial':  ['Administración'],
  'Servicios Contables':         ['Contabilidad', 'Administración'],
  'Logística':                   ['Logística'],
  'Logística Sustentable':       ['Logística'],
  'Marketing Digital':           ['Marketing'],
  'Diseño Industrial':           ['Diseño Industrial'],
  'Software para Salud':         ['Programación', 'Desarrollo Web'],
  'Soporte IT y Redes':          ['Redes y Telecomunicaciones'],
  'Metalúrgica':                 ['Mecánica', 'Electrónica'],
  'Sistemas de Gestión':         ['Programación', 'Administración'],
};

// Variantes de título por área
const TITULOS_POR_AREA = {
  'Programación':              ['Desarrollo Backend', 'Desarrollo de Software', 'Automatización de Pruebas', 'Integración de APIs'],
  'Desarrollo Web':            ['Desarrollo Frontend', 'Desarrollo Full Stack', 'Maquetación y UI'],
  'Redes y Telecomunicaciones':['Soporte de Red', 'Administración de Infraestructura', 'Monitoreo de Redes'],
  'Ciberseguridad':            ['Análisis de Vulnerabilidades', 'Respuesta a Incidentes', 'Auditoría de Seguridad'],
  'Electrónica':               ['Mantenimiento Electrónico', 'Instrumentación Industrial', 'Diseño de Circuitos'],
  'Automatización y Control':  ['Programación de PLCs', 'SCADA y Supervisión', 'Automatización de Procesos'],
  'Mecánica':                  ['Mantenimiento Mecánico', 'Diseño de Componentes', 'Control de Calidad Dimensional'],
  'Administración':            ['Gestión Administrativa', 'Control de Procesos Internos', 'Soporte Operativo'],
  'Contabilidad':              ['Contabilidad General', 'Análisis Impositivo', 'Gestión de Cuentas Corrientes'],
  'Logística':                 ['Operaciones de Almacén', 'Control de Inventario', 'Coordinación de Distribución'],
  'Marketing':                 ['Marketing Digital', 'Community Management', 'Análisis de Métricas'],
  'Diseño Industrial':         ['Diseño de Producto', 'Modelado 3D', 'Documentación Técnica'],
};

const pick = (arr, i) => arr[i % arr.length];

function skillsFor(area, index) {
  const skills = CATALOGOS.habilidadesPorArea[area] || ['Comunicación', 'Trabajo en equipo', 'Responsabilidad'];
  return [skills[index % skills.length], skills[(index + 1) % skills.length], skills[(index + 2) % skills.length]];
}

function normalizeForUrl(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractDomain(sitioWeb) {
  return sitioWeb.replace('https://', '').split('.')[0];
}

function buildEmail(nombre, apellido, dominio, emailsSeen) {
  const base = `${normalizeForUrl(nombre)}.${normalizeForUrl(apellido)}`;
  let candidate = base;
  let idx = 2;
  while (emailsSeen.has(candidate)) {
    candidate = `${base}.${idx++}`;
  }
  emailsSeen.add(candidate);
  return `${candidate}@${dominio}.demo`;
}

async function destroyIfModel(model, options) {
  if (!model) return;
  await model.destroy(options);
}

async function seedDemo() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  const transaction = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos para la carga demo.');

    // ── LIMPIEZA ──────────────────────────────────────────────────────────────

    console.log('ℹ️  Limpiando registros demo anteriores...');

    const demoUsers = await Usuario.findAll({
      where: {
        [Op.or]: [
          { email: { [Op.like]: '%.demo' } },
          { email: { [Op.like]: '%@itbeltran.com.ar' }, rol: { [Op.in]: ['alumno', 'egresado'] } },
        ],
      },
      attributes: ['id'],
      transaction,
    });

    const userIds = demoUsers.map((u) => u.id);

    const empresasDemo = await Empresa.findAll({
      where: { razonSocial: { [Op.in]: EMPRESAS.map((e) => e.razonSocial) } },
      attributes: ['id'],
      transaction,
    });

    const empresaIds = empresasDemo.map((e) => e.id);

    if (userIds.length || empresaIds.length) {
      // FK order: mensajes → notificaciones → postulaciones → ofertas → empresa_usuarios → perfiles → empresas → usuarios
      await destroyIfModel(Mensaje, {
        where: {
          [Op.or]: [
            ...(userIds.length ? [{ emisorId: { [Op.in]: userIds } }] : []),
            ...(userIds.length ? [{ receptorId: { [Op.in]: userIds } }] : []),
          ],
        },
        transaction,
      });

      await destroyIfModel(Notificacion, {
        where: userIds.length ? { usuarioId: { [Op.in]: userIds } } : { id: { [Op.lt]: 0 } },
        transaction,
      });

      await destroyIfModel(Postulacion, {
        where: userIds.length ? { usuarioId: { [Op.in]: userIds } } : { id: { [Op.lt]: 0 } },
        transaction,
      });

      // Usuario/Empresa/Oferta son `paranoid` (soft delete, EST-08 Fase 1):
      // { force: true } fuerza el DELETE real acá, porque si no el email/cuit
      // de los registros "borrados" siguen ocupando el índice UNIQUE y la
      // próxima corrida del seed chocaría al intentar recrearlos.
      if (empresaIds.length) {
        await Oferta.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction, force: true });
        await EmpresaUsuario.destroy({ where: { empresaId: { [Op.in]: empresaIds } }, transaction });
        await Empresa.destroy({ where: { id: { [Op.in]: empresaIds } }, transaction, force: true });
      }

      if (userIds.length) {
        await Perfil.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
        await EmpresaUsuario.destroy({ where: { usuarioId: { [Op.in]: userIds } }, transaction });
        await Usuario.destroy({ where: { id: { [Op.in]: userIds } }, transaction, force: true });
      }
    }

    // ── EMPRESAS, RESPONSABLES, RECLUTADORES Y OFERTAS ───────────────────────

    const createdOfertas = [];
    const createdEmpresaTeams = []; // { owner, recruiters, empresa }

    console.log('🚀 Insertando empresas, responsables, reclutadores y ofertas...');

    for (let i = 0; i < EMPRESAS.length; i++) {
      const item = EMPRESAS[i];
      const dominio = extractDomain(item.sitioWeb);
      const emailsSeen = new Set();

      const ownerEmail = buildEmail(item.responsable.nombre, item.responsable.apellido, dominio, emailsSeen);

      const owner = await Usuario.create({
        nombre: item.responsable.nombre,
        apellido: item.responsable.apellido,
        email: ownerEmail,
        password: hash,
        rol: 'empresa',
        habilitado: true,
        activo: true,
        telefono: item.telefono,
        ubicacion: item.ciudad,
        fotoPerfil: item.responsable.fotoPerfil,
      }, { transaction });

      // empresas.cuit ahora exige exactamente 11 dígitos sin guiones
      // (EST-08 §4.5) — el JSON demo trae formato "30-30500001-2".
      const cuitLimpio = (item.cuit || '').replace(/\D/g, '');

      const empresa = await Empresa.create({
        usuarioId: owner.id,
        razonSocial: item.razonSocial,
        cuit: cuitLimpio.length === 11 ? cuitLimpio : null,
        descripcion: item.descripcion,
        rubro: item.rubro,
        sitioWeb: item.sitioWeb,
        telefono: item.telefono,
        direccion: item.direccion,
        ciudad: item.ciudad,
        estadoAprobacion: 'aprobada',
      }, { transaction });

      await EmpresaUsuario.create({
        empresaId: empresa.id,
        usuarioId: owner.id,
        rolInterno: 'admin_empresa',
        activo: true,
      }, { transaction });

      const recruiters = [];

      for (const rec of item.reclutadores) {
        const recEmail = buildEmail(rec.nombre, rec.apellido, dominio, emailsSeen);

        const reclutador = await Usuario.create({
          nombre: rec.nombre,
          apellido: rec.apellido,
          email: recEmail,
          password: hash,
          rol: 'empresa',
          habilitado: true,
          activo: true,
          telefono: item.telefono,
          ubicacion: item.ciudad,
          fotoPerfil: rec.fotoPerfil,
        }, { transaction });

        recruiters.push(reclutador);

        await EmpresaUsuario.create({
          empresaId: empresa.id,
          usuarioId: reclutador.id,
          rolInterno: 'reclutador',
          activo: true,
        }, { transaction });
      }

      createdEmpresaTeams.push({ owner, recruiters, empresa });

      // Ofertas (3-5 por empresa)
      const areas = RUBRO_A_AREAS[item.rubro] || [pick(CATALOGOS.areas, i)];
      const carrerasDestino = CATALOGOS.rubroACarreras[item.rubro] || [];
      const ofertasCount = 3 + (i % 3);

      for (let o = 0; o < ofertasCount; o++) {
        const area = pick(areas, o);
        const titulosArea = TITULOS_POR_AREA[area] || [`Puesto en ${area}`];
        const tituloBase = pick(titulosArea, o);

        const tipoPuesto = TIPOS_PUESTO[o % TIPOS_PUESTO.length];
        const esJunior = tipoPuesto === 'junior';
        const nivelExperiencia = esJunior ? 'junior' : 'sin_experiencia';
        const requiereExperiencia = esJunior;
        const experienciaDetalle = esJunior
          ? '6 meses a 1 año en el área o proyectos académicos equivalentes.'
          : null;

        const estado = ESTADOS_OFERTA[(i + o) % ESTADOS_OFERTA.length];
        // rechazada siempre sin moderar; algunas activas/pausadas/cerradas también sin moderar
        const moderada = estado !== 'rechazada' && !((i + o) % 4 === 3);

        const modalidad = pick(MODALIDADES, i + o);
        const habilidades = skillsFor(area, o);

        const titulo = tipoPuesto === 'junior'
          ? `Junior de ${tituloBase}`
          : tipoPuesto === 'trainee'
            ? `Trainee en ${tituloBase}`
            : `Pasante en ${tituloBase}`;

        const oferta = await Oferta.create({
          empresaId: empresa.id,
          titulo,
          descripcion: `Práctica profesional supervisada en ${area} dentro de ${item.razonSocial}. Incorporación al equipo con acompañamiento de referentes técnicos y posibilidad de continuidad.`,
          requisitos: `Conocimientos base en ${habilidades[0]} y ${habilidades[1]}. Se valora proactividad y ganas de aprender.`,
          area,
          modalidad,
          modalidadExtendida: modalidad === 'hibrido' ? '3 días presencial y 2 días remoto por semana' : null,
          ciudad: item.ciudad,
          remuneracion: 'A convenir',
          salario: 240000 + (o * 25000) + (esJunior ? 80000 : 0),
          beneficios: 'Capacitaciones, mentoría, certificación de experiencia y posibilidad de continuidad',
          cantidadVacantes: (o % 3) + 1,
          habilidadesRequeridas: habilidades,
          tipoPuesto,
          requiereExperiencia,
          experienciaDetalle,
          carrerasDestinatarias: carrerasDestino,
          nivelExperiencia,
          fechaPublicacion: new Date(),
          fechaLimite: new Date(Date.now() + (30 + o * 10) * 24 * 60 * 60 * 1000),
          estado,
          moderada,
          vistas: (i * 7 + o * 3 + 1) % 80 + 5,
        }, { transaction });

        createdOfertas.push(oferta);
      }
    }

    // ── ALUMNOS / EGRESADOS Y PERFILES ────────────────────────────────────────

    const createdAlumnos = [];

    console.log('🚀 Insertando alumnos/egresados y perfiles...');

    for (let i = 0; i < ALUMNOS.length; i++) {
      const item = ALUMNOS[i];
      const dni = String(item.dni || (37000000 + i)).padStart(8, '0');
      const email = `${dni}@itbeltran.com.ar`;

      const alumno = await Usuario.create({
        nombre: item.nombre,
        apellido: item.apellido,
        email,
        password: hash,
        rol: item.rol,
        habilitado: true,
        activo: true,
        telefono: `11-55${String(1000 + i).slice(-4)}`,
        ubicacion: i % 2 === 0 ? 'Avellaneda' : 'Lanús',
        fotoPerfil: item.fotoPerfil,
      }, { transaction });

      createdAlumnos.push(alumno);

      await Perfil.create({
        usuarioId: alumno.id,
        carrera: item.carrera,
        anioEgreso: item.rol === 'egresado' ? 2024 - (i % 3) : null,
        descripcion: item.descripcion,
        habilidades: item.habilidades,
        idiomas: item.idiomas,
        certificaciones: item.certificaciones,
        linkedin: `https://linkedin.com/in/${normalizeForUrl(item.nombre)}-${normalizeForUrl(item.apellido)}`,
        github: `https://github.com/${normalizeForUrl(item.nombre)}${normalizeForUrl(item.apellido)}`,
        portfolio: item.rol === 'egresado'
          ? `https://${normalizeForUrl(item.nombre)}-${normalizeForUrl(item.apellido)}.dev`
          : null,
        cvPath: `/uploads/cv/demo-${dni}.pdf`,
        fotoPerfil: item.fotoPerfil,
        areaInteres: item.areaInteres,
        disponibilidad: item.disponibilidad,
        preferenciasLaborales: `Busco una oportunidad en ${item.areaInteres} que me permita aplicar mis conocimientos y seguir creciendo profesionalmente.`,
        experienciaLaboral: item.experienciaLaboral,
        proyectos: item.proyectos,
        visibilidadPerfil: true,
      }, { transaction });
    }

    // ── POSTULACIONES ─────────────────────────────────────────────────────────

    if (Postulacion && createdOfertas.length) {
      console.log('🚀 Insertando postulaciones demo...');

      const ofertasActivas = createdOfertas.filter((o) => o.estado === 'activa');

      for (let i = 0; i < createdAlumnos.length; i++) {
        const alumno = createdAlumnos[i];
        const alumnoData = ALUMNOS[i];

        // Preferir ofertas compatibles con la carrera del alumno
        const compatibles = ofertasActivas.filter(
          (o) => Array.isArray(o.carrerasDestinatarias) && o.carrerasDestinatarias.includes(alumnoData.carrera)
        );
        const pool = compatibles.length > 0 ? compatibles : ofertasActivas;

        const postulacionesPorAlumno = i % 3 === 0 ? 2 : 1;
        const seenOfertaIds = new Set();

        for (let p = 0; p < postulacionesPorAlumno; p++) {
          let oferta = pool[(i + p * 7) % pool.length];

          // Evitar duplicado con la primera postulación del mismo alumno
          if (seenOfertaIds.has(oferta.id)) {
            oferta = pool[(i + p * 7 + 1) % pool.length];
          }
          if (seenOfertaIds.has(oferta.id)) continue;
          seenOfertaIds.add(oferta.id);

          await Postulacion.findOrCreate({
            where: {
              usuarioId: alumno.id,
              ofertaId: oferta.id,
            },
            defaults: {
              cartaPresentacion: `Me interesa este puesto porque se alinea con mi formación en ${alumnoData.carrera} y mi interés en ${alumnoData.areaInteres}. Estoy disponible para comenzar de forma ${alumnoData.disponibilidad}.`,
              estado: pick(ESTADOS_POSTULACION, i + p),
              fechaPostulacion: new Date(Date.now() - ((i + p) % 14) * 24 * 60 * 60 * 1000),
              notasEmpresa: p === 0 ? 'Perfil revisado en instancia inicial. Buen ajuste técnico.' : null,
            },
            transaction,
          });
        }
      }
    }

    // ── NOTIFICACIONES ────────────────────────────────────────────────────────

    if (Notificacion) {
      console.log('🚀 Insertando notificaciones demo...');

      // Para alumnos: estado de postulación y oferta compatible
      for (let i = 0; i < createdAlumnos.length; i++) {
        await Notificacion.create({
          usuarioId: createdAlumnos[i].id,
          titulo: 'Tu postulación fue revisada',
          mensaje: 'El estado de tu postulación fue actualizado. Revisá el detalle en tus postulaciones.',
          tipo: 'estado',
          leida: i % 2 === 0,
          prioridad: 'normal',
          tipoVisual: 'info',
          accionURL: '/mis-postulaciones',
        }, { transaction });

        if (i % 3 === 0) {
          await Notificacion.create({
            usuarioId: createdAlumnos[i].id,
            titulo: 'Nueva oferta compatible con tu perfil',
            mensaje: `Hay una nueva oferta activa relacionada con ${ALUMNOS[i].areaInteres}.`,
            tipo: 'oferta',
            leida: false,
            prioridad: 'normal',
            tipoVisual: 'info',
            accionURL: '/ofertas',
          }, { transaction });
        }
      }

      // Para empresas: nueva postulación recibida y publicación aprobada
      for (let i = 0; i < createdEmpresaTeams.length; i++) {
        const { owner, empresa } = createdEmpresaTeams[i];

        const ofertaActiva = createdOfertas.find(
          (o) => o.empresaId === empresa.id && o.estado === 'activa'
        );

        if (ofertaActiva) {
          await Notificacion.create({
            usuarioId: owner.id,
            titulo: 'Nueva postulación recibida',
            mensaje: `Recibiste una nueva postulación para "${ofertaActiva.titulo}".`,
            tipo: 'postulacion',
            leida: i % 3 === 0,
            prioridad: 'normal',
            tipoVisual: 'success',
            accionURL: `/empresa/postulantes/${ofertaActiva.id}`,
          }, { transaction });
        }

        if (i % 2 === 0) {
          await Notificacion.create({
            usuarioId: owner.id,
            titulo: 'Tu oferta fue aprobada',
            mensaje: 'Una de tus ofertas superó la revisión y ya es visible para los alumnos.',
            tipo: 'oferta',
            leida: true,
            prioridad: 'normal',
            tipoVisual: 'success',
            accionURL: '/empresa',
          }, { transaction });
        }

        // Notificación de solicitud de reclutador para algunas empresas
        if (i % 5 === 0) {
          await Notificacion.create({
            usuarioId: owner.id,
            titulo: 'Solicitud de acceso de reclutador',
            mensaje: 'Un usuario solicitó unirse a tu empresa como reclutador.',
            tipo: 'sistema',
            leida: false,
            prioridad: 'alta',
            tipoVisual: 'warning',
            accionURL: '/empresa/equipo',
          }, { transaction });
        }
      }
    }

    // ── MENSAJES ──────────────────────────────────────────────────────────────

    if (Mensaje && createdEmpresaTeams.length && createdAlumnos.length) {
      console.log('🚀 Insertando mensajes demo...');

      // 1. Reclutador/owner → Alumno (coordinación de entrevistas)
      for (let i = 0; i < Math.min(createdAlumnos.length, 12); i++) {
        const alumno = createdAlumnos[i];
        const team = createdEmpresaTeams[i % createdEmpresaTeams.length];
        const emisor = team.recruiters.length > 0 ? team.recruiters[0] : team.owner;

        await Mensaje.create({
          emisorId: emisor.id,
          receptorId: alumno.id,
          mensaje: `Hola ${ALUMNOS[i].nombre}, revisamos tu postulación y nos gustaría coordinar una entrevista. ¿Tenés disponibilidad esta semana?`,
          leido: i % 2 === 0,
        }, { transaction });

        await Mensaje.create({
          emisorId: alumno.id,
          receptorId: emisor.id,
          mensaje: 'Hola, muchas gracias por contactarme. Quedo atento/a para coordinar el día y el horario.',
          leido: true,
        }, { transaction });
      }

      // 2. Alumno → Alumno (conversaciones entre pares)
      const mensajesEntrePares = [
        ['¡Hola! Vi que también te postulaste a esta empresa. ¿Cómo te fue en el proceso?', '¡Hola! Estoy en la etapa de revisión. ¿Y vos?'],
        ['¿Sabés si piden carta de presentación en inglés?', 'No, en esta empresa la pidieron en español. Suerte!'],
        ['¿Estás yendo a las charlas de empleabilidad del instituto?', 'Sí, la del miércoles estuvo muy buena.'],
        ['Vi una oferta de pasantía en logística, ¿la viste?', 'Sí, me parece que está en activa. La acabo de postular.'],
        ['¿Pudiste subir el CV actualizado al sistema?', 'Sí, lo actualicé esta mañana. Te cuento cómo resultó.'],
      ];

      for (let i = 0; i < 5; i++) {
        const a1 = createdAlumnos[i];
        const a2 = createdAlumnos[i + 10];

        await Mensaje.create({
          emisorId: a1.id,
          receptorId: a2.id,
          mensaje: mensajesEntrePares[i][0],
          leido: false,
        }, { transaction });

        await Mensaje.create({
          emisorId: a2.id,
          receptorId: a1.id,
          mensaje: mensajesEntrePares[i][1],
          leido: true,
        }, { transaction });
      }

      // 3. Mensajes intra-empresa: owner → primer reclutador
      const mensajesIntraEmpresa = [
        ['Podés avanzar con los candidatos del turno de mañana. Yo coordino la sala.', 'Perfecto, confirmo horario esta tarde.'],
        ['¿Revisaste los perfiles nuevos que llegaron hoy?', 'Sí, hay dos que se ven muy bien. Los llamo esta semana.'],
        ['Acualizá la descripción de la oferta, piden agregar horario.', 'Listo, ya lo modifiqué.'],
        ['Cerramos la oferta de la semana pasada. Ya tenemos cubierto el puesto.', 'Genial, lo marco en el sistema.'],
        ['¿Hay algún candidato para la segunda ronda de entrevistas?', 'Sí, tengo dos preseleccionados. Te comparto los perfiles.'],
        ['Recordá que el plazo de la oferta vence el viernes.', 'Gracias por el aviso, ya tengo la lista lista.'],
        ['La coordinadora académica va a mandar alumnos nuevos esta semana.', 'Perfecto, les hago el seguimiento.'],
        ['¿Ya cargaste las notas de los candidatos entrevistados ayer?', 'Sí, están en el sistema con el estado actualizado.'],
      ];

      for (let i = 0; i < Math.min(createdEmpresaTeams.length, 8); i++) {
        const { owner, recruiters } = createdEmpresaTeams[i];
        if (recruiters.length > 0) {
          await Mensaje.create({
            emisorId: owner.id,
            receptorId: recruiters[0].id,
            mensaje: mensajesIntraEmpresa[i][0],
            leido: i % 2 === 0,
          }, { transaction });

          await Mensaje.create({
            emisorId: recruiters[0].id,
            receptorId: owner.id,
            mensaje: mensajesIntraEmpresa[i][1],
            leido: true,
          }, { transaction });
        }
      }
    }

    await transaction.commit();

    const totalReclutadores = createdEmpresaTeams.reduce((acc, t) => acc + t.recruiters.length, 0);
    const ofertasActivas = createdOfertas.filter((o) => o.estado === 'activa').length;

    console.log('\n✨ Seed demo finalizado correctamente ✨');
    console.log(`🏢 Empresas creadas:           ${EMPRESAS.length}`);
    console.log(`👔 Admin empresa creados:      ${EMPRESAS.length}`);
    console.log(`🤝 Reclutadores creados:       ${totalReclutadores}`);
    console.log(`🎓 Alumnos/Egresados creados:  ${ALUMNOS.length}`);
    console.log(`📌 Ofertas creadas:            ${createdOfertas.length} (${ofertasActivas} activas)`);
    console.log(`🔑 Password demo para todos:   ${DEFAULT_PASSWORD}`);
    process.exit(0);
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Error ejecutando seed demo:', err);
    process.exit(1);
  }
}

seedDemo();
