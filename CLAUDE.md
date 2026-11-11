# Fatura a dois: como manter e publicar

- App estático: `index.html` (HTML, CSS e JS num arquivo só), `manifest.webmanifest` e ícones. Publicado pelo GitHub Pages a partir da branch `main`, na raiz. Publicar = commit + push na `main`; o Pages atualiza sozinho em cerca de 1 minuto.
- Os dados de quem usa ficam no navegador (localStorage, chave `fatura-a-dois:v1`). Nunca commitar CSV de fatura nem arquivos de backup: têm dados pessoais (o `.gitignore` já bloqueia).
- Chaves do banco local: `faturas/AAAA-MM-DD`, `regras/<slug>`, `config/pessoas`. Backup: `{ app: "fatura-a-dois", versao: 1, exportadoEm, dados: { caminho: documento } }`. Qualquer mudança de formato precisa continuar lendo backups antigos.
- Antes de publicar: servir a pasta com `python3 -m http.server`, abrir no Playwright em largura de celular (390 px), restaurar um backup de teste, subir um CSV no formato do Nubank (`date,title,amount`), separar uma compra, recarregar a página e conferir que nada se perdeu e que o console não tem erros. Usar só dados inventados nos testes.
- Textos do app em português do Brasil, falando com quem usa.
