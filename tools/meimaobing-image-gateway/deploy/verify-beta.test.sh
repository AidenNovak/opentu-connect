#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
gateway_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM

needle='truthtruth'
needle="${needle}.co"
if grep -Rqi "$needle" "$gateway_dir" --exclude='verify-beta.test.sh'; then
  printf '%s\n' 'gateway files must not pin the copied test public hostname' >&2
  exit 1
fi

fake_bin="$temp_dir/bin"
secrets_dir="$temp_dir/secrets"
mkdir -p "$fake_bin" "$secrets_dir"

printf '%s\n' \
  '#!/bin/sh' \
  'set -eu' \
  'case "$1" in' \
  '  image|network|compose) exit 0 ;;' \
  '  *) exit 1 ;;' \
  'esac' >"$fake_bin/docker"
chmod 700 "$fake_bin/docker"

image_secret='image-principal-secret-for-gateway-verification-00001'
printf '%s\n' \
  'MEIMAOBING_IMAGE_GATEWAY_PUBLIC_ORIGIN=https://image.example.test' \
  'MEIMAOBING_IMAGE_GATEWAY_COOKIE_SECURE=true' \
  'MEIMAOBING_IMAGE_GATEWAY_OIDC_ISSUER=https://auth.example.test' \
  'MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_ID=meimaobing-image-gateway' \
  'MEIMAOBING_IMAGE_GATEWAY_OIDC_CLIENT_SECRET=image-gateway-client-secret-for-verification-001' \
  'MEIMAOBING_IMAGE_GATEWAY_SESSION_SECRET=image-gateway-session-secret-for-verification-001' \
  "MEIMAOBING_IMAGE_GATEWAY_PRINCIPAL_HMAC_SECRET=$image_secret" \
  'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_URL=http://beta-better-auth-center:8080/internal/v1/principal-sessions' \
  'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_PRODUCT=image' \
  'MEIMAOBING_IMAGE_GATEWAY_AUTH_EPOCH_VERIFIER_SECRET=image-epoch-verifier-secret-for-verification-0001' \
  'MEIMAOBING_IMAGE_GATEWAY_BROKER_BASE_URL=http://inference-broker:8080' \
  'MEIMAOBING_IMAGE_GATEWAY_ENABLED=false' \
  'MEIMAOBING_IMAGE_GATEWAY_TOP_UP_URL=https://store.example.test/user/recharge/index' >"$secrets_dir/image-gateway.env"
printf '%s\n' \
  "INFERENCE_BROKER_IMAGE_PRINCIPAL_HMAC_SECRET=$image_secret" >"$secrets_dir/inference-broker.env"
chmod 600 "$secrets_dir/image-gateway.env" "$secrets_dir/inference-broker.env"

compose_env="$temp_dir/.env.beta"
printf '%s\n' \
  "BETA_SECRETS_DIR=$secrets_dir" \
  'MEIMAOBING_IMAGE_GATEWAY_IMAGE=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  'MEIMAOBING_IMAGE_GATEWAY_ENABLED=false' \
  'MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=isolated-test' >"$compose_env"

PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null

sed -i.bak 's/image-principal-secret-for-gateway-verification-00001/other-image-principal-secret-for-gateway-verification/' "$secrets_dir/image-gateway.env"
if PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null 2>&1; then
  printf '%s\n' 'verify-beta accepted mismatched gateway and Broker image secrets' >&2
  exit 1
fi

sed -i.bak "s/other-image-principal-secret-for-gateway-verification/$image_secret/" "$secrets_dir/image-gateway.env"
sed -i.bak 's#https://image.example.test#http://image.example.test#' "$secrets_dir/image-gateway.env"
if PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null 2>&1; then
  printf '%s\n' 'verify-beta accepted a non-HTTPS public origin' >&2
  exit 1
fi

sed -i.bak 's#http://image.example.test#https://image.example.test#' "$secrets_dir/image-gateway.env"
sed -i.bak 's#https://store.example.test/user/recharge/index#http://store.example.test/user/recharge/index#' "$secrets_dir/image-gateway.env"
if PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null 2>&1; then
  printf '%s\n' 'verify-beta accepted a non-HTTPS Store destination' >&2
  exit 1
fi

sed -i.bak 's#http://store.example.test/user/recharge/index#https://store.example.test/user/recharge/index#' "$secrets_dir/image-gateway.env"
sed -i.bak 's/MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=isolated-test/MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=/' "$compose_env"
if PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null 2>&1; then
  printf '%s\n' 'verify-beta accepted an empty Store profile' >&2
  exit 1
fi

sed -i.bak 's/MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=/MEIMAOBING_IMAGE_GATEWAY_STORE_INGRESS_PROFILE=isolated-test/' "$compose_env"
sed -i.bak 's/MEIMAOBING_IMAGE_GATEWAY_ENABLED=false/MEIMAOBING_IMAGE_GATEWAY_ENABLED=true/' "$compose_env"
if PATH="$fake_bin:$PATH" "$script_dir/verify-beta.sh" "$compose_env" >/dev/null 2>&1; then
  printf '%s\n' 'verify-beta accepted a mismatched Compose and gateway feature gate' >&2
  exit 1
fi

printf '%s\n' 'managed-image gateway verifier test passed'
