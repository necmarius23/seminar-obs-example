#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SHOP_URL:-http://localhost:8080}"
THINK_MIN="${THINK_MIN:-1}"   # min seconds between actions
THINK_MAX="${THINK_MAX:-4}"   # max seconds between actions

USERS=("alice" "bob" "carol" "dave" "eve" "frank" "grace" "henry")
CATEGORIES=("Electronics" "Furniture" "Accessories" "Stationery")

# ── helpers ──────────────────────────────────────────────────────────────────

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
think() { sleep $(( RANDOM % (THINK_MAX - THINK_MIN + 1) + THINK_MIN )); }
rand_element() { local arr=("$@"); echo "${arr[RANDOM % ${#arr[@]}]}"; }

get() {
  curl -sf --max-time 5 "$BASE_URL$1" 2>/dev/null || true
}
post() {
  curl -sf --max-time 5 -X POST -H "Content-Type: application/json" \
       -d "$2" "$BASE_URL$1" 2>/dev/null || true
}
patch_req() {
  curl -sf --max-time 5 -X PATCH "$BASE_URL$1" 2>/dev/null || true
}
delete_req() {
  curl -sf --max-time 5 -X DELETE "$BASE_URL$1" 2>/dev/null || true
}

# ── wait for the shop to be healthy ──────────────────────────────────────────

wait_for_shop() {
  log "Waiting for shop at $BASE_URL ..."
  local attempts=0
  until curl -sf --max-time 3 "$BASE_URL/actuator/health" | grep -q '"UP"' 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ $attempts -ge 60 ]; then
      log "ERROR: shop never became healthy after 60 attempts, giving up"
      exit 1
    fi
    sleep 3
  done
  log "Shop is healthy — starting traffic simulation"
}

# ── load product catalogue once ──────────────────────────────────────────────

PRODUCT_IDS=()
PRODUCT_JSON=""

refresh_products() {
  PRODUCT_JSON=$(get "/api/products")
  if [ -n "$PRODUCT_JSON" ]; then
    mapfile -t PRODUCT_IDS < <(echo "$PRODUCT_JSON" | jq -r '.[].id')
  fi
}

# ── user behaviour flows ──────────────────────────────────────────────────────

