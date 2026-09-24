# Postman / Insomnia collection

`lobster.postman_collection.json` is an importable client for the Lobster BFF. It
is generated from `../openapi/lobster.yaml`, which is the source of truth. Do not
hand-edit the collection; regenerate it from the spec.

## Import

Postman: File, Import, drop in `lobster.postman_collection.json`, then import
`lobster.postman_environment.json` and select it as the active environment.

Insomnia imports both the OpenAPI file and this Postman collection directly
(Import, then pick the file).

## Set your token

Requests inherit an `x-lobster-token` header from the collection, wired to the
`{{apiKey}}` variable. The environment ships with `apiKey` empty. Paste your token
into the environment's `apiKey` current value in your own client. Never commit a
real token: the file stays empty in git. The public reads (`/health`, `/ttl`, the
Allbridge routes) need no token.

`baseUrl` defaults to the deployed relay. Point it at `http://localhost:8787` to
hit a local dev server.

## Regenerate after changing the spec

```
npx --yes openapi-to-postmanv2 \
  -s lobster-docs/openapi/lobster.yaml \
  -o lobster-docs/postman/lobster.postman_collection.json \
  -p -O folderStrategy=Tags,includeAuthInfoInExample=false,alwaysInheritAuthentication=true
```

To catch a stale collection in CI, regenerate to a temp file and diff:

```
npx --yes openapi-to-postmanv2 -s lobster-docs/openapi/lobster.yaml -o /tmp/c.json \
  -p -O folderStrategy=Tags,includeAuthInfoInExample=false,alwaysInheritAuthentication=true
git diff --no-index --exit-code lobster-docs/postman/lobster.postman_collection.json /tmp/c.json
```
