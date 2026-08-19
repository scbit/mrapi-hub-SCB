# MR API HUB v0.1

Base del producto vendible **MR API HUB** (CRM + HUB + BANDEJA). Primer tenant: **SCB**. Deployment previsto: `mrapi-hub-scb`.

## Stack

- Cloud Run
- Docker
- Node.js 22 / Express
- Firestore
- Google Cloud Storage
- Secret Manager (para secretos de runtime)

## Arranque local

```bash
cp .env.example .env
# cargar variables en el shell; no commitear .env
npm install
npm start
```

## Docker

```bash
docker build -t mrapi-hub .
docker run --rm -p 8080:8080 \
  -e MRAPI_TENANT_ID=scb \
  -e MRAPI_SESSION_SECRET='...' \
  -e MRAPI_CRM_DB=bscrmscb \
  -e MRAPI_INBOX_DB=bsscb \
  mrapi-hub
```

## Endpoints v0.1

- `GET /health`
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/hub/config`
- `GET /api/inbox/conversations?limit=50&cursor=...`
- `GET /api/inbox/conversations/by-phone?phone=...`
- `GET /api/crm/contacts/:id`
- `GET /api/crm/deals/:id`

Los endpoints protegidos usan `Authorization: Bearer <token>`.

## Seguridad

El login v0.1 mantiene compatibilidad temporal con los usuarios existentes de SCB, cuyo CRM actual compara passwords almacenados en texto plano. No se replica ninguna credencial en este proyecto. La siguiente migración debe convertir passwords a hash y eliminar esa deuda.

## Estado

Esta entrega es el **núcleo nuevo ejecutable**, no la migración completa de las ~29k líneas heredadas. Los tres ZIP originales quedan como referencia funcional y se portan módulo por módulo.
