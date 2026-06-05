#!/usr/bin/env bash
# E2E проверка файлового хранилища 6.3: upload -> download -> delete через
# Edge Function `nextcloud` с настоящим JWT существующего пользователя (HS256,
# подпись секретом локального Supabase). Проверяет всю цепочку: RLS + WebDAV.
#
# upload — БИНАРНЫЙ протокол (стрим тела + метаданные в заголовках x-*).
# Тестируем И маленький, И большой (25МБ) файл: большой раньше валил worker
# Edge Function по памяти (base64-буферизация) — теперь должен пройти стримом.
# Только чтение конфигов + временные тестовые файлы, которые сам же удаляет.
set -euo pipefail
SUPA=/srv/supabase-src/docker
FN=http://localhost:8000/functions/v1/nextcloud

JWT_SECRET="$(grep '^JWT_SECRET=' "$SUPA/.env" | cut -d= -f2-)"
[ -n "$JWT_SECRET" ] || { echo "NO JWT_SECRET"; exit 1; }

# взять approved-владельца проекта (гарантирован доступ + is_approved)
read -r UID_ PID_ <<EOF
$(docker exec -i supabase-db psql -U postgres -d postgres -At -F' ' -c \
"SELECT p.owner_id, p.id FROM projects p JOIN profiles pr ON pr.id=p.owner_id WHERE pr.approved=true LIMIT 1;")
EOF
echo "user=$UID_ project=$PID_"
[ -n "$UID_" ] && [ -n "$PID_" ] || { echo "NO TEST USER/PROJECT"; exit 1; }

# подписать JWT (python3)
JWT="$(python3 - "$JWT_SECRET" "$UID_" <<'PY'
import hmac,hashlib,base64,json,sys,time
secret,uid=sys.argv[1],sys.argv[2]
b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
n=int(time.time())
p=b(json.dumps({"sub":uid,"role":"authenticated","aud":"authenticated","iat":n,"exp":n+3600}).encode())
s=b(hmac.new(secret.encode(),h+b'.'+p,hashlib.sha256).digest())
print((h+b'.'+p+b'.'+s).decode())
PY
)"
AUTH="Authorization: Bearer $JWT"

# upload через бинарный протокол: $1=путь файла, $2=имя, $3=mime; печатает file_id
up(){
  local path="$1" name="$2" mime="$3"
  curl -s -m 120 -X POST "$FN" \
    -H "$AUTH" \
    -H "Content-Type: application/octet-stream" \
    -H "x-action: upload" \
    -H "x-project-id: $PID_" \
    -H "x-filename: $name" \
    -H "x-mime-type: $mime" \
    -H "x-file-size: $(stat -c%s "$path")" \
    --data-binary @"$path"
}

FAIL=0

echo "===== UPLOAD small (text) ====="
printf 'nextcloud e2e %s' "$(date -u +%FT%TZ)" > /tmp/small.txt
RS="$(up /tmp/small.txt e2e_small.txt text/plain)"; echo "$RS"
FID_S="$(echo "$RS" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("file",{}).get("id",""))' 2>/dev/null || true)"
[ -n "$FID_S" ] && echo "small OK id=$FID_S" || { echo "SMALL UPLOAD FAILED"; FAIL=1; }

echo "===== UPLOAD large (25MB) — раньше валил worker по памяти ====="
dd if=/dev/urandom of=/tmp/big.bin bs=1M count=25 status=none
RL="$(up /tmp/big.bin e2e_big.bin application/octet-stream)"; echo "$RL"
FID_L="$(echo "$RL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("file",{}).get("id",""))' 2>/dev/null || true)"
SZ_L="$(echo "$RL" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("file",{}).get("file_size",""))' 2>/dev/null || true)"
[ -n "$FID_L" ] && echo "large OK id=$FID_L file_size=$SZ_L (ожидаем 26214400)" || { echo "LARGE UPLOAD FAILED"; FAIL=1; }

echo "===== DOWNLOAD large -> проверка размера ====="
if [ -n "$FID_L" ]; then
  curl -s -m 120 -X POST "$FN" -H "$AUTH" -H "Content-Type: application/json" \
    --data "{\"action\":\"download\",\"id\":\"$FID_L\"}" -o /tmp/big_dl.bin -w '[download HTTP %{http_code}]\n'
  echo "downloaded bytes=$(stat -c%s /tmp/big_dl.bin) (ожидаем 26214400)"
  cmp -s /tmp/big.bin /tmp/big_dl.bin && echo "content_match=TRUE" || { echo "content_match=FALSE"; FAIL=1; }
fi

echo "===== CLEANUP (delete both) ====="
for fid in "$FID_S" "$FID_L"; do
  [ -n "$fid" ] && curl -s -m 30 -X POST "$FN" -H "$AUTH" -H "Content-Type: application/json" \
    --data "{\"action\":\"delete\",\"id\":\"$fid\"}" -w ' [delete HTTP %{http_code}]\n'
done

rm -f /tmp/small.txt /tmp/big.bin /tmp/big_dl.bin
[ "$FAIL" = 0 ] && echo "E2E_PASS" || echo "E2E_FAIL"
