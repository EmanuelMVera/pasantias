--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: enum_activity_logs_accion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_activity_logs_accion AS ENUM (
    'login',
    'logout',
    'crear_usuario',
    'editar_usuario',
    'eliminar_usuario',
    'cambiar_rol',
    'toggle_usuario',
    'aprobar_empresa',
    'rechazar_empresa',
    'aprobar_oferta',
    'rechazar_oferta',
    'crear_oferta',
    'cerrar_oferta',
    'postular',
    'cambiar_estado_postulacion',
    'aprobar_solicitud_empresa',
    'rechazar_solicitud_empresa',
    'aprobar_solicitud_reclutador',
    'rechazar_solicitud_reclutador',
    'sistema',
    'solicitar_recuperacion_miembro',
    'importar_alumnos_csv',
    'pausar_oferta',
    'reactivar_oferta',
    'exportar_logs',
    'exportar_estadisticas'
);


--
-- Name: enum_empresas_estadoAprobacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_empresas_estadoAprobacion" AS ENUM (
    'pendiente',
    'aprobada',
    'rechazada'
);


--
-- Name: enum_notificaciones_prioridad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_notificaciones_prioridad AS ENUM (
    'baja',
    'normal',
    'alta',
    'urgente'
);


--
-- Name: enum_notificaciones_tipoVisual; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_notificaciones_tipoVisual" AS ENUM (
    'info',
    'success',
    'warning',
    'error'
);


--
-- Name: enum_ofertas_modalidad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ofertas_modalidad AS ENUM (
    'presencial',
    'remoto',
    'hibrido'
);


--
-- Name: enum_ofertas_nivelExperiencia; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ofertas_nivelExperiencia" AS ENUM (
    'sin_experiencia',
    'junior',
    'semi_senior'
);


--
-- Name: enum_perfiles_disponibilidad; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_perfiles_disponibilidad AS ENUM (
    'inmediata',
    '1_mes',
    '3_meses',
    'no_disponible'
);


--
-- Name: enum_solicitudes_empresa_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_solicitudes_empresa_estado AS ENUM (
    'pendiente',
    'aprobado',
    'rechazado'
);


--
-- Name: enum_solicitudes_reclutador_estado; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_solicitudes_reclutador_estado AS ENUM (
    'pendiente',
    'aprobado',
    'rechazado'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id integer NOT NULL,
    "usuarioId" integer,
    accion public.enum_activity_logs_accion NOT NULL,
    entidad character varying(50),
    "entidadId" integer,
    detalle json,
    ip character varying(45),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "requestId" character varying(36)
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archivos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "usuarioPropietarioId" integer NOT NULL,
    tipo character varying(30) NOT NULL,
    "nombreOriginal" character varying(255),
    "claveAlmacenamiento" character varying(500) NOT NULL,
    "mimeType" character varying(100),
    "tamanioBytes" integer,
    "hashSha256" character varying(64),
    backend character varying(10) DEFAULT 'local'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT chk_archivos_backend CHECK (((backend)::text = ANY ((ARRAY['local'::character varying, 's3'::character varying])::text[]))),
    CONSTRAINT chk_archivos_tipo CHECK (((tipo)::text = ANY ((ARRAY['cv'::character varying, 'carta_recomendacion'::character varying, 'foto_perfil'::character varying, 'logo_empresa'::character varying, 'certificacion'::character varying, 'adjunto_mensaje'::character varying])::text[])))
);


