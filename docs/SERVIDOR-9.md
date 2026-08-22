# servidor-9

## Bandeja

- Corrige filtro server-side por vendedor para datos históricos:
  - soporta `ownerEmail` con email completo
  - soporta `ownerEmail` con usuario corto, por ejemplo `avera`
- Mantiene paginación de 50 dentro del vendedor seleccionado.

## Seguridad operativa

- Sigue sin fallback masivo.
- Para permisos de líderes se usan alias solo mientras entren en el límite seguro de `in` de Firestore; si no, exige vendedor explícito.
