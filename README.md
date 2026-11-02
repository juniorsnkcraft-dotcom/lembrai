# Lembra Aí

App Android de lembretes com notificação, feito com Capacitor.

## Como baixar

Toda vez que algo é enviado para a branch `main`, o GitHub gera o app sozinho.
O arquivo fica em **Releases** → `LembraAi.apk`. Abra no celular Android e instale.

## O que o app faz

- Entende o que você escreve: *"pagar a luz amanhã às 9h"*, *"ligar pro cliente sexta 15h"*, *"tirar o bolo daqui a 40 min"*
- Notifica na hora, mesmo com o app fechado, com os botões **Feito ✓** e **+10 min**
- Organiza em Atrasados, Hoje, Amanhã, Próximos dias e Sem data
- Categorias, ⭐ importantes e detalhes em cada lembrete
- Tudo fica salvo no próprio celular

## Estrutura

- `www/`: a tela do app (HTML, CSS e JS)
- `src/native.js`: liga a tela aos recursos do Android (notificações, armazenamento)
- `assets/`: ícone e splash
- `.github/workflows/apk.yml`: monta o `.apk`