--
-- Name: configuracion_institucional; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_institucional (
    id integer NOT NULL,
    clave character varying(100) NOT NULL,
    valor text NOT NULL,
    tipo character varying(20) DEFAULT 'string'::character varying NOT NULL,
    descripcion text,
    "editablePorAdmin" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: configuracion_institucional_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.configuracion_institucional_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: configuracion_institucional_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.configuracion_institucional_id_seq OWNED BY public.configuracion_institucional.id;


--
-- Name: empresa_usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa_usuarios (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    "usuarioId" integer NOT NULL,
    "rolInterno" character varying(20) DEFAULT 'reclutador'::character varying NOT NULL,
    activo boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_empresa_usuarios_rolinterno CHECK ((("rolInterno")::text = ANY ((ARRAY['admin_empresa'::character varying, 'reclutador'::character varying])::text[])))
);


--
-- Name: empresa_usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_usuarios_id_seq OWNED BY public.empresa_usuarios.id;


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id integer NOT NULL,
    "usuarioId" integer NOT NULL,
    "razonSocial" character varying(200) NOT NULL,
    cuit character varying(11),
    descripcion text,
    rubro character varying(150),
    "sitioWeb" character varying(255),
    telefono character varying(30),
    direccion character varying(255),
    ciudad character varying(100),
    logo character varying(255),
    "estadoAprobacion" public."enum_empresas_estadoAprobacion" DEFAULT 'pendiente'::public."enum_empresas_estadoAprobacion",
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp with time zone,
    "aprobadaPorUsuarioId" integer,
    "aprobadaEn" timestamp with time zone,
    "motivoRechazo" text,
    CONSTRAINT chk_empresas_cuit_formato CHECK (((cuit IS NULL) OR ((cuit)::text ~ '^[0-9]{11}$'::text)))
);


--
-- Name: empresas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresas_id_seq OWNED BY public.empresas.id;


--
-- Name: mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes (
    id integer NOT NULL,
    "emisorId" integer NOT NULL,
    "receptorId" integer NOT NULL,
    mensaje text NOT NULL,
    leido boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: mensajes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mensajes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mensajes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mensajes_id_seq OWNED BY public.mensajes.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id integer NOT NULL,
    "usuarioId" integer NOT NULL,
    titulo character varying(200) NOT NULL,
    mensaje text NOT NULL,
    tipo character varying(30) DEFAULT 'sistema'::character varying,
    leida boolean DEFAULT false,
    enlace character varying(255),
    prioridad public.enum_notificaciones_prioridad DEFAULT 'normal'::public.enum_notificaciones_prioridad,
    "tipoVisual" public."enum_notificaciones_tipoVisual" DEFAULT 'info'::public."enum_notificaciones_tipoVisual",
    "accionURL" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_notificaciones_tipo CHECK (((tipo)::text = ANY ((ARRAY['postulacion'::character varying, 'estado'::character varying, 'oferta'::character varying, 'chat'::character varying, 'sistema'::character varying])::text[])))
);


--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_id_seq OWNED BY public.notificaciones.id;


--
-- Name: ofertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ofertas (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    titulo character varying(200) NOT NULL,
    descripcion text NOT NULL,
    requisitos text,
    area character varying(150),
    modalidad public.enum_ofertas_modalidad DEFAULT 'presencial'::public.enum_ofertas_modalidad,
    "modalidadExtendida" character varying(255),
    ciudad character varying(100),
    remuneracion character varying(100),
    salario integer,
    beneficios text,
    "cantidadVacantes" integer DEFAULT 1,
    "habilidadesRequeridas" character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    "nivelExperiencia" public."enum_ofertas_nivelExperiencia" DEFAULT 'sin_experiencia'::public."enum_ofertas_nivelExperiencia",
    "tipoPuesto" character varying(20),
    "requiereExperiencia" boolean DEFAULT false,
    "experienciaDetalle" text,
    "carrerasDestinatarias" character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    "fechaPublicacion" timestamp with time zone,
    "fechaLimite" timestamp with time zone,
    estado character varying(20) DEFAULT 'activa'::character varying,
    moderada boolean DEFAULT false,
    vistas integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deletedAt" timestamp with time zone,
    "creadaPorUsuarioId" integer,
    CONSTRAINT chk_ofertas_estado CHECK (((estado)::text = ANY ((ARRAY['activa'::character varying, 'pausada'::character varying, 'rechazada'::character varying, 'cerrada'::character varying])::text[])))
);


--
-- Name: ofertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ofertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ofertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ofertas_id_seq OWNED BY public.ofertas.id;


--
-- Name: perfiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfiles (
    id integer NOT NULL,
    "usuarioId" integer NOT NULL,
    carrera character varying(150),
    "anioEgreso" integer,
    descripcion text,
    habilidades character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    idiomas character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    certificaciones character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    linkedin character varying(255),
    github character varying(255),
    portfolio character varying(255),
    "redesSociales" jsonb,
    "cvPath" character varying(255),
    "cartaRecomendacion" character varying(255),
    "fotoPerfil" character varying(255),
    "areaInteres" character varying(150),
    disponibilidad public.enum_perfiles_disponibilidad DEFAULT 'inmediata'::public.enum_perfiles_disponibilidad,
    "preferenciasLaborales" text,
    "salarioPretendido" character varying(100),
    "visibilidadPerfil" boolean DEFAULT true,
    "experienciaLaboral" text,
    proyectos text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    legajo character varying(20),
    "cvArchivoId" uuid,
    "cartaArchivoId" uuid
);


