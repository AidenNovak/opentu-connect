#!/bin/sh
set -eu

deploy_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
compose_env=${1:-"$deploy_dir/.env.beta"}

fail() {
  printf '%s\n' "$1" >&2
  exit 2
}

value_from_file() {
  file=$1
  key=$2
  value=$(sed -n "s/^$key=//p" "$file" | tail -n 1)
  [ -n "$value" ] || fail "$key is required in $file"
  printf '%s' "$value"
}

optional_value_from_file() {
  file=$1
  key=$2
  sed -n "s/^$key=//p" "$file" | tail -n 1
}

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

assert_digest() {
  printf '%s' "$1" | grep -Eq '^(sha256:|.+@sha256:)[0-9a-f]{64}$' ||
    fail "MEIMAOBING_IMAGE_GATEWAY_IMAGE must be content-addressed, not a tag"
}

[ -f "$compose_env" ] || fail "Compose environment file is missing: $compose_env"

secrets_dir=$(value_from_file "$compose_env" BETA_SECRETS_DIR)
gateway_image=$(value_from_file "$compose_env" MEIMAOBING_IMAGE_GATEWAY_IMAGE)
gateway_enabled=$(value_from_file "$compose_env" MEIMAOBING_IMAGE_GATEWAY_ENABLED)
gateway_store_profile=$(optional_value_from_file "$compose_env" MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE)
[ -n "$gateway_store_profile" ] ||
  fail 'MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE is required'
gateway_secret="$secrets_dir/image-gateway.env"
broker_secret="$secrets_dir/inference-broker.env"

case "$gateway_enabled" in
  true|false) ;;
  *) fail 'MEIMAOBING_IMAGE_GATEWAY_ENABLED must be true or false' ;;
esac
printf '%s' "$gateway_store_profile" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' ||
  fail 'MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE must be an environment profile name'
[ -f "$gateway_secret" ] || fail "Gateway secret file is missing: $gateway_secret"
[ -f "$broker_secret" ] || fail "Broker secret file is missing: $broker_secret"

mode=$(file_mode "$gateway_secret")
case "$mode" in
  400|600) ;;
  *) fail "Gateway secret file must be mode 0400 or 0600: $gateway_secret" ;;
esac

mode=$(file_mode "$broker_secret")
case "$mode" in
  400|600) ;;
  *) fail "Broker secret file must be mode 0400 or 0600: $broker_secret" ;;
esac

for key in \
  MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET \
  MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET \
  MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET \
  MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET; do
  secret=$(value_from_file "$gateway_secret" "$key")
  [ "${#secret}" -ge 32 ] || fail "$key must contain at least 32 characters"
done

gateway_principal_secret=$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET)
broker_image_principal_secret=$(value_from_file "$broker_secret" INFERENCE_BROKER_IMAGE_PRINCIPAL_HMAC_SECRET)
[ "${#broker_image_principal_secret}" -ge 32 ] ||
  fail "INFERENCE_BROKER_IMAGE_PRINCIPAL_HMAC_SECRET must contain at least 32 characters"
[ "$gateway_principal_secret" = "$broker_image_principal_secret" ] ||
  fail "Gateway and Broker image principal secrets must match"

if grep -Eqi 'replace-with|changeme|example\.com' "$gateway_secret"; then
  fail "Gateway secret file still contains an example or placeholder value"
fi

assert_https_origin() {
  key=$1
  value=$2
  printf '%s' "$value" | grep -Eq '^https://[^/:?#]+$' ||
    fail "$key must be an HTTPS origin with no path, port, or query"
}

origin=$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN)
assert_https_origin MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN "$origin"
issuer=$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER)
assert_https_origin MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER "$issuer"
top_up_url=$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL)
printf '%s' "$top_up_url" | grep -Eq '^https://[^[:space:]]+$' ||
  fail 'MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL must be an HTTPS URL'

[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE)" = "true" ] ||
  fail "MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE must be true in beta"
