#!/usr/bin/env bash
# Проверка project_payments: триггер paid_amount=SUM, RLS-изоляция, запрет записи в чужой проект.
set -euo pipefail
SUPA=/srv/supabase-src/docker
REST=http://localhost:8000/rest/v1
JWT_SECRET="$(grep '^JWT_SECRET=' "$SUPA/.env" | cut -d= -f2-)"
ANON="$(grep '^ANON_KEY=' "$SUPA/.env" | cut -d= -f2-)"

sign() {
  python3 - "$JWT_SECRET" "$1" <<'PY'
import hmac,hashlib,base64,json,sys,time
secret,uid=sys.argv[1],sys.argv[2]
b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode()); n=int(time.time())
p=b(json.dumps({"sub":uid,"role":"authenticated","aud":"authenticated","iat":n,"exp":n+3600}).encode())
s=b(hmac.new(secret.encode(),h+b'.'+p,hashlib.sha256).digest())
print((h+b'.'+p+b'.'+s).decode())
PY
}

read -r A B <<EOF
$(docker exec -i supabase-db psql -U postgres -d postgres -At -F' ' -c \
"SELECT id FROM public.profiles WHERE approved=true ORDER BY created_at LIMIT 2;" | tr '\n' ' ')
EOF
echo "A=$A B=$B"
[ -n "$A" ] && [ -n "$B" ] || { echo "NEED_TWO_APPROVED_USERS"; exit 1; }
JA="$(sign "$A")"; JB="$(sign "$B")"

echo "== A создаёт проект (paid_amount=0) =="
PID=$(curl -s -X POST "$REST/projects" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JA" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"$A\",\"name\":\"RLS payments selftest\",\"contract_sum\":100000,\"paid_amount\":0}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if isinstance(d,list) and d else "")')
echo "project id=$PID"; [ -n "$PID" ] || { echo "INSERT PROJECT FAILED"; exit 1; }

echo "== A добавляет платёж 40000 =="
curl -s -X POST "$REST/project_payments" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JA" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PID\",\"amount\":40000,\"paid_on\":\"2026-06-08\"}" -o /dev/null -w "POST платёж1: %{http_code}\n"

echo "== A добавляет платёж 10000 =="
curl -s -X POST "$REST/project_payments" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JA" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PID\",\"amount\":10000,\"paid_on\":\"2026-06-08\"}" -o /dev/null -w "POST платёж2: %{http_code}\n"

echo "== триггер: paid_amount должен стать 50000 =="
PA=$(docker exec -i supabase-db psql -U postgres -d postgres -At -c \
  "SELECT paid_amount::int FROM public.projects WHERE id='$PID';")
echo "paid_amount=$PA (ожидаем 50000)"

echo "== B НЕ видит платежи чужого проекта (RLS) =="
ROWS=$(curl -s "$REST/project_payments?project_id=eq.$PID&select=id" -H "apikey: $ANON" -H "Authorization: Bearer $JB" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else 'ERR')")
echo "B видит платежей: $ROWS (ожидаем 0)"

echo "== B НЕ может писать платёж в чужой проект (ожидаем 4xx) =="
WCODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$REST/project_payments" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JB" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PID\",\"amount\":999,\"paid_on\":\"2026-06-08\"}")
echo "B пишет платёж: HTTP $WCODE (ожидаем 401/403/4xx)"

echo "== anon НЕ видит платежей =="
AOUT=$(curl -s "$REST/project_payments?select=id" -H "apikey: $ANON" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else 'ERR')")
echo "anon видит платежей: $AOUT (ожидаем 0)"

echo "== cleanup (cascade удалит платежи) =="
curl -s -X DELETE "$REST/projects?id=eq.$PID" -H "apikey: $ANON" -H "Authorization: Bearer $JA" -o /dev/null -w "delete project: %{http_code}\n"

[ "$PA" = "50000" ] && [ "$ROWS" = "0" ] && [ "$AOUT" = "0" ] && [[ "$WCODE" =~ ^4 ]] \
  && echo "PAYMENTS_RLS_OK" || { echo "PAYMENTS_RLS_FAIL"; exit 1; }