--
-- Name: perfiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perfiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perfiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perfiles_id_seq OWNED BY public.perfiles.id;


--
-- Name: postulacion_historial_estados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postulacion_historial_estados (
    id integer NOT NULL,
    "postulacionId" integer NOT NULL,
    "estadoAnterior" character varying(30),
    "estadoNuevo" character varying(30) NOT NULL,
    "cambiadoPorUsuarioId" integer,
    motivo text,
    "notaInterna" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: postulacion_historial_estados_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.postulacion_historial_estados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: postulacion_historial_estados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.postulacion_historial_estados_id_seq OWNED BY public.postulacion_historial_estados.id;


--
-- Name: postulaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.postulaciones (
    id integer NOT NULL,
    "usuarioId" integer NOT NULL,
    "ofertaId" integer NOT NULL,
    "cartaPresentacion" text,
    estado character varying(30) DEFAULT 'en_revision'::character varying,
    "fechaPostulacion" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "notasEmpresa" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cvArchivoId" uuid,
    CONSTRAINT chk_postulaciones_estado CHECK (((estado)::text = ANY ((ARRAY['en_revision'::character varying, 'preseleccionado'::character varying, 'entrevista'::character varying, 'contratado'::character varying, 'rechazado'::character varying])::text[])))
);


--
-- Name: postulaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.postulaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: postulaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.postulaciones_id_seq OWNED BY public.postulaciones.id;


--
-- Name: solicitudes_empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_empresa (
    id integer NOT NULL,
    "razonSocial" character varying(200) NOT NULL,
    cuit character varying(20) NOT NULL,
    rubro character varying(150) NOT NULL,
    direccion character varying(255),
    ciudad character varying(100),
    email character varying(255) NOT NULL,
    "sitioWeb" character varying(255),
    telefono character varying(30),
    "responsableNombre" character varying(150),
    "responsableApellido" character varying(150),
    "responsableEmail" character varying(255),
    "responsableTelefono" character varying(30),
    "responsableCargo" character varying(100),
    "carrerasInteres" json DEFAULT '[]'::json,
    descripcion text,
    puestos text,
    estado public.enum_solicitudes_empresa_estado DEFAULT 'pendiente'::public.enum_solicitudes_empresa_estado NOT NULL,
    reclutadores json DEFAULT '[]'::json,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revisadaPorUsuarioId" integer,
    "revisadaEn" timestamp with time zone,
    "motivoRechazo" text,
    "empresaIdCreada" integer
);


--
-- Name: solicitudes_empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_empresa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_empresa_id_seq OWNED BY public.solicitudes_empresa.id;


--
-- Name: solicitudes_reclutador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_reclutador (
    id integer NOT NULL,
    "empresaId" integer NOT NULL,
    nombre character varying(150) NOT NULL,
    apellido character varying(150),
    email character varying(255) NOT NULL,
    estado public.enum_solicitudes_reclutador_estado DEFAULT 'pendiente'::public.enum_solicitudes_reclutador_estado NOT NULL,
    "motivoRechazo" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: solicitudes_reclutador_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitudes_reclutador_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: solicitudes_reclutador_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.solicitudes_reclutador_id_seq OWNED BY public.solicitudes_reclutador.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL,
    rol character varying(20) DEFAULT 'alumno'::character varying NOT NULL,
    activo boolean DEFAULT true,
    habilitado boolean DEFAULT true,
    telefono character varying(30),
    ubicacion character varying(150),
    "ultimoAcceso" timestamp with time zone,
    "fotoPerfil" character varying(255),
    "tokenReset" character varying(255),
    "tokenResetExpira" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tokenResetUsadoEn" timestamp with time zone,
    "tokenVersion" integer DEFAULT 0 NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT chk_usuarios_rol CHECK (((rol)::text = ANY ((ARRAY['alumno'::character varying, 'egresado'::character varying, 'empresa'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Name: configuracion_institucional id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_institucional ALTER COLUMN id SET DEFAULT nextval('public.configuracion_institucional_id_seq'::regclass);


--
-- Name: empresa_usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios ALTER COLUMN id SET DEFAULT nextval('public.empresa_usuarios_id_seq'::regclass);


--
-- Name: empresas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas ALTER COLUMN id SET DEFAULT nextval('public.empresas_id_seq'::regclass);


--
-- Name: mensajes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes ALTER COLUMN id SET DEFAULT nextval('public.mensajes_id_seq'::regclass);


--
-- Name: notificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id SET DEFAULT nextval('public.notificaciones_id_seq'::regclass);


--
-- Name: ofertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas ALTER COLUMN id SET DEFAULT nextval('public.ofertas_id_seq'::regclass);


--
-- Name: perfiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles ALTER COLUMN id SET DEFAULT nextval('public.perfiles_id_seq'::regclass);


--
-- Name: postulacion_historial_estados id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulacion_historial_estados ALTER COLUMN id SET DEFAULT nextval('public.postulacion_historial_estados_id_seq'::regclass);


--
-- Name: postulaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones ALTER COLUMN id SET DEFAULT nextval('public.postulaciones_id_seq'::regclass);


--
-- Name: solicitudes_empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_empresa ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_empresa_id_seq'::regclass);


--
-- Name: solicitudes_reclutador id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_reclutador ALTER COLUMN id SET DEFAULT nextval('public.solicitudes_reclutador_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: archivos archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos
    ADD CONSTRAINT archivos_pkey PRIMARY KEY (id);


--
-- Name: configuracion_institucional configuracion_institucional_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_institucional
    ADD CONSTRAINT configuracion_institucional_clave_key UNIQUE (clave);


--
-- Name: configuracion_institucional configuracion_institucional_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_institucional
    ADD CONSTRAINT configuracion_institucional_pkey PRIMARY KEY (id);


--
-- Name: empresa_usuarios empresa_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT empresa_usuarios_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: mensajes mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT mensajes_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: ofertas ofertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas
    ADD CONSTRAINT ofertas_pkey PRIMARY KEY (id);


--
-- Name: perfiles perfiles_legajo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_legajo_key UNIQUE (legajo);


--
-- Name: perfiles perfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);


--
-- Name: postulacion_historial_estados postulacion_historial_estados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulacion_historial_estados
    ADD CONSTRAINT postulacion_historial_estados_pkey PRIMARY KEY (id);


--
-- Name: postulaciones postulaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones
    ADD CONSTRAINT postulaciones_pkey PRIMARY KEY (id);


--
-- Name: solicitudes_empresa solicitudes_empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_empresa
    ADD CONSTRAINT solicitudes_empresa_pkey PRIMARY KEY (id);


--
-- Name: solicitudes_reclutador solicitudes_reclutador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_reclutador
    ADD CONSTRAINT solicitudes_reclutador_pkey PRIMARY KEY (id);


--
-- Name: empresa_usuarios unique_empresa_usuario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT unique_empresa_usuario UNIQUE ("empresaId", "usuarioId");


--
-- Name: empresas unique_empresa_usuario_dueno; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT unique_empresa_usuario_dueno UNIQUE ("usuarioId");


--
-- Name: empresas unique_empresas_cuit; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT unique_empresas_cuit UNIQUE (cuit);


--
-- Name: perfiles unique_perfil_usuario; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT unique_perfil_usuario UNIQUE ("usuarioId");


--
-- Name: postulaciones unique_postulacion; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones
    ADD CONSTRAINT unique_postulacion UNIQUE ("usuarioId", "ofertaId");


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_activity_logs_accion_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_accion_created ON public.activity_logs USING btree (accion, "createdAt" DESC);


--
-- Name: idx_activity_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_created ON public.activity_logs USING btree ("createdAt" DESC);


--
-- Name: idx_activity_logs_entidad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_entidad ON public.activity_logs USING btree (entidad, "entidadId");


--
-- Name: idx_activity_logs_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_request ON public.activity_logs USING btree ("requestId") WHERE ("requestId" IS NOT NULL);


--
-- Name: idx_activity_logs_usuario_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_usuario_created ON public.activity_logs USING btree ("usuarioId", "createdAt" DESC);


--
-- Name: idx_archivos_propietario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archivos_propietario ON public.archivos USING btree ("usuarioPropietarioId");


--
-- Name: idx_empresa_usuarios_usuario_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresa_usuarios_usuario_activo ON public.empresa_usuarios USING btree ("usuarioId", activo);


--
-- Name: idx_empresas_aprobacion_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_empresas_aprobacion_pendiente ON public.empresas USING btree ("estadoAprobacion") WHERE ("estadoAprobacion" = 'pendiente'::public."enum_empresas_estadoAprobacion");


--
-- Name: idx_historial_postulacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_postulacion ON public.postulacion_historial_estados USING btree ("postulacionId");


--
-- Name: idx_mensajes_emisor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensajes_emisor_created ON public.mensajes USING btree ("emisorId", "createdAt" DESC);


--
-- Name: idx_mensajes_receptor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensajes_receptor_created ON public.mensajes USING btree ("receptorId", "createdAt" DESC);


--
-- Name: idx_notificaciones_usuario_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_usuario_created ON public.notificaciones USING btree ("usuarioId", "createdAt" DESC);


--
-- Name: idx_notificaciones_usuario_leida; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_usuario_leida ON public.notificaciones USING btree ("usuarioId", leida);


--
-- Name: idx_ofertas_busqueda_texto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_busqueda_texto ON public.ofertas USING gin (to_tsvector('spanish'::regconfig, (((((COALESCE(titulo, ''::character varying))::text || ' '::text) || COALESCE(descripcion, ''::text)) || ' '::text) || COALESCE(requisitos, ''::text))));


--
-- Name: idx_ofertas_carreras_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_carreras_gin ON public.ofertas USING gin ("carrerasDestinatarias") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_ofertas_creada_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_creada_por ON public.ofertas USING btree ("creadaPorUsuarioId") WHERE ("creadaPorUsuarioId" IS NOT NULL);


--
-- Name: idx_ofertas_empresa_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_empresa_estado ON public.ofertas USING btree ("empresaId", estado);


--
-- Name: idx_ofertas_estado_moderada_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_estado_moderada_created ON public.ofertas USING btree (estado, moderada, "createdAt" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_ofertas_estado_publicacion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_estado_publicacion ON public.ofertas USING btree (estado, "fechaPublicacion" DESC);


--
-- Name: idx_ofertas_fecha_limite_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_fecha_limite_activa ON public.ofertas USING btree ("fechaLimite") WHERE ((estado)::text = 'activa'::text);


--
-- Name: idx_ofertas_habilidades_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_habilidades_gin ON public.ofertas USING gin ("habilidadesRequeridas") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_ofertas_moderada_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ofertas_moderada_estado ON public.ofertas USING btree (moderada, estado);


--
-- Name: idx_postulaciones_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postulaciones_created ON public.postulaciones USING btree ("createdAt" DESC);


--
-- Name: idx_postulaciones_oferta_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postulaciones_oferta_estado ON public.postulaciones USING btree ("ofertaId", estado);


--
-- Name: idx_postulaciones_oferta_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postulaciones_oferta_updated ON public.postulaciones USING btree ("ofertaId", "updatedAt" DESC);


--
-- Name: idx_postulaciones_usuario_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postulaciones_usuario_created ON public.postulaciones USING btree ("usuarioId", "createdAt" DESC);


--
-- Name: idx_postulaciones_usuario_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_postulaciones_usuario_estado ON public.postulaciones USING btree ("usuarioId", estado);


--
-- Name: idx_solicitudes_empresa_estado_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitudes_empresa_estado_created ON public.solicitudes_empresa USING btree (estado, "createdAt");


--
-- Name: idx_solicitudes_reclutador_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_solicitudes_reclutador_empresa ON public.solicitudes_reclutador USING btree ("empresaId");


--
-- Name: idx_usuarios_apellido_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_apellido_trgm ON public.usuarios USING gin (apellido public.gin_trgm_ops);


--
-- Name: idx_usuarios_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_created ON public.usuarios USING btree ("createdAt" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_usuarios_email_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_email_trgm ON public.usuarios USING gin (email public.gin_trgm_ops);


--
-- Name: idx_usuarios_nombre_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_nombre_trgm ON public.usuarios USING gin (nombre public.gin_trgm_ops);


--
-- Name: idx_usuarios_rol_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_rol_activo ON public.usuarios USING btree (rol, activo) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_usuarios_token_reset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuarios_token_reset ON public.usuarios USING btree ("tokenReset") WHERE ("tokenReset" IS NOT NULL);


--
-- Name: mensajes_emisor_receptor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensajes_emisor_receptor_idx ON public.mensajes USING btree ("emisorId", "receptorId");


--
-- Name: mensajes_receptor_leido_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensajes_receptor_leido_idx ON public.mensajes USING btree ("receptorId", leido);


--
-- Name: usuarios_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usuarios_email_lower_unique ON public.usuarios USING btree (lower((email)::text));


--
-- Name: activity_logs activity_logs_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT "activity_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: archivos archivos_usuarioPropietarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archivos
    ADD CONSTRAINT "archivos_usuarioPropietarioId_fkey" FOREIGN KEY ("usuarioPropietarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: empresa_usuarios empresa_usuarios_empresaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT "empresa_usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_usuarios empresa_usuarios_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa_usuarios
    ADD CONSTRAINT "empresa_usuarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: empresas empresas_aprobadaPorUsuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT "empresas_aprobadaPorUsuarioId_fkey" FOREIGN KEY ("aprobadaPorUsuarioId") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: empresas empresas_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT "empresas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: mensajes mensajes_emisorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT "mensajes_emisorId_fkey" FOREIGN KEY ("emisorId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: mensajes mensajes_receptorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes
    ADD CONSTRAINT "mensajes_receptorId_fkey" FOREIGN KEY ("receptorId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT "notificaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: ofertas ofertas_creadaPorUsuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas
    ADD CONSTRAINT "ofertas_creadaPorUsuarioId_fkey" FOREIGN KEY ("creadaPorUsuarioId") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: ofertas ofertas_empresaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ofertas
    ADD CONSTRAINT "ofertas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: perfiles perfiles_cartaArchivoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT "perfiles_cartaArchivoId_fkey" FOREIGN KEY ("cartaArchivoId") REFERENCES public.archivos(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_cvArchivoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT "perfiles_cvArchivoId_fkey" FOREIGN KEY ("cvArchivoId") REFERENCES public.archivos(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT "perfiles_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: postulacion_historial_estados postulacion_historial_estados_cambiadoPorUsuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulacion_historial_estados
    ADD CONSTRAINT "postulacion_historial_estados_cambiadoPorUsuarioId_fkey" FOREIGN KEY ("cambiadoPorUsuarioId") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: postulacion_historial_estados postulacion_historial_estados_postulacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulacion_historial_estados
    ADD CONSTRAINT "postulacion_historial_estados_postulacionId_fkey" FOREIGN KEY ("postulacionId") REFERENCES public.postulaciones(id) ON DELETE CASCADE;


--
-- Name: postulaciones postulaciones_cvArchivoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones
    ADD CONSTRAINT "postulaciones_cvArchivoId_fkey" FOREIGN KEY ("cvArchivoId") REFERENCES public.archivos(id) ON DELETE SET NULL;


--
-- Name: postulaciones postulaciones_ofertaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones
    ADD CONSTRAINT "postulaciones_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES public.ofertas(id) ON DELETE CASCADE;


--
-- Name: postulaciones postulaciones_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.postulaciones
    ADD CONSTRAINT "postulaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: solicitudes_empresa solicitudes_empresa_empresaIdCreada_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_empresa
    ADD CONSTRAINT "solicitudes_empresa_empresaIdCreada_fkey" FOREIGN KEY ("empresaIdCreada") REFERENCES public.empresas(id) ON DELETE SET NULL;


--
-- Name: solicitudes_empresa solicitudes_empresa_revisadaPorUsuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_empresa
    ADD CONSTRAINT "solicitudes_empresa_revisadaPorUsuarioId_fkey" FOREIGN KEY ("revisadaPorUsuarioId") REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: solicitudes_reclutador solicitudes_reclutador_empresaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_reclutador
    ADD CONSTRAINT "solicitudes_reclutador_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