# Browse: list catalogue, optionally filter by category, view a product detail
flow_browse() {
  local user=$1
  log "[$user] browsing catalogue"

  # Sometimes filter by category
  if [ $(( RANDOM % 3 )) -eq 0 ]; then
    local cat; cat=$(rand_element "${CATEGORIES[@]}")
    get "/api/products?category=$cat" > /dev/null
    log "[$user] filtered by $cat"
  else
    get "/api/products" > /dev/null
  fi

  think

  if [ ${#PRODUCT_IDS[@]} -gt 0 ]; then
    local pid; pid=$(rand_element "${PRODUCT_IDS[@]}")
    get "/api/products/$pid" > /dev/null
    log "[$user] viewed product $pid"
  fi
}

# Shop: add 1-3 products to cart, then checkout
flow_shop() {
  local user=$1
  local num_items=$(( RANDOM % 3 + 1 ))
  log "[$user] shopping — adding $num_items item(s)"

  # Clear any stale cart first
  delete_req "/api/cart/$user" > /dev/null

  local added=0
  for (( i=0; i<num_items; i++ )); do
    [ ${#PRODUCT_IDS[@]} -eq 0 ] && break
    local pid; pid=$(rand_element "${PRODUCT_IDS[@]}")
    local qty=$(( RANDOM % 3 + 1 ))
    local resp
    resp=$(post "/api/cart/$user/items" "{\"productId\": $pid, \"quantity\": $qty}")
    if [ -n "$resp" ]; then
      added=$(( added + 1 ))
      log "[$user] added product $pid ×$qty to cart"
    fi
    think
  done

  if [ $added -gt 0 ]; then
    log "[$user] checking out"
    local order
    order=$(post "/api/orders/user/$user/checkout" "{}")
    local order_id
    order_id=$(echo "$order" | jq -r '.id // empty' 2>/dev/null || true)

    if [ -n "$order_id" ]; then
      log "[$user] order $order_id created — confirming"
      sleep 1
      patch_req "/api/orders/$order_id/status?status=CONFIRMED" > /dev/null

      # Occasionally advance the order further
      if [ $(( RANDOM % 2 )) -eq 0 ]; then
        sleep $(( RANDOM % 3 + 1 ))
        patch_req "/api/orders/$order_id/status?status=SHIPPED" > /dev/null
        log "[$user] order $order_id shipped"

        if [ $(( RANDOM % 3 )) -eq 0 ]; then
          sleep $(( RANDOM % 3 + 1 ))
          patch_req "/api/orders/$order_id/status?status=DELIVERED" > /dev/null
          log "[$user] order $order_id delivered"
        fi
      fi
    else
      log "[$user] checkout failed (empty/out-of-stock)"
    fi
  fi
}

# Order history: list orders, view one in detail
flow_orders() {
  local user=$1
  log "[$user] checking order history"
  local orders
  orders=$(get "/api/orders/user/$user")
  local order_id
  order_id=$(echo "$orders" | jq -r '.[0].id // empty' 2>/dev/null || true)
  if [ -n "$order_id" ]; then
    think
    get "/api/orders/$order_id" > /dev/null
    log "[$user] viewed order $order_id"
  fi
}

# Cancel: add something, then cancel the order
flow_cancel() {
  local user=$1
  [ ${#PRODUCT_IDS[@]} -eq 0 ] && return
  local pid; pid=$(rand_element "${PRODUCT_IDS[@]}")
  log "[$user] will add then cancel"
  post "/api/cart/$user/items" "{\"productId\": $pid, \"quantity\": 1}" > /dev/null
  local order
  order=$(post "/api/orders/user/$user/checkout" "{}")
  local order_id
  order_id=$(echo "$order" | jq -r '.id // empty' 2>/dev/null || true)
  if [ -n "$order_id" ]; then
    sleep 1
    patch_req "/api/orders/$order_id/status?status=CANCELLED" > /dev/null
    log "[$user] order $order_id cancelled"
  fi
}

# Error: request non-existent products and orders → 404 ResourceNotFoundException
flow_not_found() {
  local user=$1
  local fake_id=$(( RANDOM % 9000 + 1000 ))
  log "[$user] ERROR FLOW — fetching non-existent product $fake_id"
  curl -s --max-time 5 "$BASE_URL/api/products/$fake_id" > /dev/null || true
  think
  log "[$user] ERROR FLOW — fetching non-existent order $fake_id"
  curl -s --max-time 5 "$BASE_URL/api/orders/$fake_id" > /dev/null || true
}

# Error: checkout with an empty cart → 400 / business exception
flow_empty_checkout() {
  local user=$1
  log "[$user] ERROR FLOW — checking out empty cart"
  # Ensure cart is empty first
  delete_req "/api/cart/$user" > /dev/null
  # Attempt checkout — should fail and log an error server-side
  curl -s --max-time 5 -X POST "$BASE_URL/api/orders/user/$user/checkout" \
       -H "Content-Type: application/json" > /dev/null || true
}

# Error: try to update a non-existent cart item → 404
flow_bad_cart_item() {
  local user=$1
  log "[$user] ERROR FLOW — updating non-existent cart item"
  local fake_item=$(( RANDOM % 9000 + 1000 ))
  curl -s --max-time 5 -X PUT \
       -H "Content-Type: application/json" \
       -d '{"quantity": 2}' \
       "$BASE_URL/api/cart/$user/items/$fake_item" > /dev/null || true
}

# Error: try to transition an order to an invalid status (transition from DELIVERED)
flow_bad_status_transition() {
  local user=$1
  # First create and deliver an order
  [ ${#PRODUCT_IDS[@]} -eq 0 ] && return
  local pid; pid=$(rand_element "${PRODUCT_IDS[@]}")
  post "/api/cart/$user/items" "{\"productId\": $pid, \"quantity\": 1}" > /dev/null
  local order
  order=$(post "/api/orders/user/$user/checkout" "{}")
  local order_id
  order_id=$(echo "$order" | jq -r '.id // empty' 2>/dev/null || true)
  [ -z "$order_id" ] && return
  patch_req "/api/orders/$order_id/status?status=CONFIRMED" > /dev/null
  patch_req "/api/orders/$order_id/status?status=SHIPPED"    > /dev/null
  patch_req "/api/orders/$order_id/status?status=DELIVERED"  > /dev/null
  sleep 1
  # Now try to cancel an already-delivered order → should error
  log "[$user] ERROR FLOW — cancelling delivered order $order_id"
  curl -s --max-time 5 -X PATCH \
       "$BASE_URL/api/orders/$order_id/status?status=CANCELLED" > /dev/null || true
}

# ── simulate one user session ────────────────────────────────────────────────

simulate_user() {
  local user=$1
  # Weight: browse 30%, shop 30%, orders 10%, cancel 5%, errors 25%
  local roll=$(( RANDOM % 100 ))
  if   [ $roll -lt 30 ]; then flow_browse               "$user"
  elif [ $roll -lt 60 ]; then flow_shop                 "$user"
  elif [ $roll -lt 70 ]; then flow_orders               "$user"
  elif [ $roll -lt 75 ]; then flow_cancel               "$user"
  elif [ $roll -lt 85 ]; then flow_not_found            "$user"
  elif [ $roll -lt 92 ]; then flow_empty_checkout       "$user"
  elif [ $roll -lt 96 ]; then flow_bad_cart_item        "$user"
  else                        flow_bad_status_transition "$user"
  fi
}

# ── main loop ────────────────────────────────────────────────────────────────

wait_for_shop
refresh_products

# Re-fetch products every ~5 minutes in case stock changes
REFRESH_COUNTER=0

while true; do
  REFRESH_COUNTER=$(( REFRESH_COUNTER + 1 ))
  if [ $(( REFRESH_COUNTER % 30 )) -eq 0 ]; then
    refresh_products
  fi

  # Pick 1-3 concurrent users per wave
  local_wave=$(( RANDOM % 3 + 1 ))
  for (( w=0; w<local_wave; w++ )); do
    user=$(rand_element "${USERS[@]}")
    simulate_user "$user" &
  done
  wait

  think
done