client_id=$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID)
[ "${#client_id}" -ge 8 ] ||
  fail "MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID is required"
[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL)" = "http://inference-broker:8080" ] ||
  fail "Gateway must use the private Inference Broker origin"
[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL)" = "http://beta-better-auth-center:8080/internal/v1/principal-sessions" ] ||
  fail "Gateway must use the private Beta account-center epoch verifier"
[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT)" = "image" ] ||
  fail "Gateway epoch verifier product must remain image"
[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET)" != "$gateway_principal_secret" ] ||
  fail "Gateway epoch verifier secret must differ from the Broker principal secret"
[ "$(value_from_file "$gateway_secret" MEIMAOBING_IMAGE_GATEWAY_ENABLED)" = "$gateway_enabled" ] ||
  fail "Gateway feature gate must match the Compose environment"

assert_digest "$gateway_image"
docker image inspect "$gateway_image" >/dev/null
docker network inspect meimaobing-beta-internal >/dev/null
docker compose --env-file "$compose_env" -f "$deploy_dir/compose.beta.yml" config --quiet

nginx_snippet="$deploy_dir/nginx/meimaobing-image-gateway.location.conf"
[ -f "$nginx_snippet" ] || fail "Nginx location snippet is missing"
grep -q 'location \^~ /auth/meimaobing/' "$nginx_snippet" ||
  fail "Nginx auth route is missing"
grep -q 'proxy_intercept_errors on;' "$nginx_snippet" ||
  fail "Nginx auth route must intercept browser OIDC upstream failures"
grep -q 'error_page 429 = @meimaobing_image_login_rate_limited;' "$nginx_snippet" ||
  fail "Nginx auth route must keep login throttling in the shared account center"
grep -q 'error_page 500 502 503 504 = @meimaobing_image_login_unavailable;' "$nginx_snippet" ||
  fail "Nginx auth route must keep login failures in the shared account center"
grep -q 'set \$meimaobing_auth_origin' "$nginx_snippet" ||
  fail "Nginx auth route must take the OIDC issuer from a replaceable origin variable"
grep -q 'return 302 \$meimaobing_auth_origin/portal/login?error=login_rate_limited;' "$nginx_snippet" ||
  fail "Nginx auth route must keep login throttling in the shared account center"
grep -q 'return 302 \$meimaobing_auth_origin/portal/login?error=login_unavailable;' "$nginx_snippet" ||
  fail "Nginx auth route must keep login failures in the shared account center"
grep -q 'location = /meimaobing/account' "$nginx_snippet" ||
  fail "Nginx account route is missing"
grep -q 'location \^~ /meimaobing/v1/' "$nginx_snippet" ||
  fail "Nginx image route is missing"
grep -q 'proxy_set_header Origin \$http_origin' "$nginx_snippet" ||
  fail "Nginx must preserve Origin"

nginx_site="$deploy_dir/nginx/meimaobing-image-beta.conf"
[ -f "$nginx_site" ] || fail "Image Beta Nginx site template is missing"
grep -q 'server_name ' "$nginx_site" ||
  fail "Image Nginx site must declare a public server_name"
grep -q 'root /opt/meimaobing-beta/image-web/current;' "$nginx_site" ||
  fail "Image Beta Nginx site must serve the versioned static application"
grep -q 'include /etc/nginx/snippets/meimaobing-image-gateway.location.conf;' "$nginx_site" ||
  fail "Image Beta Nginx site must include the same-origin gateway routes"
grep -q 'Content-Security-Policy' "$nginx_site" ||
  fail "Image Beta Nginx site must retain the application CSP"
grep -q 'location = /sw.js' "$nginx_site" ||
  fail "Image Beta Nginx site must keep the service worker origin-fresh"

printf '%s\n' "expected OIDC callback: ${origin}/auth/meimaobing/callback"
printf '%s\n' "managed-image gateway configuration passed for Store profile: $gateway_store_profile"
