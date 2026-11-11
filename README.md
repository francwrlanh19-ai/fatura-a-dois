# Fatura a dois

App de celular para dividir a fatura do cartão Nubank entre as pessoas que usam o cartão.

**Abrir o app:** https://francwrlanh19-ai.github.io/fatura-a-dois/

- Sobe o CSV da fatura (no app do Nubank: fatura → exportar).
- O app separa sozinho o que já conhece e pergunta só as compras novas.
- Cada pessoa tem o total dela, quanto falta devolver e um resumo pra copiar e mandar.
- Aba **Gráficos**: parcelas que ainda vão cair, histórico das faturas, gastos por tipo e Uber por semana.

Sem o link de compartilhamento, os dados ficam só no celular de quem usa, dentro do navegador. Use **Backup** pra guardar um arquivo com tudo e restaurar em outro celular.

## Ver a mesma fatura em mais de um celular

Com o link de compartilhamento (ele termina em `#k=` e uma senha), qualquer celular mostra a mesma fatura. Os dados ficam no arquivo `dados.json` da branch `dados`, trancados com a senha do link: sem o link, ninguém consegue ler.

- Quem só tem o link, só vê. A fatura se atualiza sozinha.
- Para editar, cole uma chave do GitHub em **Compartilhamento → Chave de edição**. A chave fica só no celular de quem edita.
- Para criar a chave, use github.com/settings/personal-access-tokens/new. Dê acesso só a este repositório, com **Contents: Read and write**.
