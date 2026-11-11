"""Tranca e destranca o dados.json do app Fatura a dois (mesmo formato do index.html).

Formato: { app, formato: 1, atualizadoEm, compactado: "gzip", kdf: {nome, iteracoes, sal}, iv, cifrado }
cifrado = AES-GCM-256( gzip( JSON {app, versao: 1, dados} ) ), chave = PBKDF2-SHA256(senha, sal, iteracoes).

Uso:
  python3 cifra.py trancar <senha> <entrada.json> <saida.json>   # entrada: backup do app ou {caminho: doc}
  python3 cifra.py abrir <senha> <arquivo.json>                    # imprime {caminho: doc}
"""
import base64, datetime, gzip, hashlib, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 100000


def _chave(senha, sal, iteracoes):
    return hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), sal, iteracoes, 32)


def trancar(dados, senha, sal=None, compactar=None):
    corpo = json.dumps({"app": "fatura-a-dois", "versao": 1, "dados": dados}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if compactar is None:
        compactar = len(corpo) > 400000  # igual ao app: só compacta quando fica grande
    sal = sal or os.urandom(16)
    iv = os.urandom(12)
    cif = AESGCM(_chave(senha, sal, ITER)).encrypt(iv, gzip.compress(corpo) if compactar else corpo, None)
    agora = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {"app": "fatura-a-dois", "formato": 1, "atualizadoEm": agora, "compactado": "gzip" if compactar else "nenhum",
            "kdf": {"nome": "PBKDF2-SHA256", "iteracoes": ITER, "sal": base64.b64encode(sal).decode()},
            "iv": base64.b64encode(iv).decode(), "cifrado": base64.b64encode(cif).decode()}


def abrir(arq, senha):
    sal = base64.b64decode(arq["kdf"]["sal"])
    corpo = AESGCM(_chave(senha, sal, int(arq["kdf"]["iteracoes"]))).decrypt(base64.b64decode(arq["iv"]), base64.b64decode(arq["cifrado"]), None)
    if arq.get("compactado") == "gzip":
        corpo = gzip.decompress(corpo)
    obj = json.loads(corpo.decode("utf-8"))
    assert obj.get("app") == "fatura-a-dois"
    return obj["dados"]


if __name__ == "__main__":
    acao, senha = sys.argv[1], sys.argv[2]
    if acao in ("trancar", "trancar-gzip"):
        entrada = json.load(open(sys.argv[3], encoding="utf-8"))
        dados = entrada["dados"] if isinstance(entrada, dict) and entrada.get("app") == "fatura-a-dois" and "dados" in entrada else entrada
        json.dump(trancar(dados, senha, compactar=True if acao == "trancar-gzip" else None), open(sys.argv[4], "w", encoding="utf-8"), ensure_ascii=False)
    elif acao == "abrir":
        print(json.dumps(abrir(json.load(open(sys.argv[3], encoding="utf-8")), senha), ensure_ascii=False))
    else:
        sys.exit("ação desconhecida: " + acao)
